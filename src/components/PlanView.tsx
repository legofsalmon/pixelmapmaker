'use client';

import { useEffect, useRef } from 'react';
import { drawPlan } from '@/lib/plan';
import type { WallPlan } from '@/lib/curve';

/**
 * The wall from above, sized to whatever box the panel gives it.
 *
 * Small enough that redrawing the whole thing on every change is cheaper than
 * working out what moved, so it does.
 */
export default function PlanView({
  plan,
  colour,
  height = 132,
  label,
}: {
  plan: WallPlan;
  colour: string;
  height?: number;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const draw = () => {
      const width = el.clientWidth;
      if (!width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPlan(ctx, plan, { width, height, colour });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    return () => observer.disconnect();
  }, [plan, colour, height]);

  return (
    <canvas
      ref={ref}
      className="plan-view"
      style={{ height }}
      role="img"
      aria-label={label}
    />
  );
}
