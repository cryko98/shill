"use client";

import { useState } from "react";
import type { Payout, PublicUser, Tweet } from "@/lib/types";
import type { PublicRules } from "@/lib/config";
import TierTable, { fmt } from "./TierTable";
import Tilt from "./fx/Tilt";
import Reveal from "./fx/Reveal";
import WalletPanel from "./WalletPanel";

export type Me = {
  user: PublicUser;
  tweets: Tweet[];
  payouts: Payout[];
  claimableSol: number;
  ineligible: string | null;
  /** holder-gate reason, null when the wallet qualifies */
  gate: string | null;
  isAdmin: boolean;
  loggedInWithX: boolean;
};

function claimableOf(t: Tweet) {
  if (t.status === "rejected") return 0;
  return Math.round(Math.max(0, t.rewardSol - (t.claimedSol ?? 0)) * 1e6) / 1e6;
}

export default function Dashboard({ me, rules, onRefresh }: { me: Me; rules: PublicRules; onRefresh: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = (await res.json()) as { newTweets: number; updated: number; error?: string };
      setSyncMsg(
        data.error
          ? data.error
          : `${data.newTweets} new post${data.newTweets === 1 ? "" : "s"} found, ${data.updated} refreshed`
      );
      onRefresh();
    } finally {
      setSyncing(false);
    }
  }

  const t = me.user.totals;
  const canPay = Boolean(me.user.wallet) && !me.gate;

  return (
    <section id="dashboard" className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Claimable now" value={`${me.claimableSol.toFixed(2)} SOL`} accent />
        <Stat label="Claimed" value={`${t.paidSol.toFixed(2)} SOL`} />
        <Stat label="Rewarded posts" value={String(t.rewardedTweets)} />
        <Stat label="Tracked views" value={fmt(t.views)} />
      </div>

      {me.ineligible ? (
        <div className="card border-warn/40 p-4 text-sm text-warn">
          Your account cannot earn yet: {me.ineligible}. Posts are still tracked, nothing is credited.
        </div>
      ) : null}

      <WalletPanel user={me.user} gate={me.gate} rules={rules} onChanged={onRefresh} />
      {rules.claimsLive ? null : (
        <div className="card border-warn/40 p-3 text-xs text-warn">
          Claims open at launch. Rewards you earn until then stay claimable.
        </div>
      )}

      <div className="card card-glow p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Your {rules.cashtag} posts</h3>
            <p className="mt-1 text-sm text-dim">
              Hit <span className="text-ink">Check</span> to pull fresh views from X. When a post crosses a
              milestone, <span className="text-acid">Claim</span> sends the SOL. Tracked for {rules.trackHours}h, max{" "}
              {rules.maxPerDay} rewarded posts per day.
            </p>
          </div>
          <button type="button" onClick={sync} disabled={syncing} className="btn-ghost">
            {syncing ? "Looking for posts…" : "Find my new posts"}
          </button>
        </div>
        {syncMsg ? <div className="mt-2 text-xs text-dim">{syncMsg}</div> : null}
        {me.user.lastSyncError && !syncMsg ? (
          <div className="mt-2 text-xs text-warn">Last sync problem: {me.user.lastSyncError}</div>
        ) : null}

        <div className="mt-4 space-y-3">
          {me.tweets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-dim">
              No posts yet. Hit “Post on X” above, then “Find my new posts”.
            </div>
          ) : (
            me.tweets.map((tw, i) => (
              <Reveal key={tw.id} kind="up" delay={Math.min(i, 6) * 80}>
                <TweetRow tweet={tw} rules={rules} hasWallet={canPay} onChanged={onRefresh} />
              </Reveal>
            ))
          )}
        </div>
      </div>

      {me.payouts.length ? (
        <div className="card card-glow p-5">
          <h3 className="font-bold">Claims</h3>
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

function TweetRow({
  tweet: initial,
  rules,
  hasWallet,
  onChanged,
}: {
  tweet: Tweet;
  rules: PublicRules;
  hasWallet: boolean;
  onChanged: () => void;
}) {
  const [tweet, setTweet] = useState(initial);
  const [busy, setBusy] = useState<"check" | "claim" | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const m = tweet.metrics;
  const next = rules.tiers[tweet.tier + 1];
  const canClaim = claimableOf(tweet);
  const status =
    tweet.status === "rejected"
      ? { label: "Not rewarded", cls: "text-bad" }
      : tweet.status === "settled"
        ? { label: "Settled", cls: "text-dim" }
        : { label: "Tracking", cls: "text-teal" };

  async function check() {
    setBusy("check");
    setMsg(null);
    try {
      const res = await fetch(`/api/tweet/${tweet.id}/check`, { method: "POST" });
      const data = (await res.json()) as { tweet?: Tweet; claimable?: number; error?: string };
      if (data.tweet) setTweet(data.tweet);
      if (data.error) setMsg({ text: data.error, ok: false });
      else if (data.tweet) {
        const c = claimableOf(data.tweet);
        setMsg(
          c > 0
            ? { text: `Milestone reached: ${c} SOL ready to claim`, ok: true }
            : { text: `${fmt(data.tweet.metrics.views)} views, keep going`, ok: true }
        );
      }
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function claim() {
    setBusy("claim");
    setMsg(null);
    try {
      const res = await fetch(`/api/tweet/${tweet.id}/claim`, { method: "POST" });
      const data = (await res.json()) as { tweet?: Tweet; payout?: Payout; error?: string };
      if (data.tweet) setTweet(data.tweet);
      if (data.payout) setMsg({ text: `Sent ${data.payout.sol} SOL to your wallet`, ok: true });
      else setMsg({ text: data.error ?? "Claim failed", ok: false });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`rounded-xl border bg-bg p-4 ${canClaim > 0 ? "border-acid/60 shadow-[0_0_30px_rgba(198,255,61,0.12)]" : "border-line"}`}>
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
          <div className={`text-lg font-bold ${tweet.rewardSol > 0 ? "stat-glow text-acid" : "text-dim"}`}>
            {tweet.rewardSol > 0 ? `${tweet.rewardSol} SOL` : "0 SOL"}
          </div>
          <div className={`mono text-xs ${status.cls}`}>
            {status.label}
            {(tweet.claimedSol ?? 0) > 0 ? ` · ${tweet.claimedSol} claimed` : ""}
          </div>
        </div>
      </div>

      <div className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
        <span className="text-ink">{fmt(m.views)} views</span>
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tweet.status === "tracking" ? (
          <button type="button" onClick={check} disabled={busy !== null} className="btn-ghost !px-3 !py-1.5 text-xs">
            {busy === "check" ? "Checking…" : "Check views"}
          </button>
        ) : null}
        {canClaim > 0 ? (
          <button
            type="button"
            onClick={claim}
            disabled={busy !== null || !hasWallet}
            className="btn-acid !px-4 !py-1.5 text-xs"
            title={hasWallet ? "" : "Verify an eligible wallet first"}
          >
            {busy === "claim" ? "Sending…" : `Claim ${canClaim} SOL`}
          </button>
        ) : null}
        {canClaim > 0 && !hasWallet ? (
          <span className="text-xs text-warn">Verify a wallet holding enough {rules.cashtag} to claim</span>
        ) : null}
        {msg ? <span className={`text-xs ${msg.ok ? "text-teal" : "text-warn"}`}>{msg.text}</span> : null}
      </div>

      {tweet.reason ? <div className="mt-2 text-xs text-warn">{tweet.reason}</div> : null}
      {tweet.flags.length ? <div className="mt-1 text-[11px] text-dim">⚑ {tweet.flags.join(" · ")}</div> : null}
      {tweet.status === "tracking" ? (
        <div className="mt-3 hidden sm:block">
          <TierTable tiers={rules.tiers} current={tweet.tier} tilt={false} />
        </div>
      ) : null}
    </div>
  );
}
