'use client';

import { useMemo } from 'react';
import { useEditor } from './store';
import { cablingForProject, processorsRequired, runOverlays } from '@/lib/cabling';
import { findProcessor } from '@/lib/processors';

/**
 * The run plan for whatever is on the canvas right now.
 *
 * Everything that draws a wall reads it from here — the viewport, the PNG
 * exports and the video. It lived inside the canvas component, so the live
 * view reflected the cabling settings and the exports silently did not: an
 * exported map drew one unbroken chain with no port labels and no power
 * circuits at all. The export is the drawing that goes to site, so that was
 * the worse half to have wrong.
 */
export function useRunOverlays() {
  const layers = useEditor((s) => s.layers);
  const cabling = useEditor((s) => s.cabling);
  const processorId = useEditor((s) => s.processorId);
  const customProcessors = useEditor((s) => s.customProcessors);

  return useMemo(() => {
    const processor = findProcessor(processorId, customProcessors);
    const totalPixels = layers.reduce(
      (sum, l) => sum + l.cols * l.rows * l.spec.resolution.w * l.spec.resolution.h,
      0
    );
    // Ports occupied, not runs: a closed loop holds two of them.
    const ports = cablingForProject(layers, cabling, processor).portsNeeded;
    const boxes = processorsRequired(totalPixels, ports, processor).count;
    return runOverlays(layers, cabling, processor, boxes);
  }, [layers, cabling, processorId, customProcessors]);
}
