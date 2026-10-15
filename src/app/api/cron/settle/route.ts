import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSessionUserId } from "@/lib/session";
import { getUser, isAdmin } from "@/lib/users";
import { settleAll } from "@/lib/rewards";
import { runPayouts } from "@/lib/payout";
import { ADMIN_USERNAMES, PAYOUTS_LIVE } from "@/lib/config";
import { clientIp, limited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Vercel Cron hits this hourly with CRON_SECRET: refresh every tracked tweet,
 * credit new tiers, then pay out. An admin may call it from the browser;
 * that plans (dry run) unless ?live=1 is passed and PAYOUTS_LIVE is on.
 */
export async function GET(req: Request) {
  const block = await limited("cron", clientIp(req), 10, 60);
  if (block) return block;

  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const byCron = Boolean(secret) && sameSecret(auth, `Bearer ${secret}`);
  let byAdmin = false;
  if (!byCron) {
    const id = await getSessionUserId();
    byAdmin = isAdmin(id ? await getUser(id) : null, ADMIN_USERNAMES);
  }
  if (!byCron && !byAdmin) return NextResponse.json({ error: "Not allowed" }, { status: 401 });

  const wantLive = new URL(req.url).searchParams.get("live") === "1";
  const settle = await settleAll();
  const payouts = await runPayouts({ live: byCron || wantLive });

  return NextResponse.json({
    payoutsLive: PAYOUTS_LIVE,
    trigger: byCron ? "cron" : "admin",
    settle,
    payouts,
  });
}
