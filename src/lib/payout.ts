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
import { MIN_PAYOUT_SOL, PAYOUTS_LIVE } from "./config";
import { K, store } from "./store";
import type { Payout, User } from "./types";
import { getUser, saveUser } from "./users";

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

async function sendSol(to: string, sol: number): Promise<string> {
  const kp = treasury();
  if (!kp) throw new Error("TREASURY_SECRET_KEY is missing or invalid");
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

export type PayoutRun = { live: boolean; sent: Payout[]; skipped: { username: string; reason: string }[] };

/**
 * Pay every user whose unpaid balance clears MIN_PAYOUT_SOL and who set a wallet.
 * Dry runs record nothing and send nothing; they just report what would go out.
 */
export async function runPayouts(opts: { live: boolean }): Promise<PayoutRun> {
  const live = opts.live && PAYOUTS_LIVE;
  const userIds = await store.zrange(K.owed, 0, -1, true);
  const sent: Payout[] = [];
  const skipped: PayoutRun["skipped"] = [];

  for (const id of userIds) {
    const user = await getUser(id);
    if (!user) continue;
    const owed = round(user.totals.earnedSol - user.totals.paidSol);
    if (owed < MIN_PAYOUT_SOL) {
      if (owed <= 0) await store.zrem(K.owed, id);
      continue;
    }
    if (!user.wallet) {
      skipped.push({ username: user.username, reason: "no wallet set" });
      continue;
    }
    const payout: Payout = {
      id: randomUUID(),
      userId: id,
      username: user.username,
      wallet: user.wallet,
      sol: owed,
      tweetIds: [],
      dryRun: !live,
      createdAt: Date.now(),
    };
    if (!live) {
      sent.push(payout);
      continue;
    }
    try {
      payout.signature = await sendSol(user.wallet, owed);
      await markPaid(user, payout);
      sent.push(payout);
    } catch (e) {
      payout.error = (e as Error).message;
      skipped.push({ username: user.username, reason: payout.error });
    }
  }
  return { live, sent, skipped };
}

async function markPaid(user: User, payout: Payout) {
  user.totals.paidSol = round(user.totals.paidSol + payout.sol);
  await saveUser(user);
  await store.set(K.payout(payout.id), payout);
  await store.zadd(K.payouts(user.id), payout.id, payout.createdAt);
  await store.zincrby(K.owed, user.id, -payout.sol);
  const left = round(user.totals.earnedSol - user.totals.paidSol);
  if (left <= 0) await store.zrem(K.owed, user.id);
}

export async function userPayouts(userId: string, limit = 20): Promise<Payout[]> {
  const ids = await store.zrange(K.payouts(userId), 0, limit - 1, true);
  return (await store.mget<Payout>(ids.map(K.payout))).filter((p): p is Payout => Boolean(p));
}
