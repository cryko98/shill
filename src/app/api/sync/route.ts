import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getUser } from "@/lib/users";
import { syncUser } from "@/lib/rewards";
import { clientIp, limited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const block = await limited("sync", clientIp(req), 30, 60);
  if (block) return block;
  const id = await getSessionUserId();
  if (!id) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = await getUser(id);
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const result = await syncUser(user);
  return NextResponse.json(result);
}
