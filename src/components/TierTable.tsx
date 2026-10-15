import type { Tier } from "@/lib/config";

export function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(n);
}

export default function TierTable({ tiers, current = -1 }: { tiers: Tier[]; current?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {tiers.map((t, i) => {
        const hit = i <= current;
        return (
          <div
            key={t.views}
            className={`rounded-xl border px-3 py-3 text-center transition ${
              hit ? "border-acid bg-acid/10" : "border-line bg-bg"
            }`}
          >
            <div className="mono text-xs text-dim">{fmt(t.views)} views</div>
            <div className={`mt-1 text-lg font-bold ${hit ? "text-acid" : "text-ink"}`}>{t.sol} SOL</div>
          </div>
        );
      })}
    </div>
  );
}
