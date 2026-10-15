import { NextResponse } from "next/server";
import { K, store } from "@/lib/store";
import { publicRules } from "@/lib/config";
import { treasuryAddress } from "@/lib/payout";
import type { User } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ids = await store.zrange(K.leaderboard, 0, 19, true);
  const users = (await store.mget<User>(ids.map(K.user))).filter((u): u is User => Boolean(u));
  const leaderboard = users
    .map((u) => ({
      username: u.username,
      name: u.name,
      avatar: u.avatar ?? null,
      earnedSol: u.totals.earnedSol,
      rewardedTweets: u.totals.rewardedTweets,
      views: u.totals.views,
    }))
    .sort((a, b) => b.earnedSol - a.earnedSol);
  const shillers = await store.scard(K.users);
  const tracking = await store.scard(K.tracking);
  return NextResponse.json({
    rules: publicRules(),
    treasury: treasuryAddress(),
    totals: {
      shillers,
      tracking,
      paidSol: leaderboard.reduce((s, u) => s + u.earnedSol, 0),
    },
    leaderboard,
  });
}
