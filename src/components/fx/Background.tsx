"use client";

import { useEffect, useRef } from "react";

/**
 * Full-page backdrop: drifting particle field with connecting lines on a canvas,
 * aurora blobs in CSS, and a spotlight that follows the pointer. Everything is
 * driven through refs and CSS variables so React never re-renders for it.
 */
export default function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number; t: number };
    let ps: P[] = [];

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(140, Math.floor((w * h) / 14000));
      ps = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -0.15 - Math.random() * 0.35,
        r: 0.8 + Math.random() * 1.8,
        a: 0.25 + Math.random() * 0.6,
        t: Math.random() * Math.PI * 2,
      }));
    }

    let mx = -9999;
    let my = -9999;
    function onMove(e: PointerEvent) {
      mx = e.clientX;
      my = e.clientY;
      root!.style.setProperty("--mx", `${mx}px`);
      root!.style.setProperty("--my", `${my}px`);
    }

    function frame(now: number) {
      ctx!.clearRect(0, 0, w, h);
      // Links first so dots sit on top.
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i];
        for (let j = i + 1; j < ps.length; j++) {
          const b = ps[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 120 * 120) {
            const o = (1 - Math.sqrt(d2) / 120) * 0.18;
            ctx!.strokeStyle = `rgba(198,255,61,${o})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }
      for (const p of ps) {
        // Gentle pull toward the pointer so the field reacts to the visitor.
        const dx = mx - p.x;
        const dy = my - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 220 * 220 && d2 > 1) {
          const f = 0.0008;
          p.vx += dx * f;
          p.vy += dy * f;
        }
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 - 0.004;
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
          p.vy = -0.15 - Math.random() * 0.35;
        }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        const tw = 0.6 + 0.4 * Math.sin(now / 600 + p.t);
        ctx!.fillStyle = `rgba(198,255,61,${p.a * tw})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    if (!reduced) raf = requestAnimationFrame(frame);
    else frame(0);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div ref={rootRef} className="fx-root" aria-hidden>
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />
      <div className="aurora aurora-c" />
      <div className="grid-bg absolute inset-x-0 top-0 h-[720px]" />
      <canvas ref={canvasRef} className="fx-canvas" />
      <div className="spotlight" />
      <div className="noise" />
    </div>
  );
}
