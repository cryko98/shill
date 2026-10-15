"use client";

import { useEffect, useRef } from "react";

/**
 * Counts from 0 to `value` the first time it scrolls into view, then tracks
 * later changes with a short tween. Formats through `format`.
 */
export default function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  duration = 1200,
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    function tween(from: number, to: number, ms: number) {
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        shown.current = from + (to - from) * e;
        el!.textContent = format(shown.current);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }

    if (started.current) {
      tween(shown.current, value, 500);
      return () => cancelAnimationFrame(raf);
    }

    el.textContent = format(0);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          started.current = true;
          tween(0, value, duration);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration, format]);

  return <span ref={ref} className={className} />;
}
