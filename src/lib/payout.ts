import { randomUUID } from "node:crypto";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { CLAIMS_LIVE } from "./config";
import { holdGateReason } from "./holdings";
import { K, store } from "./store";
import type { Payout, Tweet, User } from "./types";
import { saveUser } from "./users";

function treasury(): Keypair | null {
  const raw = process.env.TREASURY_SECRET_KEY;
  if (!raw) return null;
  try {
    if (raw.trim().startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    return Keypair.fromSecretKey(bs58.decode(raw.trim()));
  } catch {
    return null;
  }
}

export function treasuryAddress(): string | null {
  return treasury()?.publicKey.toBase58() ?? null;
}

export function isValidWallet(addr: string): boolean {
  try {
    return PublicKey.isOnCurve(new PublicKey(addr).toBytes());
  } catch {
    return false;
  }
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

/** SOL earned by a tweet that has not been claimed yet. */
export function claimable(t: Tweet): number {
  if (t.status === "rejected") return 0;
  return round(Math.max(0, t.rewardSol - (t.claimedSol ?? 0)));
}

async function sendSol(to: string, sol: number): Promise<string> {
  const kp = treasury();
  if (!kp) throw new Error("Treasury is not configured");
  const conn = new Connection(process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: new PublicKey(to),
      lamports: Math.round(sol * LAMPORTS_PER_SOL),
    })
  );
  return sendAndConfirmTransaction(conn, tx, [kp], { commitment: "confirmed" });
}

export class ClaimError extends Error {}

/**
 * Pays the unclaimed reward of one tweet to the user's wallet, right now.
 * A short lock per tweet stops double-clicks from paying twice.
 */
export async function claimTweet(user: User, tweet: Tweet): Promise<Payout> {
  if (tweet.userId !== user.id) throw new ClaimError("Not your post");
  if (!user.wallet) throw new ClaimError("Connect and verify your wallet first");
  const gate = holdGateReason(user);
  if (gate) throw new ClaimError(gate);
  const sol = claimable(tweet);
  if (sol <= 0) throw new ClaimError("Nothing to claim on this post yet");
  if (!CLAIMS_LIVE) throw new ClaimError("Claims open at launch. Your reward is saved and stays claimable.");

  const lock = K.claimLock(tweet.id);
  const n = await store.incr(lock);
  if (n === 1) await store.expire(lock, 90);
  if (n > 1) throw new ClaimError("Claim already in progress");

  try {
    const signature = await sendSol(user.wallet, sol);
    const payout: Payout = {
      id: randomUUID(),
      userId: user.id,
      username: user.username,
      wallet: user.wallet,
      sol,
      tweetIds: [tweet.id],
      signature,
      dryRun: false,
      createdAt: Date.now(),
    };
    tweet.claimedSol = round((tweet.claimedSol ?? 0) + sol);
    user.totals.paidSol = round(user.totals.paidSol + sol);
    await store.set(K.tweet(tweet.id), tweet);
    await saveUser(user);
    await store.set(K.payout(payout.id), payout);
    await store.zadd(K.payouts(user.id), payout.id, payout.createdAt);
    return payout;
  } finally {
    await store.del(lock);
  }
}

export async function userPayouts(userId: string, limit = 20): Promise<Payout[]> {
  const ids = await store.zrange(K.payouts(userId), 0, limit - 1, true);
  return (await store.mget<Payout>(ids.map(K.payout))).filter((p): p is Payout => Boolean(p));
}
