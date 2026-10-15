import { createHash } from "node:crypto";
import {
  ALLOW_REPLIES,
  CAMPAIGN_START,
  CASHTAG,
  CHECK_COOLDOWN_MIN,
  MAX_REWARDED_PER_DAY,
  MAX_VIEWS_PER_FOLLOWER,
  MIN_ACCOUNT_AGE_DAYS,
  MIN_ENGAGEMENT_RATE,
  MIN_FOLLOWERS,
  SYNC_COOLDOWN_MIN,
  TIERS,
  TICKER,
  TOKEN_CA,
  TRACK_HOURS,
  tierFor,
} from "./config";
import { K, store } from "./store";
import type { Tweet, User } from "./types";
import { getUser, saveUser } from "./users";
import { holdGateReason, refreshHolding } from "./holdings";
import { appBearer, lookupTweets, searchUserTweets, userToken, type XTweet } from "./x";

/** Credit only once a tweet is this old: lets engagement catch up with views. */
const MIN_AGE_BEFORE_CREDIT_MS = 30 * 60 * 1000;
/** Engagement-rate check only means something once there is real reach. */
const ENGAGEMENT_CHECK_FROM_VIEWS = 1000;

const cashtagRe = new RegExp(`\\$${TICKER}\\b`, "i");

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}$#@ ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function textHash(userId: string, text: string): string {
  return createHash("sha256").update(`${userId}\n${normalizeText(text)}`).digest("hex").slice(0, 32);
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Account-level reason a user cannot earn, or null when eligible. */
export function accountIneligibility(user: User): string | null {
  const ageDays = (Date.now() - Date.parse(user.xCreatedAt)) / 86_400_000;
  if (ageDays < MIN_ACCOUNT_AGE_DAYS) return `Account younger than ${MIN_ACCOUNT_AGE_DAYS} days`;
  if (user.followers < MIN_FOLLOWERS) return `Fewer than ${MIN_FOLLOWERS} followers`;
  return null;
}

function engagement(m: Tweet["metrics"]) {
  return m.likes + m.replies + m.reposts + m.quotes + m.bookmarks;
}

/** Fake-reach heuristics. Returns informational flags and a hard reject reason, if any. */
export function inspect(user: User, tweet: Tweet): { flags: string[]; reject: string | null } {
  const flags: string[] = [];
  const m = tweet.metrics;
  const followers = Math.max(user.followers, 1);

  if (m.views > followers * MAX_VIEWS_PER_FOLLOWER) {
    const eng = engagement(m) / Math.max(m.views, 1);
    // Genuine viral posts carry engagement; bought views do not.
    if (eng < MIN_ENGAGEMENT_RATE * 2) {
      flags.push("views far above follower count with little engagement");
      return { flags, reject: "Suspicious reach (views vs. followers)" };
    }
    flags.push("views far above follower count");
  }

  if (m.views >= ENGAGEMENT_CHECK_FROM_VIEWS) {
    const rate = engagement(m) / m.views;
    if (rate < MIN_ENGAGEMENT_RATE) {
      flags.push(`engagement rate ${(rate * 100).toFixed(2)}% below minimum`);
      return { flags, reject: "Engagement too low for the view count (botted views)" };
    }
  }

  return { flags, reject: null };
}

function metricsOf(x: XTweet): Tweet["metrics"] {
  const p = x.public_metrics ?? {};
  return {
    views: p.impression_count ?? 0,
    likes: p.like_count ?? 0,
    replies: p.reply_count ?? 0,
    reposts: p.retweet_count ?? 0,
    quotes: p.quote_count ?? 0,
    bookmarks: p.bookmark_count ?? 0,
  };
}

function fullText(x: XTweet): string {
  return x.note_tweet?.text || x.text;
}

async function reject(tweet: Tweet, reason: string) {
  tweet.status = "rejected";
  tweet.reason = reason;
  tweet.settledAt = Date.now();
  await store.srem(K.tracking, tweet.id);
}

