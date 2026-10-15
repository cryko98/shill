"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** up | left | right | scale | blur */
  kind?: "up" | "left" | "right" | "scale" | "blur";
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
  id?: string;
  style?: CSSProperties;
};

/** Reveals its content once it scrolls into view. Pure DOM: no state, no re-render. */
export default function Reveal({ children, kind = "up", delay = 0, className = "", as = "div", id, style }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("in");
            io.unobserve(el);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as;
  return (
    <Tag
      // @ts-expect-error ref type varies with the tag
      ref={ref}
      id={id}
      className={`reveal reveal-${kind} ${className}`}
      style={{ ...style, transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
