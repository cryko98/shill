# $SHILL — Tweet it. Get paid per view.

Shill-to-earn site for a Solana memecoin. People log in with X, post about `$SHILL`,
and get SOL for the reach their posts get. Views are read from the X API, fake reach
is filtered, payouts go out from a treasury wallet.

## How it works

1. **Log in with X** (OAuth 2.0 PKCE, scopes `tweet.read users.read offline.access`).
2. **Connect a wallet** (Phantom, Solflare or any Wallet Standard wallet) and sign a nonce.
   The server links it to the X account (one wallet per account) and reads its `$SHILL`
   balance via `getTokenAccountsByOwner`. Only wallets holding at least `MIN_HOLD_TOKENS`
   (default 100 000) earn and claim; others are tracked but never credited. The gate is
   enforced once `NEXT_PUBLIC_TOKEN_CA` is set.
3. **Post** via the "Tweet now" box (templates or custom text). Opens X's compose intent.
4. **Sync**: the site searches the user's own recent posts that contain the cashtag
   (`from:user $SHILL -is:retweet`) and tracks their `impression_count`.
5. **Reward**: a post earns the highest tier it reaches within `TRACK_HOURS`
   (default 100 → 0.1 SOL, 500 → 0.2, 1000 → 0.3, 2500 → 0.5, 5000 → 0.75, 10k → 1).
   The user hits **Check views** on a post to pull fresh numbers from X; the hourly cron
   also refreshes every tracked post in the background.
6. **Claim**: when a post has crossed a milestone, a **Claim** button appears. Clicking it
   re-checks the post, then sends the unclaimed SOL from the treasury to the user's wallet
   immediately. Nothing is paid automatically. Claims are disabled until `CLAIMS_LIVE=true`
   (rewards still accrue and stay claimable).

### Fake-reach filter

- Account must be ≥ `MIN_ACCOUNT_AGE_DAYS` old and have ≥ `MIN_FOLLOWERS`.
- Views above `followers × MAX_VIEWS_PER_FOLLOWER` with near-zero engagement → rejected.
- Posts with 1000+ views and engagement rate under `MIN_ENGAGEMENT_RATE` → rejected.
- A post must be 30 minutes old before anything is credited (lets engagement catch up).
- Same text twice (per user), reposts, replies (unless `ALLOW_REPLIES=true`), deleted posts → not paid.
- Max `MAX_REWARDED_PER_DAY` rewarded posts per user per day.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill X_CLIENT_ID at least
npm run dev
```

Without Upstash the app keeps a JSON snapshot in `.data/store.json`.

## Deploy on Vercel

1. Import the GitHub repo in Vercel.
2. Add the env vars from `.env.example` (Project → Settings → Environment Variables).
   Required for login: `X_CLIENT_ID`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL` (your https domain).
   Required for a shared DB: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
   (Vercel Marketplace → Upstash Redis also works; it sets `KV_REST_API_*`).
   Required for the cron: `CRON_SECRET`.
   Required for real claims: `TREASURY_SECRET_KEY`, `SOLANA_RPC`, `CLAIMS_LIVE=true`.
3. On developer.x.com, in the app's **User authentication settings**:
   type *Web App*, callback URL `https://YOUR-DOMAIN/api/auth/x/callback`,
   website URL your domain. Copy the OAuth 2.0 Client ID into `X_CLIENT_ID`
   (and the secret into `X_CLIENT_SECRET` if you created a confidential client).
4. `vercel.json` already schedules `/api/cron/settle` hourly (view refresh only, no
   payouts). Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically.
5. Admins (X usernames in `ADMIN_USERNAMES`) can open `/api/cron/settle` in the
   browser while logged in to trigger a refresh by hand.

## X API cost

Pay-per-use: about $0.005 per post read. A sync reads only the user's matching posts
plus the posts still tracking, so a few hundred active shillers cost a few dollars a day.

## Stack

Next.js 16 (App Router), Tailwind 4, Upstash Redis (optional), `@solana/web3.js`, `jose`.