/** First sight of a tweet: structural checks that never change. */
async function ingest(user: User, x: XTweet): Promise<Tweet> {
  const text = fullText(x);
  const isReply = Boolean(x.referenced_tweets?.some((r) => r.type === "replied_to"));
  const tweet: Tweet = {
    id: x.id,
    userId: user.id,
    username: user.username,
    text,
    createdAt: x.created_at,
    isReply,
    hasCashtag: cashtagRe.test(text),
    hasCA: Boolean(TOKEN_CA) && text.includes(TOKEN_CA),
    metrics: metricsOf(x),
    tier: -1,
    rewardSol: 0,
    status: "tracking",
    flags: [],
    firstSeenAt: Date.now(),
    lastCheckedAt: Date.now(),
  };

  const created = Date.parse(x.created_at);
  const start = Number.isFinite(CAMPAIGN_START) ? CAMPAIGN_START : user.joinedAt;

  if (!tweet.hasCashtag) await reject(tweet, `Missing ${CASHTAG}`);
  else if (x.referenced_tweets?.some((r) => r.type === "retweeted")) await reject(tweet, "Reposts do not count");
  else if (isReply && !ALLOW_REPLIES) await reject(tweet, "Replies do not count");
  else if (created < start - 60_000) await reject(tweet, "Posted before you joined");
  else {
    const h = K.textHash(textHash(user.id, text));
    const dup = await store.get<string>(h);
    if (dup && dup !== tweet.id) await reject(tweet, "Same text as an earlier post");
    else await store.set(h, tweet.id);
  }

  await store.set(K.tweet(tweet.id), tweet);
  await store.zadd(K.userTweets(user.id), tweet.id, created);
  if (tweet.status === "tracking") await store.sadd(K.tracking, tweet.id);
  return tweet;
}

/**
 * Apply fresh metrics: credit newly reached tiers, run the bot filter,
 * settle once the tracking window is over. Mutates and persists.
 */
export async function applyMetrics(user: User, tweet: Tweet, fresh: Tweet["metrics"]): Promise<Tweet> {
  if (tweet.status !== "tracking") return tweet;

  const prevViews = tweet.metrics.views;
  tweet.metrics = fresh;
  tweet.lastCheckedAt = Date.now();
  user.totals.views += Math.max(0, fresh.views - prevViews);

  const accountIssue = accountIneligibility(user);
  if (accountIssue) {
    await reject(tweet, accountIssue);
    await store.set(K.tweet(tweet.id), tweet);
    return tweet;
  }

  const { flags, reject: why } = inspect(user, tweet);
  tweet.flags = flags;
  if (why) {
    await reject(tweet, why);
    await store.set(K.tweet(tweet.id), tweet);
    return tweet;
  }

  const ageMs = Date.now() - Date.parse(tweet.createdAt);
  const reached = tierFor(fresh.views);

  // Holder gate: not a rejection, the post keeps tracking and credits once the bag is there.
  const gate = holdGateReason(user);
  if (gate) {
    if (reached > tweet.tier) tweet.flags = [...flags, `milestone reached, not credited: ${gate}`];
  } else if (reached > tweet.tier && ageMs >= MIN_AGE_BEFORE_CREDIT_MS) {
    if (tweet.tier < 0) {
      // First credit for this tweet: enforce the per-day cap.
      const dk = K.rewardedDay(user.id, dayKey(tweet.createdAt));
      const n = await store.incr(dk);
      if (n === 1) await store.expire(dk, 60 * 60 * 24 * 14);
      if (n > MAX_REWARDED_PER_DAY) {
        await reject(tweet, `Daily limit of ${MAX_REWARDED_PER_DAY} rewarded posts reached`);
        await store.set(K.tweet(tweet.id), tweet);
        return tweet;
      }
      user.totals.rewardedTweets += 1;
    }
    const target = TIERS[reached].sol;
    const delta = Math.max(0, target - tweet.rewardSol);
    tweet.tier = reached;
    tweet.rewardSol = target;
    if (delta > 0) {
      user.totals.earnedSol = round(user.totals.earnedSol + delta);
      await store.zincrby(K.leaderboard, user.id, delta);
    }
  }

  if (ageMs >= TRACK_HOURS * 3_600_000) {
    tweet.status = "settled";
    tweet.settledAt = Date.now();
    await store.srem(K.tracking, tweet.id);
  }

  await store.set(K.tweet(tweet.id), tweet);
  return tweet;
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

export type SyncResult = { newTweets: number; updated: number; error?: string };

/** Pull new ticker tweets for one user and refresh the ones still tracking. */
export async function syncUser(user: User, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const cooldown = SYNC_COOLDOWN_MIN * 60_000;
  if (!opts.force && user.lastSyncAt && Date.now() - user.lastSyncAt < cooldown) {
    return { newTweets: 0, updated: 0, error: `Synced recently, try again in a few minutes` };
  }

  let token: string;
  try {
    token = await userToken(user);
  } catch (e) {
    user.lastSyncError = (e as Error).message;
    await saveUser(user);
    return { newTweets: 0, updated: 0, error: "X login expired, please log in again" };
  }

  let newTweets = 0;
  let updated = 0;
  try {
    await refreshHolding(user);
    const start = Number.isFinite(CAMPAIGN_START) ? CAMPAIGN_START : user.joinedAt;
    const found = await searchUserTweets(token, user.username, CASHTAG, {
      sinceId: user.sinceId,
      startTime: new Date(Math.max(start - 60_000, Date.now() - 6 * 86_400_000)).toISOString(),
    });
    for (const x of found) {
      const existing = await store.get<Tweet>(K.tweet(x.id));
      if (existing) continue;
      const t = await ingest(user, x);
      newTweets += 1;
      if (t.status === "tracking") await applyMetrics(user, t, metricsOf(x));
      if (!user.sinceId || BigInt(x.id) > BigInt(user.sinceId)) user.sinceId = x.id;
    }

    // Refresh the user's tweets that are still inside the tracking window.
    const ids = await store.zrange(K.userTweets(user.id), 0, -1, true);
    const tweets = (await store.mget<Tweet>(ids.map(K.tweet))).filter(
      (t): t is Tweet => Boolean(t && t.status === "tracking" && !found.some((f) => f.id === t.id))
    );
    if (tweets.length) {
      const fresh = await lookupTweets(token, tweets.map((t) => t.id));
      for (const t of tweets) {
        const x = fresh.find((f) => f.id === t.id);
        if (!x) {
          await reject(t, "Post was deleted");
          await store.set(K.tweet(t.id), t);
          continue;
        }
        await applyMetrics(user, t, metricsOf(x));
        updated += 1;
      }
    }
    user.lastSyncError = undefined;
  } catch (e) {
    user.lastSyncError = (e as Error).message;
  }

  user.lastSyncAt = Date.now();
  await saveUser(user);
  return { newTweets, updated, error: user.lastSyncError };
}

/**
 * Cron pass: refresh every tweet still tracking, grouped by author so each
 * user's own token is used (or the app bearer when present).
 */
export async function settleAll(): Promise<{ checked: number; errors: string[] }> {
  const ids = await store.smembers(K.tracking);
  const tweets = (await store.mget<Tweet>(ids.map(K.tweet))).filter((t): t is Tweet => Boolean(t));
  const byUser = new Map<string, Tweet[]>();
  for (const t of tweets) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t]);

  let checked = 0;
  const errors: string[] = [];
  for (const [userId, list] of byUser) {
    const user = await getUser(userId);
    if (!user) continue;
    try {
      await refreshHolding(user);
      const token = appBearer() ?? (await userToken(user));
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        const fresh = await lookupTweets(token, chunk.map((t) => t.id));
        for (const t of chunk) {
          const x = fresh.find((f) => f.id === t.id);
          if (!x) {
            await reject(t, "Post was deleted");
            await store.set(K.tweet(t.id), t);
          } else {
            await applyMetrics(user, t, metricsOf(x));
          }
          checked += 1;
        }
      }
      await saveUser(user);
    } catch (e) {
      errors.push(`@${user.username}: ${(e as Error).message}`);
    }
  }
  return { checked, errors };
}

