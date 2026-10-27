'use client';

import { useEditor } from '@/state/store';
import { aspectRatio, kgToLbs, layerTotals, mmToFeetInches, projectTotals } from '@/lib/calc';
import { contentBounds, layerSizeMm } from '@/lib/geometry';

/**
 * The answer, always on screen.
 *
 * Pricing a wall is the most common thing anyone does here, and it needs about
 * six numbers. Reaching them used to mean finding the Spec sheet button among
 * eleven identical ones, opening a modal, reading it and closing it again. They
 * belong next to the canvas; the spec sheet then becomes what its name says —
 * the printable version of numbers you can already see.
 */
export default function StatusBar() {
  const layers = useEditor((s) => s.layers);
  const selectedIds = useEditor((s) => s.selectedIds);

  if (!layers.length) return null;

  // Report the selection when there is one, the whole build when there is not.
  const scope = selectedIds.length ? layers.filter((l) => selectedIds.includes(l.id)) : layers;
  const totals = projectTotals(scope);
  const single = scope.length === 1 ? scope[0] : null;
  const size = single ? layerSizeMm(single) : null;
  const one = single ? layerTotals(single) : null;

  /*
   * With more than one screen in scope there is no single resolution to give —
   * two screens are two outputs, and adding their widths together would be a
   * number describing nothing. What they do have between them is an extent:
   * the box the arrangement occupies, which is the frame it has to be fed
   * into and the shape a client sees. Its ratio is the useful half, so it sits
   * under the figure the way a screen's own does.
   */
  const extent = single ? null : contentBounds(scope);

  return (
    <dl className="statusbar" aria-label={selectedIds.length ? 'Selected screen totals' : 'Project totals'}>
      <div>
        <dt>{selectedIds.length ? 'Selected' : 'Build'}</dt>
        <dd>{scope.length} screen{scope.length === 1 ? '' : 's'} · {totals.cabinets} panels</dd>
      </div>
      {size && one && (
        <div>
          <dt>Size</dt>
          <dd>
            {(size.width / 1000).toFixed(2)} × {(size.height / 1000).toFixed(2)} m
            <em>{mmToFeetInches(size.width)} × {mmToFeetInches(size.height)}</em>
          </dd>
        </div>
      )}
      {one && (
        <div>
          <dt>Resolution</dt>
          <dd>{one.widthPx} × {one.heightPx}<em>{one.aspectRatio}</em></dd>
        </div>
      )}
      {extent && (
        <div>
          <dt>Extent</dt>
          <dd>
            {Math.round(extent.width)} × {Math.round(extent.height)}
            <em>{aspectRatio(extent.width, extent.height)} · {scope.length} screens together</em>
          </dd>
        </div>
      )}
      <div>
        <dt>Area</dt>
        <dd>{totals.areaM2.toFixed(2)} m²<em>{totals.megapixels.toFixed(2)} MP</em></dd>
      </div>
      <div>
        <dt>Weight</dt>
        <dd>
          {totals.weightKg != null ? `${Math.round(totals.weightKg).toLocaleString('en-GB')} kg` : '—'}
          <em>
            {totals.weightKg != null ? `${Math.round(kgToLbs(totals.weightKg)).toLocaleString('en-GB')} lb` : 'not published'}
            {totals.weightIncomplete && totals.weightKg != null ? ' · partial' : ''}
          </em>
        </dd>
      </div>
      <div>
        <dt>Power max</dt>
        <dd>
          {totals.powerMaxW != null ? `${(totals.powerMaxW / 1000).toFixed(2)} kW` : '—'}
          <em>
            {totals.powerMaxW != null ? `${(totals.powerMaxW / 230).toFixed(0)} A at 230 V` : 'not published'}
            {totals.powerIncomplete && totals.powerMaxW != null ? ' · partial' : ''}
          </em>
        </dd>
      </div>
    </dl>
  );
}
