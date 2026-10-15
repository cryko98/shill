import { fmt } from "./TierTable";
import Reveal from "./fx/Reveal";

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
    <Reveal as="section" kind="up" id="leaderboard" className="card card-glow p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Top shillers</h2>
        <span className="mono text-xs uppercase tracking-wider text-dim">by SOL earned</span>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line p-8 text-center text-sm text-dim">
          Nobody has earned yet. <span className="text-acid">Be first.</span>
        </div>
      ) : (
        <ol className="mt-4 divide-y divide-line">
          {rows.map((r, i) => (
            <Reveal as="li" key={r.username} kind="left" delay={i * 60} className="flex items-center gap-3 py-3">
              {i < 3 ? (
                <span className={`medal medal-${i + 1}`}>{i + 1}</span>
              ) : (
                <span className="mono w-7 text-center text-sm text-dim">{i + 1}</span>
              )}
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
              <span className="stat-glow font-bold text-acid">{r.earnedSol.toFixed(2)} SOL</span>
            </Reveal>
          ))}
        </ol>
      )}
    </Reveal>
  );
}
