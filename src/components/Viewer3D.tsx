'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
import { supportForLayer } from '@/lib/support';
import { audienceZone, rigForWall, type AudienceZone, type WallRig } from '@/lib/rig';
import { prefersReducedMotion } from '@/lib/motion';
import { CHROME } from '@/lib/chrome';
import type { Layer, StagePlacement } from '@/lib/types';
import Dialog from './Dialog';
import NumberInput from './NumberInput';

type View = 'front' | 'back' | 'top' | 'side' | 'angle' | 'front-row' | 'back-row';

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
  // The two audience views stand at a viewer's eye rather than looking in
  // from a direction; see aimCamera.
  'front-row': [0, 0, 1],
  'back-row': [0, 0, 1],
};

const EYE_VIEWS: Array<{ value: View; label: string }> = [
  { value: 'front-row', label: 'Front row' },
  { value: 'back-row', label: 'Back row' },
];

const STEEL = '#a4a7ad';
const PLATE = '#55585e';
const BALLAST = '#8a8780';
const MOTOR = '#2f3034';
/** Concrete, for sizing a ballast block from its mass. */
const BALLAST_DENSITY = 2400;

const VIEW_WORDS: Record<View, string> = {
  angle: 'the front at an angle',
  front: 'the front',
  back: 'the back',
  side: 'the side',
  top: 'above',
  'front-row': 'the nearest viewer\'s eye',
  'back-row': 'the furthest viewer\'s eye',
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

/** A box of the given size, centred at a point and turned in plan. */
function box(w: number, h: number, d: number, colour: string, x: number, y: number, z: number, angle: number) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.7, metalness: colour === STEEL ? 0.5 : 0 })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = angle;
  return mesh;
}

/**
 * A square box-truss upright: four chords and a rung every half metre. Only
 * a sketch of truss, but enough that it reads as truss and not as a post.
 */
function trussGeometry(size: number, height: number) {
  const parts: THREE.BufferGeometry[] = [];
  const r = Math.max(0.012, size * 0.08);
  const half = size / 2 - r;
  for (const [cx, cz] of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
    const chord = new THREE.CylinderGeometry(r, r, height, 6);
    chord.translate(cx, height / 2, cz);
    parts.push(chord);
  }
  const rungs = Math.max(1, Math.floor(height / 0.5));
  for (let i = 0; i <= rungs; i++) {
    const y = (i / rungs) * height;
    const a = new THREE.BoxGeometry(size, r, r);
    a.translate(0, y, -half);
    const b = a.clone();
    b.translate(0, 0, half * 2);
    const c = new THREE.BoxGeometry(r, r, size);
    c.translate(-half, y, 0);
    const d = c.clone();
    d.translate(half * 2, 0, 0);
    parts.push(a, b, c, d);
  }
  return mergeGeometries(parts);
}

/** Everything that holds one wall up, as the support report has it. */
function rigObjects(rig: WallRig, trussSize: number, plate: { width: number; depth: number }) {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.45, metalness: 0.5 });
  for (const u of rig.uprights) {
    const truss = new THREE.Mesh(trussGeometry(trussSize, u.height), steel);
    truss.position.set(u.x, 0, u.z);
    truss.rotation.y = u.angle;
    group.add(truss);
    group.add(box(plate.width, 0.03, plate.depth, PLATE, u.plateX, 0.015, u.plateZ, u.angle));
    if (u.ballastKg > 0) {
      // A block of concrete that weighs what the report asks for, on the
      // plate behind the upright, so a heavy answer looks heavy.
      const footprint = Math.min(plate.width, 0.6) * Math.min(plate.depth, 0.6);
      const height = Math.min(1.5, u.ballastKg / BALLAST_DENSITY / Math.max(0.05, footprint));
      const side = Math.sqrt(footprint);
      const backX = u.plateX - Math.sin(u.angle) * (plate.depth / 2 - side / 2);
      const backZ = u.plateZ - Math.cos(u.angle) * (plate.depth / 2 - side / 2);
      group.add(box(side, height, side, BALLAST, backX, 0.03 + height / 2, backZ, u.angle));
    }
  }
  if (rig.beamHeight != null && rig.hangPoints.length) {
    const beam = rig.beamHeight;
    const points = rig.hangPoints;
    // The flying beam, point to point along the wall, square truss on its side.
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const angle = Math.atan2(-(b.z - a.z), b.x - a.x);
      group.add(box(length + 0.3, 0.3, 0.3, STEEL, (a.x + b.x) / 2, beam, (a.z + b.z) / 2, angle));
    }
    if (points.length === 1) {
      const p = points[0];
      group.add(box(1, 0.3, 0.3, STEEL, p.x, beam, p.z, p.angle));
    }
    for (const p of points) {
      group.add(box(0.28, 0.32, 0.28, MOTOR, p.x, beam - 0.33, p.z, p.angle));
      const drop = beam - 0.5 - p.wallTop;
      if (drop > 0.01) {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, drop, 6), steel);
        chain.position.set(p.x, p.wallTop + drop / 2, p.z);
        group.add(chain);
      }
    }
  }
  return group;
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

