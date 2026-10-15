import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getUser } from "@/lib/users";
import { holdGateReason, refreshHolding } from "@/lib/holdings";
import { clientIp, limited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-reads the linked wallet's token balance from the chain. */
export async function POST(req: Request) {
  const block = await limited("balance", clientIp(req), 12, 60);
  if (block) return block;
  const id = await getSessionUserId();
  if (!id) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = await getUser(id);
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const holding = await refreshHolding(user, { force: true });
  return NextResponse.json({ holding, gate: holdGateReason(user) });
}
