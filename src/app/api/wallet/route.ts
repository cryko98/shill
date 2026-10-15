import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getUser, saveUser } from "@/lib/users";
import { isValidWallet } from "@/lib/payout";
import { clientIp, limited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const block = await limited("wallet", clientIp(req), 20, 60);
  if (block) return block;
  const id = await getSessionUserId();
  if (!id) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = await getUser(id);
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { wallet?: string };
  const wallet = (body.wallet ?? "").trim();
  if (wallet && !isValidWallet(wallet)) {
    return NextResponse.json({ error: "That is not a valid Solana wallet address" }, { status: 400 });
  }
  user.wallet = wallet || undefined;
  await saveUser(user);
  return NextResponse.json({ ok: true, wallet: user.wallet ?? null });
}
