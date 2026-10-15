import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionUserId } from "@/lib/session";
import { isValidWallet } from "@/lib/payout";
import { signInMessage } from "@/lib/holdings";
import { K, store } from "@/lib/store";
import { clientIp, limited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hands out a one-time message for the wallet to sign. */
export async function POST(req: Request) {
  const block = await limited("nonce", clientIp(req), 20, 60);
  if (block) return block;
  if (!(await getSessionUserId())) return NextResponse.json({ error: "Log in with X first" }, { status: 401 });

  const { wallet } = (await req.json().catch(() => ({}))) as { wallet?: string };
  if (!wallet || !isValidWallet(wallet)) return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });

  const nonce = randomUUID();
  await store.set(K.nonce(wallet), nonce, { ex: 300 });
  return NextResponse.json({ nonce, message: signInMessage(wallet, nonce) });
}
