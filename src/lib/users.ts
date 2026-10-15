import { K, store } from "./store";
import type { PublicUser, User } from "./types";
import type { XUser } from "./x";

export async function getUser(id: string): Promise<User | null> {
  return store.get<User>(K.user(id));
}

export async function saveUser(user: User) {
  await store.set(K.user(user.id), user);
}

/** Creates or refreshes a user from the X profile; keeps wallet, totals and tokens. */
export async function upsertFromX(x: XUser, existing: User | null): Promise<User> {
  const user: User = existing ?? {
    id: x.id,
    username: x.username,
    name: x.name,
    verified: Boolean(x.verified),
    xCreatedAt: x.created_at,
    followers: 0,
    following: 0,
    tweetCount: 0,
    joinedAt: Date.now(),
    totals: { earnedSol: 0, paidSol: 0, rewardedTweets: 0, views: 0 },
  };
  user.username = x.username;
  user.name = x.name;
  user.avatar = x.profile_image_url?.replace("_normal", "_bigger");
  user.verified = Boolean(x.verified);
  user.xCreatedAt = x.created_at;
  user.followers = x.public_metrics?.followers_count ?? user.followers;
  user.following = x.public_metrics?.following_count ?? user.following;
  user.tweetCount = x.public_metrics?.tweet_count ?? user.tweetCount;
  await saveUser(user);
  if (!existing) {
    await store.sadd(K.users, user.id);
    await store.zadd(K.leaderboard, user.id, 0);
  }
  return user;
}

export function toPublic(user: User): PublicUser {
  const { tokens: _tokens, ...rest } = user;
  void _tokens;
  return rest;
}

export function isAdmin(user: User | null, admins: string[]): boolean {
  return Boolean(user && admins.includes(user.username.toLowerCase()));
}
