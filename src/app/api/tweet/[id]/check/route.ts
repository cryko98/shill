import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getUser } from "@/lib/users";
import { checkTweet } from "@/lib/rewards";
import { claimable } from "@/lib/payout";
import { K, store } from "@/lib/store";
import type { Tweet } from "@/lib/types";
import { clientIp, limited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Re-reads one post's views from X and returns it with its claimable amount. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const block = await limited("check", clientIp(req), 40, 60);
  if (block) return block;
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = await getUser(uid);
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await ctx.params;
  if (!/^\d{5,25}$/.test(id)) return NextResponse.json({ error: "Bad post id" }, { status: 400 });
  const tweet = await store.get<Tweet>(K.tweet(id));
  if (!tweet || tweet.userId !== user.id) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const result = await checkTweet(user, tweet);
  return NextResponse.json({ tweet: result.tweet, claimable: claimable(result.tweet), error: result.error });
}