/**
 * Re-read one post's metrics on demand (the "Check" button). Rate limited per
 * post so a user hammering the button does not burn API reads.
 */
export async function checkTweet(
  user: User,
  tweet: Tweet,
  opts: { force?: boolean } = {}
): Promise<{ tweet: Tweet; error?: string }> {
  if (tweet.userId !== user.id) return { tweet, error: "Not your post" };
  if (tweet.status !== "tracking") return { tweet };

  if (!opts.force) {
    const last = await store.get<number>(K.checkedAt(tweet.id));
    if (last && Date.now() - last < CHECK_COOLDOWN_MIN * 60_000) {
      return { tweet, error: `Checked a moment ago, try again in ${CHECK_COOLDOWN_MIN} min` };
    }
  }
  await store.set(K.checkedAt(tweet.id), Date.now(), { ex: CHECK_COOLDOWN_MIN * 60 });

  let token: string;
  try {
    token = appBearer() ?? (await userToken(user));
  } catch {
    return { tweet, error: "X login expired, please log in again" };
  }
  try {
    await refreshHolding(user, { force: opts.force });
    const [x] = await lookupTweets(token, [tweet.id]);
    if (!x) {
      await reject(tweet, "Post was deleted");
      await store.set(K.tweet(tweet.id), tweet);
      await saveUser(user);
      return { tweet };
    }
    const updated = await applyMetrics(user, tweet, metricsOf(x));
    await saveUser(user);
    return { tweet: updated };
  } catch (e) {
    return { tweet, error: (e as Error).message };
  }
}

export async function userTweets(userId: string, limit = 50): Promise<Tweet[]> {
  const ids = await store.zrange(K.userTweets(userId), 0, limit - 1, true);
  return (await store.mget<Tweet>(ids.map(K.tweet))).filter((t): t is Tweet => Boolean(t));
}
