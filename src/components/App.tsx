"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PublicRules } from "@/lib/config";
import TierTable, { fmt } from "./TierTable";
import TweetNow, { XLogo } from "./TweetNow";
import Dashboard, { type Me } from "./Dashboard";
import Leaderboard, { type LeaderRow } from "./Leaderboard";

type Stats = {
  rules: PublicRules;
  treasury: string | null;
  totals: { shillers: number; tracking: number; paidSol: number };
  leaderboard: LeaderRow[];
};

async function load(): Promise<{ me: Me | null; stats: Stats }> {
  const [m, s] = await Promise.all([
    fetch("/api/me").then((r) => r.json()),
    fetch("/api/stats").then((r) => r.json()),
  ]);
  return { me: m.user ? (m as Me) : null, stats: s as Stats };
}

export default function App({ rules }: { rules: PublicRules }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const d = await load();
    setMe(d.me);
    setStats(d.stats);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const login = q.get("login");
    if (login) window.history.replaceState({}, "", "/");
    load().then((d) => {
      setMe(d.me);
      setStats(d.stats);
      if (login === "failed") setNotice("X login failed. Check the app's callback URL and try again.");
      if (login === "denied") setNotice("You cancelled the X login.");
    });
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
  }

  const loggedIn = Boolean(me);

  return (
    <div className="relative">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[520px]" />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-acid font-black text-black">$</span>
          <span className="text-lg font-bold tracking-tight">{rules.cashtag}</span>
        </Link>
        <nav className="flex items-center gap-2">
          <a href="#how" className="hidden text-sm text-dim hover:text-ink sm:inline">
            How it works
          </a>
          <a href="#leaderboard" className="hidden text-sm text-dim hover:text-ink sm:inline">
            Leaderboard
          </a>
          {me ? (
            <div className="ml-2 flex items-center gap-2">
              {me.user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.user.avatar} alt="" className="h-8 w-8 rounded-full bg-line" />
              ) : null}
              <span className="hidden text-sm sm:inline">@{me.user.username}</span>
              <button type="button" onClick={logout} className="btn-ghost !px-3 !py-1.5 text-xs">
                Log out
              </button>
            </div>
          ) : (
            <a href="/api/auth/x/login" className="btn-acid ml-2">
              <XLogo /> Log in with X
            </a>
          )}
        </nav>
      </header>

      <main className="relative mx-auto max-w-5xl space-y-8 px-4 pb-20">
        {notice ? (
          <div className="card border-warn/40 p-3 text-sm text-warn">
            {notice}{" "}
            <button type="button" className="underline" onClick={() => setNotice(null)}>
              dismiss
            </button>
          </div>
        ) : null}

        <section className="pt-8 text-center sm:pt-14">
          <div className="mono mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-dim">
            <span className="live-dot h-2 w-2 rounded-full bg-teal" />
            {stats ? `${stats.totals.shillers} shillers · ${stats.totals.tracking} posts tracking` : "loading…"}
          </div>
          <h1 className="glow mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
            Tweet {rules.cashtag}.
            <br />
            <span className="text-acid">Get paid per view.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-dim sm:text-lg">
            Post about {rules.cashtag} on X. We read the view count straight from X and send SOL to your wallet.
            No games, no tiers to unlock, no “rewards later”.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {loggedIn ? (
              <a href="#tweet" className="btn-acid">
                Post now
              </a>
            ) : (
              <a href="/api/auth/x/login" className="btn-acid">
                <XLogo /> Log in with X to start
              </a>
            )}
            {rules.ca ? (
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(rules.ca)}
                className="btn-ghost mono text-xs"
                title="Copy contract address"
              >
                CA: {rules.ca.slice(0, 6)}…{rules.ca.slice(-4)} ⧉
              </button>
            ) : (
              <span className="btn-ghost mono cursor-default text-xs opacity-70">CA coming soon</span>
            )}
          </div>
          {!rules.xConfigured ? (
            <p className="mono mt-4 text-xs text-warn">X login is not configured yet (set X_CLIENT_ID).</p>
          ) : null}
        </section>

        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Reward per post</h2>
              <p className="mt-1 text-sm text-dim">
                A post earns the highest tier it reaches within {rules.trackHours} hours. Paid in SOL.
              </p>
            </div>
            <span className="mono text-xs text-dim">max {rules.maxPerDay} rewarded posts / day</span>
          </div>
          <div className="mt-4">
            <TierTable tiers={rules.tiers} />
          </div>
        </section>

        <TweetNow rules={rules} loggedIn={loggedIn} />

        {me ? <Dashboard me={me} rules={rules} onRefresh={refresh} /> : null}

        <section id="how" className="grid gap-4 sm:grid-cols-3">
          <Step n="1" title="Log in with X">
            Read-only access. We only look at your own posts that mention {rules.cashtag}.
          </Step>
          <Step n="2" title="Post">
            Pick a template or write your own. It must contain {rules.cashtag}. Reposts don’t count
            {rules.allowReplies ? "" : ", replies don’t count"}.
          </Step>
          <Step n="3" title="Get paid">
            Views are read from X. Cross {fmt(rules.tiers[0].views)} views and {rules.tiers[0].sol} SOL is yours. Paid
            to your wallet automatically.
          </Step>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="text-xl font-bold">What does not get paid</h2>
          <ul className="mt-3 grid gap-2 text-sm text-dim sm:grid-cols-2">
            <li>• Accounts younger than {rules.minAccountAgeDays} days or under {rules.minFollowers} followers</li>
            <li>• Views far above your follower count with no likes, replies or reposts (bought views)</li>
            <li>• Posts with 1k+ views and almost zero engagement</li>
            <li>• The same text posted twice, reposts{rules.allowReplies ? "" : ", replies"}</li>
            <li>• More than {rules.maxPerDay} posts in a day (the rest are tracked, not paid)</li>
            <li>• Deleted posts. Payouts already sent are not clawed back, but the account is flagged.</li>
          </ul>
        </section>

        {stats ? <Leaderboard rows={stats.leaderboard} /> : null}

        <footer className="mono flex flex-wrap items-center justify-between gap-3 pt-6 text-xs text-dim">
          <span>{rules.cashtag} · the coin that pays you to shill it</span>
          <span>
            {stats?.treasury ? (
              <a href={`https://solscan.io/account/${stats.treasury}`} target="_blank" rel="noreferrer" className="underline">
                treasury
              </a>
            ) : null}
          </span>
        </footer>
      </main>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="mono text-xs text-acid">{n}</div>
      <div className="mt-1 font-bold">{title}</div>
      <p className="mt-2 text-sm text-dim">{children}</p>
    </div>
  );
}
