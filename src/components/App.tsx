"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PublicRules } from "@/lib/config";
import TierTable, { fmt } from "./TierTable";
import TweetNow, { XLogo } from "./TweetNow";
import Dashboard, { type Me } from "./Dashboard";
import Leaderboard, { type LeaderRow } from "./Leaderboard";
import Background from "./fx/Background";
import Reveal from "./fx/Reveal";
import Marquee from "./fx/Marquee";
import CountUp from "./fx/CountUp";
import ScrollFx from "./fx/ScrollFx";
import Tilt from "./fx/Tilt";

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
  const first = rules.tiers[0];
  const last = rules.tiers[rules.tiers.length - 1];
  const marquee = [
    `${rules.cashtag}`,
    "tweet it, get paid per view",
    `${fmt(first.views)} views = ${first.sol} SOL`,
    `${fmt(last.views)} views = ${last.sol} SOL`,
    "no games, no tiers, no later",
    "check views, claim SOL",
    `holders only · ${rules.minHold.toLocaleString("en-US")} ${rules.cashtag} min`,
    "views read straight from X",
  ];

  return (
    <div className="relative">
      <ScrollFx />
      <Background />

      <header className="site-header">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-acid font-black text-black shadow-[0_0_24px_rgba(198,255,61,0.5)]">
              $
            </span>
            <span className="text-lg font-bold tracking-tight">{rules.cashtag}</span>
          </Link>
          <nav className="flex items-center gap-2">
            <a href="#tweet" className="hidden text-sm text-dim hover:text-ink sm:inline">
              Tweet
            </a>
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
        </div>
      </header>

      <main className="relative z-10">
        {notice ? (
          <div className="mx-auto max-w-5xl px-4 pt-4">
            <div className="card border-warn/40 p-3 text-sm text-warn">
              {notice}{" "}
              <button type="button" className="underline" onClick={() => setNotice(null)}>
                dismiss
              </button>
            </div>
          </div>
        ) : null}

        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 hidden sm:block">
            <div className="orbit orbit-1" />
            <div className="orbit orbit-2" />
            <div className="orbit orbit-3" />
          </div>
          <div className="pointer-events-none absolute inset-0 hidden md:block">
            <span className="coin parallax-fast left-[8%] top-[22%]" style={{ animationDelay: "0s" }}>
              $
            </span>
            <span className="coin coin-sol parallax-slow right-[10%] top-[18%]" style={{ animationDelay: "1.2s" }}>
              ◎
            </span>
            <span className="coin coin-teal parallax-fast left-[16%] bottom-[18%]" style={{ animationDelay: "2.1s" }}>
              ↑
            </span>
            <span className="coin parallax-slow right-[18%] bottom-[24%]" style={{ animationDelay: "0.6s" }}>
              $
            </span>
          </div>

          <div className="hero-fade relative mx-auto max-w-5xl px-4 pb-16 pt-14 text-center sm:pb-24 sm:pt-24">
            <div className="mono mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1 text-xs text-dim backdrop-blur">
              <span className="live-ring live-dot h-2 w-2 rounded-full bg-teal" />
              {stats ? (
                <>
                  <CountUp value={stats.totals.shillers} /> shillers · <CountUp value={stats.totals.tracking} /> posts
                  tracking
                </>
              ) : (
                "loading…"
              )}
            </div>

            <h1 className="hero-title mt-6 text-5xl font-bold sm:text-7xl md:text-8xl">
              <span className="word" style={{ animationDelay: "0.05s" }}>
                Tweet
              </span>{" "}
              <span className="word" style={{ animationDelay: "0.15s" }}>
                {rules.cashtag}.
              </span>
              <br />
              <span className="word shimmer-text" style={{ animationDelay: "0.35s" }}>
                Get paid
              </span>{" "}
              <span className="word shimmer-text" style={{ animationDelay: "0.5s" }}>
                per view.
              </span>
            </h1>

            <Reveal kind="blur" delay={500}>
              <p className="mx-auto mt-6 max-w-xl text-base text-dim sm:text-lg">
                Hold {rules.minHold.toLocaleString("en-US")} {rules.cashtag}, post about it on X, check your views
                here, and when a post hits a milestone, claim the SOL straight to your wallet. No games, no tiers to
                unlock, no “rewards later”.
              </p>
            </Reveal>

            <Reveal kind="up" delay={650}>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {loggedIn ? (
                  <a href="#tweet" className="btn-acid !px-6 !py-3 !text-base">
                    Post now →
                  </a>
                ) : (
                  <a href="/api/auth/x/login" className="btn-acid !px-6 !py-3 !text-base">
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
            </Reveal>

            <div className="mt-14 hidden sm:block">
              <div className="scroll-cue" />
            </div>
          </div>
        </section>

        <Marquee items={marquee} />

        <div className="mx-auto max-w-5xl space-y-10 px-4 pb-24 pt-12">
          {/* TIERS */}
          <Reveal as="section" kind="up" className="card card-glow p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold sm:text-3xl">Reward per post</h2>
                <p className="mt-1 text-sm text-dim">
                  A post earns the highest tier it reaches within {rules.trackHours} hours. Paid in SOL.
                </p>
              </div>
              <span className="mono text-xs uppercase tracking-wider text-dim">
                max {rules.maxPerDay} rewarded posts / day
              </span>
            </div>
            <div className="mt-5">
              <TierTable tiers={rules.tiers} />
            </div>
          </Reveal>

          {/* BIG NUMBERS */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Reveal kind="scale" delay={0}>
              <Tilt className="card card-glow rounded-2xl p-6 text-center">
                <div className="stat-glow text-4xl font-bold text-acid sm:text-5xl">
                  <CountUp value={first.sol} format={(n) => n.toFixed(1)} /> <span className="text-xl">SOL</span>
                </div>
                <div className="mono mt-2 text-xs uppercase tracking-wider text-dim">for your first {first.views} views</div>
              </Tilt>
            </Reveal>
            <Reveal kind="scale" delay={120}>
              <Tilt className="card card-glow rounded-2xl p-6 text-center">
                <div className="stat-glow text-4xl font-bold text-teal sm:text-5xl">
                  <CountUp value={last.sol} format={(n) => n.toFixed(n % 1 ? 2 : 0)} /> <span className="text-xl">SOL</span>
                </div>
                <div className="mono mt-2 text-xs uppercase tracking-wider text-dim">for a {fmt(last.views)}-view banger</div>
              </Tilt>
            </Reveal>
            <Reveal kind="scale" delay={240}>
              <Tilt className="card card-glow rounded-2xl p-6 text-center">
                <div className="stat-glow text-4xl font-bold text-sol sm:text-5xl">
                  <CountUp value={rules.maxPerDay} />
                  <span className="text-xl">×</span>
                </div>
                <div className="mono mt-2 text-xs uppercase tracking-wider text-dim">paid posts every single day</div>
              </Tilt>
            </Reveal>
          </div>

          <Reveal kind="up">
            <TweetNow rules={rules} loggedIn={loggedIn} />
          </Reveal>

          {me ? (
            <Reveal kind="up">
              <Dashboard me={me} rules={rules} onRefresh={refresh} />
            </Reveal>
          ) : null}

          {/* HOW */}
          <section id="how" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Reveal kind="left" delay={0}>
              <Step n="01" title="Log in with X">
                Read-only access. We only look at your own posts that mention {rules.cashtag}.
              </Step>
            </Reveal>
            <Reveal kind="up" delay={100}>
              <Step n="02" title="Connect your wallet">
                Sign a free message to prove it is yours.{" "}
                {rules.holdGate
                  ? `It must hold at least ${rules.minHold.toLocaleString("en-US")} ${rules.cashtag}.`
                  : `Holders only: ${rules.minHold.toLocaleString("en-US")} ${rules.cashtag} minimum once the CA is live.`}
              </Step>
            </Reveal>
            <Reveal kind="up" delay={200}>
              <Step n="03" title="Post">
                Pick a template or write your own. It must contain {rules.cashtag}. Reposts don’t count
                {rules.allowReplies ? "" : ", replies don’t count"}.
              </Step>
            </Reveal>
            <Reveal kind="right" delay={300}>
              <Step n="04" title="Check & claim">
                Hit Check to see your views. Cross {fmt(first.views)} views, hit Claim, and {first.sol} SOL lands in
                your wallet right away.
              </Step>
            </Reveal>
          </section>

          <Marquee items={[...marquee].reverse()} reverse />

          <Reveal as="section" kind="up" className="card card-glow p-5 sm:p-7">
            <h2 className="text-2xl font-bold">What does not get paid</h2>
            <ul className="mt-4 grid gap-2 text-sm text-dim sm:grid-cols-2">
              <li>
                • Wallets holding less than {rules.minHold.toLocaleString("en-US")} {rules.cashtag} (posts are tracked,
                nothing is credited until you hold enough)
              </li>
              <li>• Accounts younger than {rules.minAccountAgeDays} days or under {rules.minFollowers} followers</li>
              <li>• Views far above your follower count with no likes, replies or reposts (bought views)</li>
              <li>• Posts with 1k+ views and almost zero engagement</li>
              <li>• The same text posted twice, reposts{rules.allowReplies ? "" : ", replies"}</li>
              <li>• More than {rules.maxPerDay} posts in a day (the rest are tracked, not paid)</li>
              <li>• Deleted posts. Claims already sent are not clawed back, but the account is flagged.</li>
            </ul>
          </Reveal>

          {stats ? <Leaderboard rows={stats.leaderboard} /> : null}

          <Reveal kind="blur">
            <footer className="mono flex flex-wrap items-center justify-between gap-3 pt-6 text-xs text-dim">
              <span>{rules.cashtag} · the coin that pays you to shill it</span>
              <span>
                {stats?.treasury ? (
                  <a
                    href={`https://solscan.io/account/${stats.treasury}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    treasury
                  </a>
                ) : null}
              </span>
            </footer>
          </Reveal>
        </div>
      </main>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <Tilt className="card card-glow h-full rounded-2xl p-6" max={8}>
      <div className="mono text-sm font-bold text-acid">{n}</div>
      <div className="mt-2 text-lg font-bold">{title}</div>
      <p className="mt-2 text-sm text-dim">{children}</p>
    </Tilt>
  );
}
