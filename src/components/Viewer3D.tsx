'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useEditor } from '@/state/store';
import { cablingForProject, processorsRequired, runOverlays } from '@/lib/cabling';
import { findProcessor } from '@/lib/processors';
import { layerRect } from '@/lib/geometry';
import { renderLayerFace } from '@/lib/render';
import { drawRear, rearRuns, rearTile, withEveryRun } from '@/lib/rear';
import {
  ASSUMED_DEPTH_MM,
  canvasPlacements,
  placementFor,
  sceneBounds,
  wallSolid,
  type Vec3,
  type WallSolid,
} from '@/lib/stage';
import { loadLayerLogos } from '@/lib/logos';
import { prefersReducedMotion } from '@/lib/motion';
import { CHROME } from '@/lib/chrome';
import type { Layer, StagePlacement } from '@/lib/types';
import Dialog from './Dialog';
import NumberInput from './NumberInput';

type View = 'front' | 'back' | 'top' | 'side' | 'angle';

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'angle', label: 'Angle' },
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Back' },
  { value: 'side', label: 'Side' },
  { value: 'top', label: 'Top' },
];

/** Which way the camera looks from, as a direction out from the rig's centre. */
const DIRECTIONS: Record<View, Vec3> = {
  angle: [-0.55, 0.35, 1],
  front: [0, 0.04, 1],
  back: [0, 0.04, -1],
  side: [1, 0.08, 0.02],
  top: [0, 1, 0.002],
};

const FOV = 40;
const SIDES = '#3a3c40';
const FIGURE = '#7d8087';

/** Largest texture worth asking for: past this the GPU, not the drawing, is the limit. */
const MAX_TEXTURE = 4096;

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/**
 * One wall as a single mesh in three parts: the front carrying the pixel map,
 * the back carrying the cabling, and the frame round the edges. Three draw
 * calls a screen whatever its size, because every column shares them.
 */
function wallGeometry(solid: WallSolid) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();

  const quad = (v: Vec3[], uv: Array<[number, number]>) => {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      positions.push(...v[k]);
      uvs.push(...uv[k]);
    }
  };

  let start = 0;
  const group = (material: number) => {
    const count = positions.length / 3 - start;
    geometry.addGroup(start, count, material);
    start = positions.length / 3;
  };

  for (const c of solid.columns) {
    quad(c.front, [[c.u0, 0], [c.u1, 0], [c.u1, 1], [c.u0, 1]]);
  }
  group(0);

  // The rear drawing is made as seen from behind, so it is the mirror of the
  // front's share across.
  for (const c of solid.columns) {
    quad(c.back, [[1 - c.u1, 0], [1 - c.u0, 0], [1 - c.u0, 1], [1 - c.u1, 1]]);
  }
  group(1);

  const none: Array<[number, number]> = [[0, 0], [0, 0], [0, 0], [0, 0]];
  solid.columns.forEach((c, i) => {
    const [fa0, fb0, fb1, fa1] = c.front;
    const [bb0, ba0, ba1, bb1] = c.back;
    quad([fa1, fb1, bb1, ba1], none);
    quad([fa0, ba0, bb0, fb0], none);
    // Only the two outer ends show; the joints between columns are inside.
    if (i === 0) quad([fa0, fa1, ba1, ba0], none);
    if (i === solid.columns.length - 1) quad([fb0, bb0, bb1, fb1], none);
  });
  group(2);

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** A plain 1.8 m figure, so the size of a wall reads at a glance. */
function scaleFigure() {
  const figure = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: FIGURE, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 1.0, 6, 16), material);
  body.position.y = 0.19 + 0.5 + 0.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), material);
  head.position.y = 1.8 - 0.12;
  figure.add(body, head);
  return figure;
}

/** Words painted on the floor, read from the front. */
function floorLabel(text: string, width: number) {
  const canvas = makeCanvas(512, 96);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '600 56px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 48);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, (width * 96) / 512),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  plane.rotation.x = -Math.PI / 2;
  return plane;
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of materials) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  });
}

interface Rig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  flight: { from: THREE.Vector3; to: THREE.Vector3; target: THREE.Vector3; fromTarget: THREE.Vector3; start: number } | null;
}

