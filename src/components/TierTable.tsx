import type { Tier } from "@/lib/config";
import Tilt from "./fx/Tilt";

export function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(n);
}

export default function TierTable({ tiers, current = -1, tilt = true }: { tiers: Tier[]; current?: number; tilt?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
      {tiers.map((t, i) => {
        const hit = i <= current;
        const card = (
          <div
            className={`tier rounded-xl border px-3 py-4 text-center ${
              hit ? "tier-hit border-acid bg-acid/10" : "border-line bg-bg hover:border-acid/40"
            }`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="mono text-[11px] uppercase tracking-wider text-dim">{fmt(t.views)} views</div>
            <div className={`mt-1 text-xl font-bold sm:text-2xl ${hit ? "stat-glow text-acid" : "text-ink"}`}>
              {t.sol} <span className="text-sm font-semibold text-dim">SOL</span>
            </div>
          </div>
        );
        return tilt ? (
          <Tilt key={t.views} max={14} className="rounded-xl">
            {card}
          </Tilt>
        ) : (
          <div key={t.views}>{card}</div>
        );
      })}
    </div>
  );
}
