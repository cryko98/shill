/** Infinite horizontal ticker. Items are duplicated so the loop is seamless. */
export default function Marquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const row = [...items, ...items];
  return (
    <div className="marquee" aria-hidden>
      <div className={`marquee-track ${reverse ? "marquee-rev" : ""}`}>
        {row.map((t, i) => (
          <span key={i} className="marquee-item">
            {t}
            <span className="marquee-dot">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}
