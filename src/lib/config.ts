/**
 * Everything tunable lives in env; this file parses it once with safe defaults.
 */

export type Tier = { views: number; sol: number };

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function parseTiers(raw: string | undefined): Tier[] {
  const fallback: Tier[] = [
    { views: 100, sol: 0.1 },
    { views: 500, sol: 0.2 },
    { views: 1000, sol: 0.3 },
    { views: 2500, sol: 0.5 },
    { views: 5000, sol: 0.75 },
    { views: 10000, sol: 1 },
  ];
  if (!raw) return fallback;
  const tiers = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [v, s] = p.split(":");
      return { views: Number(v), sol: Number(s) };
    })
    .filter((t) => Number.isFinite(t.views) && Number.isFinite(t.sol) && t.views > 0 && t.sol > 0)
    .sort((a, b) => a.views - b.views);
  return tiers.length ? tiers : fallback;
}

export const TICKER = (process.env.NEXT_PUBLIC_TICKER || "SHILL").replace(/^\$/, "").toUpperCase();
export const CASHTAG = `$${TICKER}`;
export const TOKEN_CA = process.env.NEXT_PUBLIC_TOKEN_CA || "";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const TIERS: Tier[] = parseTiers(process.env.REWARD_TIERS);
export const TRACK_HOURS = num("TRACK_HOURS", 48);
export const MAX_REWARDED_PER_DAY = num("MAX_REWARDED_PER_DAY", 3);
export const SYNC_COOLDOWN_MIN = num("SYNC_COOLDOWN_MIN", 10);
export const CAMPAIGN_START = process.env.CAMPAIGN_START ? Date.parse(process.env.CAMPAIGN_START) : NaN;

export const MIN_ACCOUNT_AGE_DAYS = num("MIN_ACCOUNT_AGE_DAYS", 30);
export const MIN_FOLLOWERS = num("MIN_FOLLOWERS", 50);
export const MAX_VIEWS_PER_FOLLOWER = num("MAX_VIEWS_PER_FOLLOWER", 40);
export const MIN_ENGAGEMENT_RATE = num("MIN_ENGAGEMENT_RATE", 0.003);
export const ALLOW_REPLIES = bool("ALLOW_REPLIES", false);

/** Whole tokens a wallet must hold to earn and claim. Only enforced once NEXT_PUBLIC_TOKEN_CA is set. */
export const MIN_HOLD_TOKENS = num("MIN_HOLD_TOKENS", 100_000);

/** When false, rewards accrue and show as claimable but the Claim button does not send SOL. */
export const CLAIMS_LIVE = bool("CLAIMS_LIVE", bool("PAYOUTS_LIVE", false));
/** Minimum minutes between two manual checks of the same post. */
export const CHECK_COOLDOWN_MIN = num("CHECK_COOLDOWN_MIN", 2);

export const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || "")
  .split(",")
  .map((s) => s.trim().replace(/^@/, "").toLowerCase())
  .filter(Boolean);

/** Highest tier index a view count reaches, or -1. */
export function tierFor(views: number): number {
  let idx = -1;
  for (let i = 0; i < TIERS.length; i++) if (views >= TIERS[i].views) idx = i;
  return idx;
}

/** Public, client-safe snapshot of the rules. */
export function publicRules() {
  return {
    ticker: TICKER,
    cashtag: CASHTAG,
    ca: TOKEN_CA,
    site: SITE_URL,
    tiers: TIERS,
    trackHours: TRACK_HOURS,
    maxPerDay: MAX_REWARDED_PER_DAY,
    minAccountAgeDays: MIN_ACCOUNT_AGE_DAYS,
    minFollowers: MIN_FOLLOWERS,
    allowReplies: ALLOW_REPLIES,
    syncCooldownMin: SYNC_COOLDOWN_MIN,
    checkCooldownMin: CHECK_COOLDOWN_MIN,
    claimsLive: CLAIMS_LIVE,
    minHold: MIN_HOLD_TOKENS,
    holdGate: Boolean(TOKEN_CA) && MIN_HOLD_TOKENS > 0,
    buyUrl: TOKEN_CA ? `https://jup.ag/swap/SOL-${TOKEN_CA}` : "",
    xConfigured: Boolean(process.env.X_CLIENT_ID),
  };
}

export type PublicRules = ReturnType<typeof publicRules>;
