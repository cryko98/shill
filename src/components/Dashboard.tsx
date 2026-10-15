"use client";

import { useState } from "react";
import type { Payout, PublicUser, Tweet } from "@/lib/types";
import type { PublicRules } from "@/lib/config";
import TierTable, { fmt } from "./TierTable";
import Tilt from "./fx/Tilt";
import Reveal from "./fx/Reveal";

export type Me = {
  user: PublicUser;
  tweets: Tweet[];
  payouts: Payout[];
  owedSol: number;
  ineligible: string | null;
  isAdmin: boolean;
  loggedInWithX: boolean;
};

export default function Dashboard({ me, rules, onRefresh }: { me: Me; rules: PublicRules; onRefresh: () => void }) {
  const [wallet, setWallet] = useState(me.user.wallet ?? "");
  const [walletMsg, setWalletMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function saveWallet() {
    setWalletMsg(null);
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const data = await res.json();
    setWalletMsg(res.ok ? "Saved" : data.error ?? "Failed");
    if (res.ok) onRefresh();
  }

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = (await res.json()) as { newTweets: number; updated: number; error?: string };
      setSyncMsg(
        data.error
          ? data.error
          : `${data.newTweets} new post${data.newTweets === 1 ? "" : "s"}, ${data.updated} refreshed`
      );
      onRefresh();
    } finally {
      setSyncing(false);
    }
  }

  const t = me.user.totals;

  return (
    <section id="dashboard" className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Earned" value={`${t.earnedSol.toFixed(3)} SOL`} accent />
        <Stat label="Unpaid" value={`${me.owedSol.toFixed(3)} SOL`} />
        <Stat label="Rewarded posts" value={String(t.rewardedTweets)} />
        <Stat label="Tracked views" value={fmt(t.views)} />
      </div>

      {me.ineligible ? (
        <div className="card border-warn/40 p-4 text-sm text-warn">
          Your account cannot earn yet: {me.ineligible}. Posts are still tracked, nothing is credited.
        </div>
      ) : null}

      <div className="card p-5">
        <h3 className="font-bold">Payout wallet</h3>
        <p className="mt-1 text-sm text-dim">
          SOL is sent here once you have at least {rules.minPayoutSol} SOL unpaid.{" "}
          {rules.payoutsLive ? "Payouts run every hour." : "Payouts are in dry-run until launch."}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Your Solana wallet address"
            className="mono flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-acid"
          />
          <button type="button" onClick={saveWallet} className="btn-ghost">
            Save
          </button>
        </div>
        {walletMsg ? <div className="mt-2 text-xs text-dim">{walletMsg}</div> : null}
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Your {rules.cashtag} posts</h3>
            <p className="mt-1 text-sm text-dim">
              Tracked for {rules.trackHours}h after posting. Max {rules.maxPerDay} rewarded posts per day.
            </p>
          </div>
          <button type="button" onClick={sync} disabled={syncing} className="btn-ghost">
            {syncing ? "Syncing…" : "Sync my posts"}
          </button>
        </div>
        {syncMsg ? <div className="mt-2 text-xs text-dim">{syncMsg}</div> : null}
        {me.user.lastSyncError && !syncMsg ? (
          <div className="mt-2 text-xs text-warn">Last sync problem: {me.user.lastSyncError}</div>
        ) : null}

        <div className="mt-4 space-y-3">
          {me.tweets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-dim">
              No posts yet. Hit “Post on X” above, then sync.
            </div>
          ) : (
            me.tweets.map((tw, i) => (
              <Reveal key={tw.id} kind="up" delay={Math.min(i, 6) * 80}>
                <TweetRow tweet={tw} rules={rules} />
              </Reveal>
            ))
          )}
        </div>
      </div>

      {me.payouts.length ? (
        <div className="card p-5">
          <h3 className="font-bold">Payouts</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {me.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="mono text-dim">{new Date(p.createdAt).toLocaleString()}</span>
                <span className="font-semibold text-teal">{p.sol.toFixed(3)} SOL</span>
                {p.signature ? (
                  <a
                    href={`https://solscan.io/tx/${p.signature}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-xs text-dim underline"
                  >
                    tx
                  </a>
                ) : (
                  <span className="text-xs text-dim">dry run</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <Tilt className="card card-glow rounded-2xl p-4" max={8}>
      <div className="mono text-xs uppercase tracking-wider text-dim">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? "stat-glow text-acid" : ""}`}>{value}</div>
    </Tilt>
  );
}

function TweetRow({ tweet, rules }: { tweet: Tweet; rules: PublicRules }) {
  const m = tweet.metrics;
  const next = rules.tiers[tweet.tier + 1];
  const status =
    tweet.status === "rejected"
      ? { label: "Not rewarded", cls: "text-bad" }
      : tweet.status === "settled"
        ? { label: "Settled", cls: "text-dim" }
        : { label: "Tracking", cls: "text-teal" };

  return (
    <div className="rounded-xl border border-line bg-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <a
          href={`https://x.com/${tweet.username}/status/${tweet.id}`}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 text-sm leading-relaxed hover:underline"
        >
          {tweet.text.length > 200 ? `${tweet.text.slice(0, 200)}…` : tweet.text}
        </a>
        <div className="text-right">
          <div className={`text-lg font-bold ${tweet.rewardSol > 0 ? "text-acid" : "text-dim"}`}>
            {tweet.rewardSol > 0 ? `+${tweet.rewardSol} SOL` : "0 SOL"}
          </div>
          <div className={`mono text-xs ${status.cls}`}>{status.label}</div>
        </div>
      </div>
      <div className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
        <span>{fmt(m.views)} views</span>
        <span>{m.likes} likes</span>
        <span>{m.reposts} reposts</span>
        <span>{m.replies} replies</span>
        <span>{new Date(tweet.createdAt).toLocaleString()}</span>
      </div>
      {tweet.status === "tracking" && next ? (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="bar-fill h-full rounded-full"
              style={{ width: `${Math.min(100, (m.views / next.views) * 100)}%` }}
            />
          </div>
          <div className="mono mt-1 text-[11px] text-dim">
            {fmt(Math.max(0, next.views - m.views))} more views to {next.sol} SOL
          </div>
        </div>
      ) : null}
      {tweet.reason ? <div className="mt-2 text-xs text-warn">{tweet.reason}</div> : null}
      {tweet.flags.length ? <div className="mt-1 text-[11px] text-dim">⚑ {tweet.flags.join(" · ")}</div> : null}
      {tweet.status === "tracking" ? <TierTableMini tiers={rules.tiers} current={tweet.tier} /> : null}
    </div>
  );
}

function TierTableMini({ tiers, current }: { tiers: PublicRules["tiers"]; current: number }) {
  return (
    <div className="mt-3 hidden sm:block">
      <TierTable tiers={tiers} current={current} tilt={false} />
    </div>
  );
}
