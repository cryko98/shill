import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getUser, toPublic } from "@/lib/users";
import { accountIneligibility, userTweets } from "@/lib/rewards";
import { userPayouts } from "@/lib/payout";
import { ADMIN_USERNAMES } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const id = await getSessionUserId();
  if (!id) return NextResponse.json({ user: null });
  const user = await getUser(id);
  if (!user) return NextResponse.json({ user: null });
  const [tweets, payouts] = await Promise.all([userTweets(id, 100), userPayouts(id)]);
  return NextResponse.json({
    user: toPublic(user),
    tweets,
    payouts,
    owedSol: Math.round((user.totals.earnedSol - user.totals.paidSol) * 1e6) / 1e6,
    ineligible: accountIneligibility(user),
    isAdmin: ADMIN_USERNAMES.includes(user.username.toLowerCase()),
    loggedInWithX: Boolean(user.tokens),
  });
}
