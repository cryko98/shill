import { fmt } from "./TierTable";

export type LeaderRow = {
  username: string;
  name: string;
  avatar: string | null;
  earnedSol: number;
  rewardedTweets: number;
  views: number;
};

export default function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  return (
    <section id="leaderboard" className="card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Top shillers</h2>
        <span className="mono text-xs text-dim">by SOL earned</span>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-dim">
          Nobody has earned yet. Be first.
        </div>
      ) : (
        <ol className="mt-4 divide-y divide-line">
          {rows.map((r, i) => (
            <li key={r.username} className="flex items-center gap-3 py-3">
              <span className="mono w-6 text-right text-sm text-dim">{i + 1}</span>
              {r.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.avatar} alt="" className="h-8 w-8 rounded-full bg-line" />
              ) : (
                <span className="h-8 w-8 rounded-full bg-line" />
              )}
              <a
                href={`https://x.com/${r.username}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                <span className="font-semibold">{r.name}</span>{" "}
                <span className="text-dim">@{r.username}</span>
              </a>
              <span className="mono hidden text-xs text-dim sm:inline">{fmt(r.views)} views</span>
              <span className="font-bold text-acid">{r.earnedSol.toFixed(2)} SOL</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