/** Point the camera at the whole rig from one of the named directions. */
function aimCamera(t: Rig, solids: WallSolid[], view: View, instant: boolean) {
  const bounds = sceneBounds(solids);
  const centre = new THREE.Vector3(
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2
  );
  const radius =
    0.5 * Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
  // Far enough that the whole rig fits the narrower of the two angles of view.
  const halfV = (FOV * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * t.camera.aspect);
  const distance = Math.max(radius, 1) / Math.tan(Math.min(halfV, halfH));
  const direction = new THREE.Vector3(...DIRECTIONS[view]).normalize();
  const to = centre.clone().addScaledVector(direction, distance);

  if (instant || prefersReducedMotion()) {
    t.camera.position.copy(to);
    t.controls.target.copy(centre);
    t.flight = null;
  } else {
    t.flight = {
      from: t.camera.position.clone(),
      to,
      fromTarget: t.controls.target.clone(),
      target: centre,
      start: performance.now(),
    };
  }
}

const hasWebGl = () => {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
};

const NO_WEBGL =
  'This browser could not start 3D drawing (WebGL is off or unavailable), so the 3D view cannot open. The plan view in the Shape section still shows the footprint.';

const fmt = (m: number) => `${m.toFixed(2)} m`;

export default function Viewer3D({ onClose }: { onClose: () => void }) {
  const name = useEditor((s) => s.name);
  const canvasSettings = useEditor((s) => s.canvas);
  const allLayers = useEditor((s) => s.layers);
  const selectedIds = useEditor((s) => s.selectedIds);
  const effect = useEditor((s) => s.effect);
  const cabling = useEditor((s) => s.cabling);
  const processorId = useEditor((s) => s.processorId);
  const customProcessors = useEditor((s) => s.customProcessors);
  const updateLayer = useEditor((s) => s.updateLayer);
  const commit = useEditor((s) => s.commit);

  const layers = useMemo(() => allLayers.filter((l) => l.visible), [allLayers]);

  const [view, setView] = useState<View>('angle');
  const [showData, setShowData] = useState(true);
  const [showPower, setShowPower] = useState(true);
  const [placingId, setPlacingId] = useState<string | null>(
    () => selectedIds.find((id) => allLayers.some((l) => l.id === id && l.visible)) ?? null
  );
  const [error, setError] = useState<string | null>(() => (hasWebGl() ? null : NO_WEBGL));

  /*
   * The back always carries every chain, whatever the canvas overlays are
   * switched to: on the canvas they are off to keep the map clean, but turning
   * the wall round is asking to see the cabling.
   */
  const overlays = useMemo(() => {
    const processor = findProcessor(processorId, customProcessors);
    const totalPixels = allLayers.reduce(
      (sum, l) => sum + l.cols * l.rows * l.spec.resolution.w * l.spec.resolution.h,
      0
    );
    const ports = cablingForProject(allLayers, cabling, processor).portsNeeded;
    const boxes = processorsRequired(totalPixels, ports, processor).count;
    return runOverlays(withEveryRun(allLayers), cabling, processor, boxes);
  }, [allLayers, cabling, processorId, customProcessors]);

  const fromCanvas = useMemo(() => canvasPlacements(layers), [layers]);
  const solids = useMemo(
    () => layers.map((l) => wallSolid(l, placementFor(l, fromCanvas))),
    [layers, fromCanvas]
  );

  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    walls: THREE.Group;
    furniture: THREE.Group;
    faces: Array<{ layer: Layer; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; scale: number }>;
    maxTexture: number;
    flight: { from: THREE.Vector3; to: THREE.Vector3; target: THREE.Vector3; fromTarget: THREE.Vector3; start: number } | null;
    framed: boolean;
  } | null>(null);
  const logos = useRef<Map<string, CanvasImageSource>>(new Map());
  const [logosReady, setLogosReady] = useState(0);

  // The renderer, camera and controls, made once for the life of the view.
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = host.current;
    if (!canvas || !box) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      // The probe said yes and the real context said no; the message is the same.
      queueMicrotask(() => setError(NO_WEBGL));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CHROME.canvas);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x303033, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-4, 8, 6);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(5, 4, -6);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 5000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !prefersReducedMotion();
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;

    const walls = new THREE.Group();
    const furniture = new THREE.Group();
    scene.add(walls, furniture);

    const gl = renderer.getContext();
    const maxTexture = Math.min(MAX_TEXTURE, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);

    three.current = { renderer, scene, camera, controls, walls, furniture, faces: [], maxTexture, flight: null, framed: false };

    const resize = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);

    return () => {
      observer.disconnect();
      controls.dispose();
      disposeGroup(walls);
      disposeGroup(furniture);
      renderer.dispose();
      three.current = null;
    };
  }, []);

  // Logos decode asynchronously; the faces redraw once they have.
  useEffect(() => {
    let live = true;
    void loadLayerLogos(layers).then((map) => {
      if (!live) return;
      logos.current = map;
      setLogosReady((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [layers]);

  const animated = effect.kind !== 'none' || layers.some((l) => l.logo && l.logoSpin);

  const paintFace = useCallback(
    (face: { layer: Layer; canvas: HTMLCanvasElement; scale: number }, timeMs: number) => {
      const ctx = face.canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(face.scale, 0, 0, face.scale, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, face.canvas.width / face.scale, face.canvas.height / face.scale);
      renderLayerFace(ctx, canvasSettings, face.layer, {
        effect: effect.kind !== 'none' ? effect : undefined,
        timeMs,
        logo: logos.current.get(face.layer.id),
      });
    },
    [canvasSettings, effect]
  );

  // The walls, rebuilt whenever anything about them changes.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    disposeGroup(t.walls);
    t.walls.clear();
    disposeGroup(t.furniture);
    t.furniture.clear();
    t.faces = [];

    const anisotropy = t.renderer.capabilities.getMaxAnisotropy();
    // An animated face is redrawn every frame, so it is drawn smaller.
    const faceMax = animated ? Math.min(2048, t.maxTexture) : t.maxTexture;
    const sides = new THREE.MeshStandardMaterial({ color: SIDES, roughness: 0.8, side: THREE.DoubleSide });

    layers.forEach((layer, i) => {
      const solid = solids[i];
      const rect = layerRect(layer);

      const scale = Math.min(1, faceMax / Math.max(rect.width, rect.height));
      const faceCanvas = makeCanvas(rect.width * scale, rect.height * scale);
      const face = { layer, canvas: faceCanvas, scale };
      paintFace(face, performance.now());
      const faceTexture = new THREE.CanvasTexture(faceCanvas);
      faceTexture.colorSpace = THREE.SRGBColorSpace;
      faceTexture.anisotropy = anisotropy;

      const tile = rearTile(layer.cols, layer.rows, t.maxTexture);
      const rearCanvas = makeCanvas(layer.cols * tile, layer.rows * tile);
      const rctx = rearCanvas.getContext('2d');
      if (rctx) drawRear(rctx, layer, rearRuns(layer, overlays), { tile, showData, showPower });
      const rearTexture = new THREE.CanvasTexture(rearCanvas);
      rearTexture.colorSpace = THREE.SRGBColorSpace;
      rearTexture.anisotropy = anisotropy;

      const mesh = new THREE.Mesh(wallGeometry(solid), [
        // An LED face makes its own light, so the room's lighting does not shade it.
        new THREE.MeshBasicMaterial({ map: faceTexture }),
        // The back is lit evenly too: it is a diagram first, and shading half
        // of it into the dark would hide the half someone is looking for.
        new THREE.MeshBasicMaterial({ map: rearTexture }),
        i === 0 ? sides : sides.clone(),
      ]);
      mesh.name = layer.name;
      t.walls.add(mesh);
      t.faces.push({ ...face, texture: faceTexture });
    });

    const bounds = sceneBounds(solids);
    const spanX = bounds.max[0] - bounds.min[0];
    const spanZ = bounds.max[2] - bounds.min[2];
    const size = Math.ceil(Math.max(spanX, spanZ) + 8);
    const grid = new THREE.GridHelper(size, size, 0x4a4c51, 0x2c2d31);
    grid.position.set((bounds.min[0] + bounds.max[0]) / 2, 0, (bounds.min[2] + bounds.max[2]) / 2);
    t.furniture.add(grid);

    // Which side the audience is on. Without it, the top view of a concave
    // wall and a convex one are the same picture turned round.
    const audience = floorLabel('AUDIENCE', Math.max(2.4, spanX * 0.25));
    audience.position.set((bounds.min[0] + bounds.max[0]) / 2, 0.005, bounds.max[2] + 2);
    t.furniture.add(audience);

    const figure = scaleFigure();
    figure.position.set(bounds.min[0] - 0.8, 0, bounds.max[2] + 0.6);
    t.furniture.add(figure);

    // The first build frames the rig; later ones leave the camera where the
    // person put it, so editing a placement does not throw the view about.
    if (!t.framed && solids.length) {
      t.framed = true;
      aimCamera(t, solids, 'angle', true);
    }
  }, [layers, solids, overlays, showData, showPower, animated, paintFace, logosReady]);

  // The render loop. Faces are repainted only when something on them moves.
  useEffect(() => {
    let frame = 0;
    let lastPaint = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const t = three.current;
      if (!t) return;

      if (t.flight) {
        const { from, to, target, fromTarget, start } = t.flight;
        const k = Math.min(1, (now - start) / 450);
        const ease = 1 - Math.pow(1 - k, 3);
        t.camera.position.lerpVectors(from, to, ease);
        t.controls.target.lerpVectors(fromTarget, target, ease);
        if (k >= 1) t.flight = null;
      }
      t.controls.update();

      if (animated && now - lastPaint > 33) {
        lastPaint = now;
        for (const face of t.faces) {
          paintFace(face, now);
          face.texture.needsUpdate = true;
        }
      }
      t.renderer.render(t.scene, t.camera);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animated, paintFace]);

  const flyTo = (next: View) => {
    if (three.current) aimCamera(three.current, solids, next, false);
    setView(next);
  };

  /*
   * The keyboard path round the wall, since dragging is the only other one:
   * arrows orbit, + and − zoom, and the view buttons jump to the five views.
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = three.current;
    if (!t) return;
    const offset = t.camera.position.clone().sub(t.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const step = (15 * Math.PI) / 180;
    if (e.key === 'ArrowLeft') spherical.theta -= step;
    else if (e.key === 'ArrowRight') spherical.theta += step;
    else if (e.key === 'ArrowUp') spherical.phi = Math.max(0.05, spherical.phi - step);
    else if (e.key === 'ArrowDown') spherical.phi = Math.min(Math.PI - 0.05, spherical.phi + step);
    else if (e.key === '+' || e.key === '=') spherical.radius *= 0.85;
    else if (e.key === '-' || e.key === '_') spherical.radius /= 0.85;
    else return;
    e.preventDefault();
    t.flight = null;
    t.camera.position.copy(t.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
  };

  const snapshot = () => {
    const t = three.current;
    if (!t) return;
    // Drawn and read in the same task, so the buffer has not been cleared yet.
    t.renderer.render(t.scene, t.camera);
    t.renderer.domElement.toBlob((blob) => {
      if (!blob) {
        setError('The snapshot could not be encoded as a PNG. Try a smaller window.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[^a-z0-9-_]+/gi, '_') || 'map'}_3d_${view}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }, 'image/png');
  };

  const placing = layers.find((l) => l.id === placingId) ?? null;
  const placement = placing ? placementFor(placing, fromCanvas) : null;
  const setPlacement = (patch: Partial<StagePlacement>) => {
    if (!placing || !placement) return;
    commit();
    updateLayer(placing.id, { stage: { ...placement, ...patch } });
  };

  const assumedDepth = layers.filter((_, i) => solids[i]?.depthAssumed);

  return (
    <Dialog
      title="3D view"
      onClose={onClose}
      full
      actions={
        <button className="btn btn--secondary" type="button" onClick={snapshot} disabled={!layers.length || !!error}>
          Save PNG
        </button>
      }
    >
      <div className="viewer3d">
        <div className="viewer3d__stage" ref={host}>
          <canvas
            ref={canvasRef}
            className="viewer3d__canvas"
            tabIndex={0}
            role="img"
            aria-label={`The screens in 3D, seen from the ${view === 'angle' ? 'front at an angle' : view}. Drag or use the arrow keys to turn round them, and plus or minus to zoom.`}
            onKeyDown={onKeyDown}
          />
          {error && (
            <p className="banner banner--danger viewer3d__message" role="alert">{error}</p>
          )}
          {!error && !layers.length && (
            <p className="viewer3d__message">Add a screen, or show a hidden one, to see it here.</p>
          )}
        </div>

        <aside className="viewer3d__panel" aria-label="3D view settings">
          <div className="seg" role="radiogroup" aria-label="Look from">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                role="radio"
                aria-checked={view === v.value}
                onClick={() => flyTo(v.value)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="note">
            Drag to turn round the rig, scroll or pinch to zoom, right-drag or two fingers to slide. The figure is 1.8 m tall.
          </p>

          <section>
            <h4 className="viewer3d__heading">On the back</h4>
            <label className="checkbox">
              <input type="checkbox" checked={showData} onChange={(e) => setShowData(e.target.checked)} />
              Data runs and ports
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={showPower} onChange={(e) => setShowPower(e.target.checked)} />
              Power circuits
            </label>
            <p className="note">
              Drawn as a technician sees it from behind, so the first column is on the right. The chains are the
              ones on the pick list{layers.some((l) => l.cablingPlan === 'custom') ? ', including the ones drawn by hand' : ''}.
            </p>
          </section>

          <section>
            <h4 className="viewer3d__heading">Where each screen stands</h4>
            <label className="field">
              <span>Screen</span>
              <select
                className="input"
                value={placing?.id ?? ''}
                onChange={(e) => setPlacingId(e.target.value || null)}
              >
                <option value="">Choose a screen…</option>
                {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>

            {placing && placement && (
              <>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!placing.stage}
                    onChange={(e) => {
                      commit();
                      // Taking over starts from where it already stands, so nothing jumps.
                      updateLayer(placing.id, { stage: e.target.checked ? undefined : { ...placement } });
                    }}
                  />
                  Follow the canvas
                </label>
                {placing.stage ? (
                  <div className="grid2">
                    <label className="field">
                      <span>Across (m)</span>
                      <NumberInput step={0.1} value={round2(placement.x)} onChange={(x) => setPlacement({ x })} />
                    </label>
                    <label className="field">
                      <span>Forward (m)</span>
                      <NumberInput step={0.1} value={round2(placement.z)} onChange={(z) => setPlacement({ z })} />
                    </label>
                    <label className="field">
                      <span>Off the floor (m)</span>
                      <NumberInput min={0} step={0.1} value={round2(placement.elevation)} onChange={(elevation) => setPlacement({ elevation })} />
                    </label>
                    <label className="field">
                      <span>Turn (°)</span>
                      <NumberInput min={-180} max={180} step={5} value={round2(placement.rotation)} onChange={(rotation) => setPlacement({ rotation })} />
                    </label>
                  </div>
                ) : (
                  <p className="note">
                    Standing {fmt(placement.x)} {placement.x < 0 ? 'left' : 'right'} of centre
                    {placement.elevation > 0 ? `, ${fmt(placement.elevation)} off the floor` : ', on the floor'}, read off
                    its place on the canvas. Untick to set it by hand, for a side wall turned in or screens of different pitch.
                  </p>
                )}
                {placing.stage && (
                  <p className="note">
                    Across is to the audience&rsquo;s right, forward is toward them, and a positive turn faces the screen toward
                    stage left. The pixel map and the export do not move.
                  </p>
                )}
              </>
            )}
          </section>

          {assumedDepth.length > 0 && (
            <p className="note">
              {assumedDepth.map((l) => l.name).join(', ')}: the datasheet gives no depth, so the cabinets are drawn{' '}
              {ASSUMED_DEPTH_MM} mm deep.
            </p>
          )}
        </aside>
      </div>
    </Dialog>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
