import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getUser } from "@/lib/users";
import { checkTweet } from "@/lib/rewards";
import { ClaimError, claimTweet, claimable } from "@/lib/payout";
import { K, store } from "@/lib/store";
import type { Tweet } from "@/lib/types";
import { clientIp, limited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Claims the unclaimed SOL of one post. The post is re-checked against X
 * first so the paid amount always reflects the latest views and bot filter.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const block = await limited("claim", clientIp(req), 20, 60);
  if (block) return block;
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = await getUser(uid);
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await ctx.params;
  if (!/^\d{5,25}$/.test(id)) return NextResponse.json({ error: "Bad post id" }, { status: 400 });
  let tweet = await store.get<Tweet>(K.tweet(id));
  if (!tweet || tweet.userId !== user.id) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  // Fresh numbers before money moves; a check failure is not fatal, the
  // stored (older, never higher) amount is still safe to pay.
  tweet = (await checkTweet(user, tweet, { force: true })).tweet;

  try {
    const payout = await claimTweet(user, tweet);
    return NextResponse.json({ ok: true, payout, tweet, claimable: claimable(tweet) });
  } catch (e) {
    const status = e instanceof ClaimError ? 400 : 500;
    const message = e instanceof ClaimError ? e.message : "Payout failed, nothing was sent. Try again in a minute.";
    if (status === 500) console.error("[shill] claim failed:", (e as Error).message);
    return NextResponse.json({ error: message, tweet, claimable: claimable(tweet) }, { status });
  }
}
