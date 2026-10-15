"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import type { PublicRules } from "@/lib/config";
import type { PublicUser } from "@/lib/types";

type Holding = NonNullable<PublicUser["holding"]>;

function short(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function fmtTokens(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0);
}

/**
 * Connect → sign a nonce → the server links the wallet to the X account and
 * reads the $TICKER balance. Shows how far the wallet is from the holder gate.
 */
export default function WalletPanel({
  user,
  gate,
  rules,
  onChanged,
}: {
  user: PublicUser;
  gate: string | null;
  rules: PublicRules;
  onChanged: () => void;
}) {
  const { publicKey, signMessage, connected, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [busy, setBusy] = useState<"verify" | "refresh" | "unlink" | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const linked = user.wallet ?? null;
  const connectedAddr = publicKey?.toBase58() ?? null;
  const needsVerify = connected && connectedAddr && connectedAddr !== linked;
  const holding: Holding | null = user.holding ?? null;
  const eligible = !gate;

  async function verify() {
    if (!connectedAddr || !signMessage) {
      setMsg({ text: "This wallet cannot sign messages, try Phantom or Solflare", ok: false });
      return;
    }
    setBusy("verify");
    setMsg(null);
    try {
      const n = await fetch("/api/wallet/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: connectedAddr }),
      });
      const nd = (await n.json()) as { message?: string; error?: string };
      if (!nd.message) throw new Error(nd.error ?? "Could not start verification");
      const sig = await signMessage(new TextEncoder().encode(nd.message));
      const v = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: connectedAddr, signature: bs58.encode(sig) }),
      });
      const vd = (await v.json()) as { error?: string; gate?: string | null; holding?: Holding };
      if (!v.ok) throw new Error(vd.error ?? "Verification failed");
      setMsg(
        vd.gate
          ? { text: vd.gate, ok: false }
          : { text: `Wallet verified${vd.holding?.amount != null ? `, ${fmtTokens(vd.holding.amount)} ${rules.cashtag}` : ""}. You are in.`, ok: true }
      );
      onChanged();
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    setMsg(null);
    try {
      const r = await fetch("/api/wallet/refresh", { method: "POST" });
      const d = (await r.json()) as { gate?: string | null; holding?: Holding };
      setMsg(d.gate ? { text: d.gate, ok: false } : { text: "Balance updated, you are eligible", ok: true });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function unlink() {
    setBusy("unlink");
    setMsg(null);
    try {
      await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disconnect: true }),
      });
      await disconnect().catch(() => {});
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  const pct = holding?.amount != null && rules.minHold > 0 ? Math.min(100, (holding.amount / rules.minHold) * 100) : 0;

  return (
    <div className={`card card-glow p-5 ${eligible && linked ? "border-teal/40" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">Wallet</h3>
          <p className="mt-1 text-sm text-dim">
            {rules.holdGate ? (
              <>
                Hold at least <span className="text-ink">{rules.minHold.toLocaleString("en-US")} {rules.cashtag}</span> to
                earn and claim. Claims are sent to this wallet.
              </>
            ) : (
              <>Claims are sent to this wallet. The holder gate switches on once the CA is set.</>
            )}
          </p>
        </div>
        {linked ? (
          <span className={`mono rounded-full border px-3 py-1 text-xs ${eligible ? "border-teal/50 text-teal" : "border-warn/50 text-warn"}`}>
            {eligible ? "✓ eligible" : "not eligible yet"}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!connected ? (
          <button type="button" onClick={() => setVisible(true)} disabled={connecting} className="btn-acid">
            {connecting ? "Connecting…" : linked ? "Reconnect wallet" : "Connect wallet"}
          </button>
        ) : null}
        {needsVerify ? (
          <button type="button" onClick={verify} disabled={busy !== null} className="btn-acid">
            {busy === "verify" ? "Waiting for signature…" : `Verify ${short(connectedAddr!)}`}
          </button>
        ) : null}
        {linked ? (
          <>
            <span className="mono rounded-xl border border-line bg-bg px-3 py-2 text-xs text-dim">
              linked: <span className="text-ink">{short(linked)}</span>
            </span>
            {rules.holdGate ? (
              <button type="button" onClick={refresh} disabled={busy !== null} className="btn-ghost !px-3 !py-2 text-xs">
                {busy === "refresh" ? "Reading…" : "Refresh balance"}
              </button>
            ) : null}
            <button type="button" onClick={unlink} disabled={busy !== null} className="btn-ghost !px-3 !py-2 text-xs">
              Unlink
            </button>
          </>
        ) : null}
        {connected && !needsVerify && !linked ? (
          <span className="text-xs text-dim">Connected, now verify to link it.</span>
        ) : null}
      </div>

      {rules.holdGate && linked ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="mono text-dim">
              {holding?.amount == null ? "balance unknown" : `${fmtTokens(holding.amount)} ${rules.cashtag}`}
            </span>
            <span className="mono text-dim">goal {fmtTokens(rules.minHold)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
            <div className={`h-full rounded-full ${eligible ? "bg-teal" : "bar-fill"}`} style={{ width: `${pct}%` }} />
          </div>
          {!eligible && rules.buyUrl ? (
            <a href={rules.buyUrl} target="_blank" rel="noreferrer" className="btn-ghost mt-3 !px-3 !py-1.5 text-xs">
              Buy {rules.cashtag} ↗
            </a>
          ) : null}
        </div>
      ) : null}

      {gate && linked && !msg ? <div className="mt-3 text-xs text-warn">{gate}</div> : null}
      {msg ? <div className={`mt-3 text-xs ${msg.ok ? "text-teal" : "text-warn"}`}>{msg.text}</div> : null}
    </div>
  );
}
