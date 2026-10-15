import { createHash, randomBytes } from "node:crypto";
import { K, store } from "./store";
import type { User, XTokens } from "./types";

const AUTH_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const API = "https://api.x.com/2";
export const SCOPES = ["tweet.read", "users.read", "offline.access"];

function clientId() {
  const id = process.env.X_CLIENT_ID;
  if (!id) throw new Error("X_CLIENT_ID is not set");
  return id;
}

export function redirectUri() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/auth/x/callback`;
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Builds the authorize URL and stashes the PKCE verifier under the state for 10 minutes. */
export async function beginLogin() {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  await store.set(K.oauthState(state), { verifier }, { ex: 600 });
  const url = new URL(AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function tokenHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  const secret = process.env.X_CLIENT_SECRET;
  if (secret) h.Authorization = `Basic ${Buffer.from(`${clientId()}:${secret}`).toString("base64")}`;
  return h;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; token_type: string };

export async function exchangeCode(code: string, state: string): Promise<XTokens> {
  const saved = await store.get<{ verifier: string }>(K.oauthState(state));
  if (!saved) throw new Error("Login expired, try again");
  await store.del(K.oauthState(state));
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: saved.verifier,
    client_id: clientId(),
  });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: tokenHeaders(), body });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  const t = (await res.json()) as TokenResponse;
  return { access: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + (t.expires_in - 60) * 1000 };
}

export async function refreshTokens(tokens: XTokens): Promise<XTokens> {
  if (!tokens.refresh) throw new Error("No refresh token, user must log in again");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh,
    client_id: clientId(),
  });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: tokenHeaders(), body });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  const t = (await res.json()) as TokenResponse;
  return {
    access: t.access_token,
    refresh: t.refresh_token ?? tokens.refresh,
    expiresAt: Date.now() + (t.expires_in - 60) * 1000,
  };
}

/** Returns a valid access token for the user, refreshing (and persisting) when needed. */
export async function userToken(user: User): Promise<string> {
  if (!user.tokens) throw new Error("User has no X tokens, must log in again");
  if (user.tokens.expiresAt > Date.now()) return user.tokens.access;
  const fresh = await refreshTokens(user.tokens);
  user.tokens = fresh;
  await store.set(K.user(user.id), user);
  return fresh.access;
}

async function xGet<T>(path: string, token: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X API ${res.status} on ${path}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type XUser = {
  id: string;
  username: string;
  name: string;
  created_at: string;
  verified?: boolean;
  profile_image_url?: string;
  public_metrics?: { followers_count: number; following_count: number; tweet_count: number };
};

export async function fetchMe(token: string): Promise<XUser> {
  const data = await xGet<{ data: XUser }>("/users/me", token, {
    "user.fields": "created_at,public_metrics,verified,profile_image_url",
  });
  return data.data;
}

export type XTweet = {
  id: string;
  text: string;
  created_at: string;
  referenced_tweets?: { type: "retweeted" | "quoted" | "replied_to"; id: string }[];
  public_metrics?: {
    impression_count?: number;
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
    quote_count?: number;
    bookmark_count?: number;
  };
  note_tweet?: { text?: string };
};

const TWEET_FIELDS = "public_metrics,created_at,referenced_tweets,note_tweet";

/**
 * Recent tweets by the user that mention the ticker. Uses recent search with a
 * `from:` operator so only matching posts are returned (and billed).
 */
export async function searchUserTweets(
  token: string,
  username: string,
  ticker: string,
  opts: { sinceId?: string; startTime?: string }
): Promise<XTweet[]> {
  const params: Record<string, string> = {
    query: `from:${username} ${ticker} -is:retweet`,
    max_results: "100",
    "tweet.fields": TWEET_FIELDS,
  };
  if (opts.sinceId) params.since_id = opts.sinceId;
  else if (opts.startTime) params.start_time = opts.startTime;
  const data = await xGet<{ data?: XTweet[] }>("/tweets/search/recent", token, params);
  return data.data ?? [];
}

/** Fresh metrics for up to 100 tweet ids. */
export async function lookupTweets(token: string, ids: string[]): Promise<XTweet[]> {
  if (!ids.length) return [];
  const data = await xGet<{ data?: XTweet[] }>("/tweets", token, {
    ids: ids.slice(0, 100).join(","),
    "tweet.fields": TWEET_FIELDS,
  });
  return data.data ?? [];
}

export function appBearer(): string | null {
  return process.env.X_BEARER_TOKEN || null;
}
