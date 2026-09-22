'use client';

import { useEditor } from '@/state/store';
import {
  MAX_JOINT_ANGLE,
  angleForRadius,
  curveWarnings,
  normaliseShape,
  planForLayer,
  radiusForAngle,
} from '@/lib/curve';
import { mmLabel } from '@/lib/plan';
import type { Layer, WallShape, WallShapeKind } from '@/lib/types';
import NumberInput from './NumberInput';
import Section from './Section';
import PlanView from './PlanView';

const KINDS: Array<{ value: WallShapeKind; label: string }> = [
  { value: 'flat', label: 'Flat' },
  { value: 'arc', label: 'Curved' },
  { value: 'fold', label: 'Angled' },
];

/** Radius a sensible bend lands on, for the field's limits. */
const radiusBounds = (cabinetWidthMm: number) => ({
  min: radiusForAngle(MAX_JOINT_ANGLE, cabinetWidthMm) ?? 0.1,
  max: radiusForAngle(0.25, cabinetWidthMm) ?? 1000,
});

export default function ShapeSection({ layer }: { layer: Layer }) {
  const updateLayer = useEditor((s) => s.updateLayer);
  const commit = useEditor((s) => s.commit);

  const shape = normaliseShape(layer.shape);
  const plan = planForLayer(layer);
  const warnings = curveWarnings(plan, layer.spec);
  const cabWidth = layer.spec.cabinet.width;
  const joints = Math.max(0, layer.cols - 1);
  const bounds = radiusBounds(cabWidth);

  const setShape = (patch: Partial<WallShape>) => {
    commit();
    updateLayer(layer.id, { shape: { ...shape, ...patch } });
  };

  const setFold = (index: number, patch: Partial<{ joint: number; angle: number }>) => {
    const folds = shape.folds.map((f, i) => (i === index ? { ...f, ...patch } : f));
    setShape({ folds });
  };

  const addFold = () => {
    // A first corner lands in the middle, which is where someone drawing an L
    // would put it; each one after sits between the last corner and the end.
    const last = shape.folds.length ? Math.max(...shape.folds.map((f) => f.joint)) : -1;
    const next = last < 0 ? Math.floor(joints / 2) : Math.min(joints - 1, last + Math.max(1, Math.floor((joints - last) / 2)));
    setShape({ folds: [...shape.folds, { joint: Math.max(0, next), angle: 90 }] });
  };

  return (
    <Section id="shape" title="Shape" hint="curve, corners, footprint">
      <label className="field">
        <span>Wall shape</span>
        <select
          className="input"
          value={shape.kind}
          onChange={(e) => setShape({ kind: e.target.value as WallShapeKind })}
        >
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </label>

      {shape.kind !== 'flat' && joints === 0 && (
        <p className="note note--warn">
          A screen one cabinet wide has no joints to bend. Widen it to shape it.
        </p>
      )}

      {shape.kind === 'arc' && joints > 0 && (
        <>
          {/*
            Bend per joint is what the panel is rated in and what the crew sets
            on site; radius is what the drawing and the floor marks are in.
            Both are here for the same reason cabinets and metres both are:
            each is the real unit for somebody, and typing either moves the
            other.
          */}
          <div className="grid2">
            <label className="field">
              <span>Bend per joint (°)</span>
              <NumberInput
                min={-MAX_JOINT_ANGLE}
                max={MAX_JOINT_ANGLE}
                step={0.5}
                value={shape.anglePerJoint}
                onChange={(anglePerJoint) => setShape({ anglePerJoint })}
              />
            </label>
            <label className="field">
              <span>Radius (m)</span>
              <NumberInput
                min={Number((bounds.min / 1000).toFixed(2))}
                max={Number((bounds.max / 1000).toFixed(0))}
                step={0.1}
                value={Number(((radiusForAngle(shape.anglePerJoint, cabWidth) ?? 0) / 1000).toFixed(2))}
                onChange={(m) => {
                  const angle = angleForRadius(m * 1000, cabWidth);
                  // Radius carries no sign, so setting one keeps whichever way
                  // the wall was already bent rather than flipping it.
                  setShape({ anglePerJoint: shape.anglePerJoint < 0 ? -angle : angle });
                }}
              />
            </label>
          </div>
          <p className="note">
            Positive bends the wall around the audience; negative bows it away from them.
          </p>
        </>
      )}

      {shape.kind === 'fold' && joints > 0 && (
        <>
          {shape.folds.length === 0 && (
            <p className="empty">No corners yet. Add one to turn this into an L or a U.</p>
          )}
          {shape.folds.map((fold, i) => (
            <div key={i}>
              <div className="grid2">
                <label className="field">
                  <span>Corner after cabinet</span>
                  <NumberInput
                    min={1}
                    max={joints}
                    value={fold.joint + 1}
                    onChange={(n) => setFold(i, { joint: Math.max(0, n - 1) })}
                  />
                </label>
                <label className="field">
                  <span>Angle (°)</span>
                  <NumberInput
                    min={-MAX_JOINT_ANGLE}
                    max={MAX_JOINT_ANGLE}
                    step={1}
                    value={fold.angle}
                    onChange={(angle) => setFold(i, { angle })}
                  />
                </label>
              </div>
              <div className="btn-row">
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => setShape({ folds: shape.folds.filter((_, j) => j !== i) })}
                >
                  Remove corner {i + 1}
                </button>
              </div>
            </div>
          ))}
          <div className="btn-row">
            <button className="btn btn--secondary" type="button" onClick={addFold}>
              Add a corner
            </button>
          </div>
        </>
      )}

      {joints > 0 && (
        <PlanView
          plan={plan}
          colour={layer.color}
          label={
            plan.flat
              ? `Plan of ${layer.name}: a flat wall ${mmLabel(plan.spanMm)} across.`
              : `Plan of ${layer.name}: ${mmLabel(plan.spanMm)} across the ends, ${mmLabel(
                  plan.footprintMm.depth
                )} deep, turning ${plan.includedAngleDeg.toFixed(0)} degrees.`
          }
        />
      )}

      <dl className="stats">
        <div>
          <dt>Screen width</dt>
          <dd>{mmLabel(plan.developedWidthMm)}</dd>
        </div>
        <div>
          <dt>Across the ends</dt>
          <dd>{mmLabel(plan.spanMm)}</dd>
        </div>
        <div>
          <dt>Floor taken</dt>
          <dd>{mmLabel(plan.footprintMm.width)} × {mmLabel(plan.footprintMm.depth)}</dd>
        </div>
        <div>
          <dt>Turn</dt>
          <dd>{plan.includedAngleDeg.toFixed(1)}°</dd>
        </div>
        <div>
          <dt>Radius</dt>
          <dd>{plan.radiusMm != null ? mmLabel(plan.radiusMm) : '—'}</dd>
        </div>
      </dl>

      {warnings.map((warning) => (
        <p className="note note--warn" key={warning}>{warning}</p>
      ))}
    </Section>
  );
}
