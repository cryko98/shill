import { CASHTAG, MIN_HOLD_TOKENS, TOKEN_CA } from "./config";
import { K, store } from "./store";
import type { User } from "./types";
import { saveUser } from "./users";

const RPC = process.env.SOLANA_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const CACHE_SECONDS = 60;
/** How old a stored holding snapshot may be before sync/check refreshes it. */
const STALE_MS = 5 * 60_000;

/** The holder gate is only active once the token has a contract address. */
export const HOLD_GATE_ACTIVE = Boolean(TOKEN_CA) && MIN_HOLD_TOKENS > 0;

export function signInMessage(wallet: string, nonce: string) {
  return [
    `${CASHTAG} — verify your wallet`,
    "",
    "Signing this message proves you own this wallet.",
    "It is free and does not send a transaction.",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

type TokenAccount = {
  account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } };
};

/**
 * Whole tokens of `mint` a wallet holds, summed over its token accounts.
 * Null when the RPC could not answer; callers must not read that as zero.
 */
export async function getTokenBalance(wallet: string, mint: string, opts: { fresh?: boolean } = {}): Promise<number | null> {
  const key = K.balance(wallet, mint);
  if (!opts.fresh) {
    const cached = await store.get<number>(key);
    if (cached !== null) return cached;
  }
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [wallet, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { value?: TokenAccount[] }; error?: unknown };
    if (json.error || !json.result) return null;
    const balance = (json.result.value ?? []).reduce(
      (sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
      0
    );
    await store.set(key, balance, { ex: CACHE_SECONDS });
    return balance;
  } catch {
    return null;
  }
}

/**
 * Refreshes the user's holding snapshot (amount + eligibility) when it is
 * missing, stale, or `force` is set. Persists the user. RPC failures keep the
 * previous snapshot rather than flipping eligibility to false.
 */
export async function refreshHolding(user: User, opts: { force?: boolean } = {}): Promise<User["holding"]> {
  if (!HOLD_GATE_ACTIVE) {
    user.holding = { amount: null, checkedAt: Date.now(), eligible: true };
    return user.holding;
  }
  if (!user.wallet) {
    user.holding = { amount: 0, checkedAt: Date.now(), eligible: false };
    return user.holding;
  }
  const prev = user.holding;
  if (!opts.force && prev && Date.now() - prev.checkedAt < STALE_MS) return prev;

  const amount = await getTokenBalance(user.wallet, TOKEN_CA, { fresh: opts.force });
  if (amount === null) {
    if (prev) return prev;
    user.holding = { amount: null, checkedAt: Date.now(), eligible: false };
  } else {
    user.holding = { amount, checkedAt: Date.now(), eligible: amount >= MIN_HOLD_TOKENS };
  }
  await saveUser(user);
  return user.holding;
}

/** Why the user cannot earn right now because of the holder gate, or null. */
export function holdGateReason(user: User): string | null {
  if (!HOLD_GATE_ACTIVE) return null;
  if (!user.wallet) return `Connect a wallet holding at least ${MIN_HOLD_TOKENS.toLocaleString("en-US")} ${CASHTAG}`;
  const h = user.holding;
  if (!h) return "Wallet balance not checked yet";
  if (h.amount === null) return "Could not read your wallet balance, try again";
  if (!h.eligible) {
    const missing = Math.max(0, MIN_HOLD_TOKENS - h.amount);
    return `Hold at least ${MIN_HOLD_TOKENS.toLocaleString("en-US")} ${CASHTAG} (you need ${Math.ceil(missing).toLocaleString("en-US")} more)`;
  }
  return null;
}
