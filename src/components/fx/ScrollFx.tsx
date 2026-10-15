"use client";

import { useEffect } from "react";

/**
 * Scroll-driven bits that need no React state: a progress bar across the top,
 * a --scroll CSS variable for parallax, and the header's "scrolled" class.
 */
export default function ScrollFx() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    function update() {
      raf = 0;
      const y = window.scrollY;
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      root.style.setProperty("--scroll", String(y));
      root.style.setProperty("--progress", String(y / max));
      root.classList.toggle("scrolled", y > 24);
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div className="progress" aria-hidden />;
}
