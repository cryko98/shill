export type XTokens = {
  access: string;
  refresh?: string;
  /** epoch ms */
  expiresAt: number;
};

export type User = {
  id: string;
  username: string;
  name: string;
  avatar?: string;
  verified: boolean;
  /** X account creation, ISO */
  xCreatedAt: string;
  followers: number;
  following: number;
  tweetCount: number;
  wallet?: string;
  joinedAt: number;
  lastSyncAt?: number;
  lastSyncError?: string;
  /** newest tweet id seen, for since_id */
  sinceId?: string;
  totals: { earnedSol: number; paidSol: number; rewardedTweets: number; views: number };
  tokens?: XTokens;
};

export type TweetStatus = "tracking" | "settled" | "rejected";

export type Tweet = {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
  isReply: boolean;
  hasCashtag: boolean;
  hasCA: boolean;
  metrics: {
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    bookmarks: number;
  };
  /** highest tier index credited so far, -1 = none */
  tier: number;
  /** SOL credited for this tweet so far */
  rewardSol: number;
  status: TweetStatus;
  reason?: string;
  /** anti-bot flags, informational */
  flags: string[];
  firstSeenAt: number;
  lastCheckedAt: number;
  settledAt?: number;
};

export type Payout = {
  id: string;
  userId: string;
  username: string;
  wallet: string;
  sol: number;
  tweetIds: string[];
  signature?: string;
  dryRun: boolean;
  createdAt: number;
  error?: string;
};

/** What the browser is allowed to see of a user. */
export type PublicUser = Omit<User, "tokens">;
