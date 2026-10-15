import { NextResponse } from "next/server";
import { beginLogin } from "@/lib/x";
import { clientIp, limited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const block = await limited("login", clientIp(req), 20, 60);
  if (block) return block;
  if (!process.env.X_CLIENT_ID) {
    return NextResponse.json({ error: "X_CLIENT_ID is not configured" }, { status: 500 });
  }
  const url = await beginLogin();
  return NextResponse.redirect(url);
}
