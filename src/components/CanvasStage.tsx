'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '@/state/store';
import { layerRect, rectContains, snapPosition, type SnapResult } from '@/lib/geometry';
import { renderProject } from '@/lib/render';
import { assignPorts, cablingForLayer, cablingForProject, processorsRequired } from '@/lib/cabling';
import { findProcessor } from '@/lib/processors';
import { isAnySurfaceOpen, isTypingTarget } from '@/lib/surfaces';
import { isAnimated } from '@/lib/effects';
import { cachedLogos, loadLayerLogos } from '@/lib/logos';
import type { Layer } from '@/lib/types';
import Icon from './Icon';

interface View {
  /** Screen pixels per canvas pixel. */
  scale: number;
  x: number;
  y: number;
}

type Drag =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | {
      kind: 'layers';
      ids: string[];
      pointerStart: { x: number; y: number };
      origins: Map<string, { x: number; y: number }>;
    }
  | { kind: 'marquee'; start: { x: number; y: number }; current: { x: number; y: number } };

const MIN_SCALE = 0.005;
const MAX_SCALE = 8;

export default function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 0.2, x: 40, y: 40 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const dragRef = useRef<Drag>({ kind: 'none' });
  const spaceRef = useRef(false);
  const [snapGuides, setSnapGuides] = useState<SnapResult['guides'] | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // Bumped each animation frame to re-run the paint effect.
  const [frame, setFrame] = useState(0);
  const startedAt = useRef<number>(0);
  const [logoVersion, setLogoVersion] = useState(0);

  const canvas = useEditor((s) => s.canvas);
  const layers = useEditor((s) => s.layers);
  const selectedIds = useEditor((s) => s.selectedIds);
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const effect = useEditor((s) => s.effect);
  const cabling = useEditor((s) => s.cabling);
  const processorId = useEditor((s) => s.processorId);
  const customProcessors = useEditor((s) => s.customProcessors);

  /*
   * The signal overlay breaks into one chain per port, so it needs the same
   * run length the pick list uses. Recomputed only when the plan's inputs
   * change — this sits inside the render loop, which runs every frame while a
   * test pattern is playing.
   */
  const { runLengths, runLabels } = useMemo(() => {
    const processor = findProcessor(processorId, customProcessors);
    const lengths = new Map<string, number>();
    for (const layer of layers) {
      if (!layer.showSignalFlow) continue;
      lengths.set(layer.id, cablingForLayer(layer, cabling, processor).data.cabinetsPerRun);
    }
    // Ports are dealt out over every screen, not just the ones drawing their
    // run, or the labels on screen would disagree with the pick list.
    const plan = cablingForProject(layers, cabling, processor);
    const totalPixels = layers.reduce(
      (sum, l) => sum + l.cols * l.rows * l.spec.resolution.w * l.spec.resolution.h,
      0
    );
    const boxes = processorsRequired(totalPixels, plan.dataRuns, processor).count;
    const ports = assignPorts(plan.screens, processor, boxes);
    const labels = new Map<string, string[]>();
    for (const [id, list] of ports) labels.set(id, list.map((p) => p.label));
    return { runLengths: lengths, runLabels: labels };
  }, [layers, cabling, processorId, customProcessors]);
  const setSelection = useEditor((s) => s.setSelection);
  const toggleSelection = useEditor((s) => s.toggleSelection);
  const updateLayer = useEditor((s) => s.updateLayer);
  const moveLayerBy = useEditor((s) => s.moveLayerBy);
  const commit = useEditor((s) => s.commit);

  /** Screen coordinates -> canvas pixel coordinates. */
  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - view.x) / view.scale,
        y: (clientY - rect.top - view.y) / view.scale,
      };
    },
    [view]
  );

  const fitToCanvas = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const pad = 56;
    const scale = Math.min(
      (wrap.clientWidth - pad * 2) / canvas.width,
      (wrap.clientHeight - pad * 2) / canvas.height
    );
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    setView({
      scale: clamped,
      x: (wrap.clientWidth - canvas.width * clamped) / 2,
      y: (wrap.clientHeight - canvas.height * clamped) / 2,
    });
  }, [canvas.width, canvas.height]);

  // Keep the backing store matched to the element's CSS size and DPR.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: wrap.clientWidth, height: wrap.clientHeight });
    });
    observer.observe(wrap);
    setSize({ width: wrap.clientWidth, height: wrap.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fitToCanvas();
    // Only refit when the canvas dimensions themselves change.
  }, [fitToCanvas]);

  // Decode any logos, then repaint once they are ready.
  useEffect(() => {
    let cancelled = false;
    const withLogos = layers.filter((l) => l.logo);
    if (!withLogos.length) return;
    loadLayerLogos(withLogos).then(() => {
      if (!cancelled) setLogoVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [layers]);

  // A spinning centre image needs the clock too, not just a test pattern.
  const spinning = layers.some((l) => l.logoSpin && l.logo && l.visible);

  // Run the clock only while something is actually animating — and not at all
  // when the viewer has asked for reduced motion. The pattern still draws, it
  // just holds on its first frame rather than moving.
  useEffect(() => {
    if (!isAnimated(effect) && !spinning) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    startedAt.current = performance.now();
    const tick = () => {
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [effect, spinning]);

  // Paint.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(size.width * dpr);
    el.height = Math.round(size.height * dpr);
    const ctx = el.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    // Workspace backdrop, then the project in canvas space.
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, size.width, size.height);

    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24 / view.scale;
    ctx.fillStyle = canvas.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    renderProject(ctx, canvas, layers, {
      chrome: true,
      selectedIds,
      scale: view.scale,
      snapGuides,
      effect: isAnimated(effect) ? effect : undefined,
      timeMs: isAnimated(effect) || spinning ? performance.now() - startedAt.current : 0,
      logos: cachedLogos(layers),
      runLengths,
      runLabels,
    });

    // Canvas outline sits above everything so the frame is always readable.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1 / view.scale;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (marquee) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(56,189,248,0.12)';
      ctx.lineWidth = 1;
      const x = view.x + marquee.x * view.scale;
      const y = view.y + marquee.y * view.scale;
      ctx.fillRect(x, y, marquee.w * view.scale, marquee.h * view.scale);
      ctx.strokeRect(x, y, marquee.w * view.scale, marquee.h * view.scale);
      ctx.restore();
    }
  }, [canvas, layers, selectedIds, view, size, snapGuides, marquee, effect, frame, logoVersion, runLengths, runLabels, spinning]);

  const hitTest = useCallback(
    (point: { x: number; y: number }): Layer | null => {
      // Topmost layer wins, matching the layer panel order.
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (!layer.visible) continue;
        if (rectContains(layerRect(layer), point.x, point.y)) return layer;
      }
      return null;
    },
    [layers]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = toCanvas(e.clientX, e.clientY);

    const wantsPan = e.button === 1 || e.button === 2 || e.altKey || spaceRef.current;
    if (wantsPan) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y };
      return;
    }

    const hit = hitTest(point);
    if (!hit) {
      if (!e.shiftKey) setSelection([]);
      dragRef.current = { kind: 'marquee', start: point, current: point };
      return;
    }

    let ids = selectedIds;
    if (e.shiftKey) {
      toggleSelection(hit.id);
      ids = selectedIds.includes(hit.id) ? selectedIds.filter((i) => i !== hit.id) : [...selectedIds, hit.id];
    } else if (!selectedIds.includes(hit.id)) {
      setSelection([hit.id]);
      ids = [hit.id];
    }

    const movable = ids.filter((id) => !layers.find((l) => l.id === id)?.locked);
    if (!movable.length) return;

    commit();
    dragRef.current = {
      kind: 'layers',
      ids: movable,
      pointerStart: point,
      origins: new Map(movable.map((id) => {
        const l = layers.find((x) => x.id === id)!;
        return [id, { x: l.x, y: l.y }];
      })),
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toCanvas(e.clientX, e.clientY);
    setCursor(point);
    const drag = dragRef.current;

    if (drag.kind === 'pan') {
      setView((v) => ({
        ...v,
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
      }));
      return;
    }

    if (drag.kind === 'marquee') {
      dragRef.current = { ...drag, current: point };
      setMarquee({
        x: Math.min(drag.start.x, point.x),
        y: Math.min(drag.start.y, point.y),
        w: Math.abs(point.x - drag.start.x),
        h: Math.abs(point.y - drag.start.y),
      });
      return;
    }

    if (drag.kind !== 'layers') return;

    const dx = point.x - drag.pointerStart.x;
    const dy = point.y - drag.pointerStart.y;

    // Snap the primary layer, then carry the rest by the same delta so a
    // multi-selection keeps its relative layout.
    const primaryId = drag.ids[0];
    const primary = layers.find((l) => l.id === primaryId);
    if (!primary) return;
    const origin = drag.origins.get(primaryId)!;
    const proposed = { x: origin.x + dx, y: origin.y + dy };

    let resolved = { x: Math.round(proposed.x), y: Math.round(proposed.y) };
    if (snapEnabled && !e.ctrlKey && !e.metaKey) {
      const result = snapPosition(
        primary,
        proposed,
        layers.filter((l) => !drag.ids.includes(l.id) && l.visible),
        canvas,
        12 / view.scale,
        true
      );
      resolved = { x: result.x, y: result.y };
      setSnapGuides(result.guides.vertical.length || result.guides.horizontal.length ? result.guides : null);
    } else {
      setSnapGuides(null);
    }

    const appliedDx = resolved.x - origin.x;
    const appliedDy = resolved.y - origin.y;
    for (const id of drag.ids) {
      const start = drag.origins.get(id)!;
      updateLayer(id, { x: Math.round(start.x + appliedDx), y: Math.round(start.y + appliedDy) });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.kind === 'marquee' && marquee && (marquee.w > 4 || marquee.h > 4)) {
      const inside = layers
        .filter((l) => l.visible)
        .filter((l) => {
          const r = layerRect(l);
          return (
            r.x < marquee.x + marquee.w &&
            r.x + r.width > marquee.x &&
            r.y < marquee.y + marquee.h &&
            r.y + r.height > marquee.y
          );
        })
        .map((l) => l.id);
      setSelection(e.shiftKey ? [...new Set([...selectedIds, ...inside])] : inside);
    }
    dragRef.current = { kind: 'none' };
    setSnapGuides(null);
    setMarquee(null);
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.ctrlKey || e.metaKey || !e.shiftKey) {
      // Zoom about the pointer so the point under the cursor stays put.
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((v) => {
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        return {
          scale,
          x: px - ((px - v.x) / v.scale) * scale,
          y: py - ((py - v.y) / v.scale) * scale,
        };
      });
    } else {
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  };

  // Hold space to pan, the way every other canvas tool works.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    const clear = () => {
      spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // Arrow-key nudging.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // The nudge listener is on `window`, so without this an arrow key pressed
      // inside an open dialog moved the screens hidden behind it.
      if (isAnySurfaceOpen()) return;
      if (!selectedIds.length) return;
      const step = e.shiftKey ? 10 : 1;
      const map: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = map[e.key];
      if (!delta) return;
      e.preventDefault();
      commit();
      moveLayerBy(selectedIds, delta[0], delta[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, moveLayerBy, commit]);

  const zoomPercent = Math.round(view.scale * 100);

  return (
    <div className="stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="stage__canvas"
        /*
         * A drawing surface is not exempt from keyboard operability. Making it
         * a real focus stop gives the arrow-key nudging an owner — it was bound
         * to `window`, so nothing ever announced that it existed.
         */
        tabIndex={0}
        role="application"
        aria-label={
          layers.length
            ? `Canvas, ${canvas.width} by ${canvas.height} pixels, ${layers.length} screen${layers.length === 1 ? '' : 's'}. ` +
              `${selectedIds.length} selected. Arrow keys move the selection, shift for ten pixels.`
            : `Empty canvas, ${canvas.width} by ${canvas.height} pixels. Add a cabinet from the library to place a screen.`
        }
        style={{ width: size.width, height: size.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="stage__hud">
        <button type="button" onClick={fitToCanvas}>Fit</button>
        <button type="button" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale * 1.25) }))}>
          <Icon name="plus" />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale / 1.25) }))}>
          <Icon name="minus" />
        </button>
        <span className="stage__zoom">{zoomPercent < 1 ? view.scale.toFixed(3) : zoomPercent}%</span>
        <span className="stage__coords">
          {cursor ? `${Math.round(cursor.x)}, ${Math.round(cursor.y)} px` : `${canvas.width} × ${canvas.height}`}
        </span>
      </div>
      {!layers.length && (
        /* The only onboarding a professional will tolerate: passive, in the
           empty space, and gone the moment there is work on the canvas. */
        <div className="stage__empty">
          <p className="stage__empty-title">Nothing placed yet</p>
          <p>Pick a cabinet from the library on the left to drop your first screen.</p>
          <p className="stage__empty-hint">
            Then: drag to move · alt-drag to pan · scroll to zoom · hold Ctrl to ignore snapping
          </p>
        </div>
      )}
    </div>
  );
}