/**
 * Point the camera at the whole rig from one of the named directions, or from
 * a viewer's eye in the front or back row.
 */
function aimCamera(t: Rig, solids: WallSolid[], view: View, instant: boolean, zone?: AudienceZone | null) {
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
  let to = centre.clone().addScaledVector(direction, distance);
  if (zone && (view === 'front-row' || view === 'back-row')) {
    to = new THREE.Vector3(...(view === 'front-row' ? zone.nearestEye : zone.furthestEye));
  }

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
  const support = useEditor((s) => s.support);
  const audience = useEditor((s) => s.audience);
  const updateLayer = useEditor((s) => s.updateLayer);
  const commit = useEditor((s) => s.commit);

  const layers = useMemo(() => allLayers.filter((l) => l.visible), [allLayers]);

  const [view, setView] = useState<View>('angle');
  const [showData, setShowData] = useState(true);
  const [showPower, setShowPower] = useState(true);
  const [showSupports, setShowSupports] = useState(true);
  const [showAudience, setShowAudience] = useState(true);
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

  // Unplaced screens stand at the support settings' wall height, so the
  // picture and the support report agree on where the wall's bottom edge is.
  const fromCanvas = useMemo(() => canvasPlacements(layers, support.wallBottom), [layers, support.wallBottom]);
  const solids = useMemo(
    () => layers.map((l) => wallSolid(l, placementFor(l, fromCanvas))),
    [layers, fromCanvas]
  );
  const supports = useMemo(() => layers.map((l) => supportForLayer(l, support)), [layers, support]);
  const rigs = useMemo(
    () => solids.map((solid, i) => rigForWall(solid, supports[i], support)),
    [solids, supports, support]
  );
  const zone = useMemo(() => (solids.length ? audienceZone(sceneBounds(solids), audience) : null), [solids, audience]);

  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    walls: THREE.Group;
    furniture: THREE.Group;
    /** Supports and the audience, rebuilt on their own so a toggle does not redraw the walls. */
    extras: THREE.Group;
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
    const extras = new THREE.Group();
    scene.add(walls, furniture, extras);

    const gl = renderer.getContext();
    const maxTexture = Math.min(MAX_TEXTURE, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);

    three.current = { renderer, scene, camera, controls, walls, furniture, extras, faces: [], maxTexture, flight: null, framed: false };

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
      disposeGroup(extras);
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

  // Supports and audience, on their own so switching either off is instant.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    disposeGroup(t.extras);
    t.extras.clear();

    if (showSupports) {
      const plate = { width: support.plateWidth, depth: support.plateFront + support.plateBack };
      for (const rig of rigs) t.extras.add(rigObjects(rig, support.trussDepth, plate));
    }

    if (showAudience && zone) {
      const width = zone.maxX - zone.minX;
      const depth = zone.furthestZ - zone.nearestZ;
      const centreX = (zone.minX + zone.maxX) / 2;
      if (depth > 0.01) {
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(width, depth),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, depthWrite: false })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(centreX, 0.003, (zone.nearestZ + zone.furthestZ) / 2);
        t.extras.add(floor);
      }
      // The front and back of the audience, as lines across the floor with
      // their distances, and a viewer standing at each.
      for (const [z, words] of [
        [zone.nearestZ, `NEAREST ${audience.nearestM} m`],
        [zone.furthestZ, `FURTHEST ${audience.furthestM} m`],
      ] as const) {
        const line = new THREE.Mesh(
          new THREE.PlaneGeometry(width, 0.06),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(centreX, 0.004, z);
        t.extras.add(line);
        const label = floorLabel(words, Math.max(2.4, width * 0.18));
        label.position.set(zone.minX + Math.max(2.4, width * 0.18) / 2 + 0.3, 0.005, z + 0.5);
        t.extras.add(label);
        // To one side, so a viewer does not stand in the eye-line of the views
        // taken from their own row.
        const viewer = scaleFigure();
        viewer.position.set(zone.minX + 0.6, 0, z);
        t.extras.add(viewer);
      }
    }
  }, [rigs, zone, showSupports, showAudience, support, audience]);

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
    if (three.current) aimCamera(three.current, solids, next, false, zone);
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
            aria-label={`The screens in 3D, seen from ${VIEW_WORDS[view]}. Drag or use the arrow keys to turn round them, and plus or minus to zoom.`}
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
          <div className="seg" role="radiogroup" aria-label="Look from the audience">
            {EYE_VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                role="radio"
                aria-checked={view === v.value}
                disabled={!zone}
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
              The uprights stand in front of it; switch them off below to read it clearly.
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
                      <NumberInput min={-500} max={500} step={0.1} value={round2(placement.x)} onChange={(x) => setPlacement({ x })} />
                    </label>
                    <label className="field">
                      <span>Forward (m)</span>
                      <NumberInput min={-500} max={500} step={0.1} value={round2(placement.z)} onChange={(z) => setPlacement({ z })} />
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

          <section>
            <h4 className="viewer3d__heading">What holds it up</h4>
            <label className="checkbox">
              <input type="checkbox" checked={showSupports} onChange={(e) => setShowSupports(e.target.checked)} />
              {support.mode === 'hanging' ? 'Flying beam and hang points' : 'Uprights, baseplates and ballast'}
            </label>
            {supports.map((r, i) => (
              <p key={r.layerId} className="note">
                <strong>{layers[i]?.name}:</strong>{' '}
                {r.unavailable
                  ? r.unavailable
                  : r.ground
                    ? `${r.ground.uprights} upright${r.ground.uprights === 1 ? '' : 's'} at ${r.ground.spacing.toFixed(2)} m, ${Math.round(r.ground.ballastNeededPerUpright)} kg on each plate${r.ground.passes ? '' : ', and it does not hold at the wind set'}.`
                    : r.hanging
                      ? `${r.hanging.points} hang points at ${Math.round(r.hanging.loadPerPointKg)} kg each.`
                      : ''}
              </p>
            ))}
            <p className="note">
              From Reports, Support structure, where the method, truss and wind are set.
              {solids.some((_, i) => layers[i]?.shape && layers[i].shape!.kind !== 'flat')
                ? ' A curved wall is assessed as flat there, so its uprights are the flat answer laid along the curve.'
                : ''}
            </p>
          </section>

          <section>
            <h4 className="viewer3d__heading">The audience</h4>
            <label className="checkbox">
              <input type="checkbox" checked={showAudience} onChange={(e) => setShowAudience(e.target.checked)} />
              Nearest and furthest viewers
            </label>
            <p className="note">
              {audience.nearestM} m to {audience.furthestM} m from the front of the rig, from the Viewing section. Front
              row and Back row look from a standing viewer&rsquo;s eye, 1.6 m up.
            </p>
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
