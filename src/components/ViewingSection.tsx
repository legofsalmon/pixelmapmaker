'use client';

import { useEditor } from '@/state/store';
import {
  SMPTE_MIN_ANGLE_DEG,
  VIEWING_GRADES,
  viewingForLayer,
  type ViewingGrade,
} from '@/lib/viewing';
import type { Layer } from '@/lib/types';
import NumberInput from './NumberInput';
import Section from './Section';

/**
 * Two grades read as fine and two as a problem, so the verdict strip only has
 * to carry three states. "Structure visible" is amber rather than red because
 * it is the normal condition at the front of a live audience — it is a thing
 * to know, not a thing to fix.
 */
const VERDICT_TONE: Record<ViewingGrade, string> = {
  'beyond-acuity': 'verdict--ok',
  clean: 'verdict--ok',
  visible: 'verdict--warn',
  coarse: 'verdict--bad',
};

const arcmin = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} arcmin` : '—');

export default function ViewingSection({ layer }: { layer: Layer }) {
  const audience = useEditor((s) => s.audience);
  const setAudience = useEditor((s) => s.setAudience);

  const v = viewingForLayer(layer, audience);
  const grade = VIEWING_GRADES[v.near.grade];

  return (
    <Section id="viewing" title="Viewing" hint="distance, pitch, angle">
      {/*
        Audience distance belongs to the room, not to the screen, so it is held
        once for the project and every screen is read against it. A show with a
        6 mm IMAG wall and a 2.6 mm upstage strip is the normal case, and the
        whole point is to see them judged against the same front row.
      */}
      <div className="grid2">
        <label className="field">
          <span>Nearest viewer (m)</span>
          <NumberInput
            min={0.1}
            step={0.5}
            value={audience.nearestM}
            onChange={(nearestM) => setAudience({ nearestM })}
          />
        </label>
        <label className="field">
          <span>Furthest viewer (m)</span>
          <NumberInput
            min={0.1}
            step={1}
            value={audience.furthestM}
            onChange={(furthestM) => setAudience({ furthestM })}
          />
        </label>
      </div>

      <p className={`verdict ${VERDICT_TONE[v.near.grade]}`}>
        <strong>{grade.label} at {v.near.distanceM.toFixed(1)} m.</strong> {grade.meaning}
      </p>

      <dl className="stats stats--stacked">
        <div>
          <dt>Front row</dt>
          <dd>{arcmin(v.near.arcminutesPerPixel)}<em>{VIEWING_GRADES[v.near.grade].label.toLowerCase()}</em></dd>
        </div>
        <div>
          <dt>Back row</dt>
          <dd>{arcmin(v.far.arcminutesPerPixel)}<em>{VIEWING_GRADES[v.far.grade].label.toLowerCase()}</em></dd>
        </div>
        <div>
          <dt>Pixels vanish at</dt>
          <dd>{v.acuityDistanceM.toFixed(1)} m<em>10× rule says {v.tenXDistanceM.toFixed(1)} m</em></dd>
        </div>
        <div>
          <dt>Closest by the rule</dt>
          <dd>{v.frontRowRuleM.toFixed(1)} m<em>pitch × 1 m, rule of thumb</em></dd>
        </div>
        <div>
          <dt>Fills the view</dt>
          <dd>
            {v.near.angleDeg.toFixed(1)}° front
            <em>{v.far.angleDeg.toFixed(1)}° back · SMPTE asks {SMPTE_MIN_ANGLE_DEG}°</em>
          </dd>
        </div>
        <div>
          <dt>Detail seen at the back</dt>
          <dd>
            {Math.round(v.far.resolvedFraction * 100)}%
            <em>{Math.round(v.far.resolvablePixels).toLocaleString('en-GB')} of {v.widthPx.toLocaleString('en-GB')} px across</em>
          </dd>
        </div>
      </dl>

      {v.notes.map((note, i) => (
        <p key={i} className={i === 0 && (v.finerThanNeeded || v.near.grade === 'coarse') ? 'note note--warn' : 'note'}>
          {note}
        </p>
      ))}

      <p className="note">
        Geometry from the one arcminute 20/20 vision resolves, the constant behind every
        viewing-distance rule the trade quotes. Eyesight, content and ambient light all move the
        answer, so this starts the argument rather than ends it.
      </p>
    </Section>
  );
}
