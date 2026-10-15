import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Redis } from "@upstash/redis";

/**
 * Store layer. Uses Upstash Redis when the REST env vars are present,
 * otherwise falls back to an in-memory store so the app runs locally
 * with zero setup. Only the handful of commands the app needs are shimmed.
 */

type ZMember = { member: string; score: number };

function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
    // Never hold the process open just to write a snapshot.
    timer.unref?.();
  };
}

interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  zadd(key: string, member: string, score: number): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  zrange(key: string, start: number, stop: number, rev: boolean): Promise<string[]>;
  zcard(key: string): Promise<number>;
  zincrby(key: string, member: string, by: number): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
}

class UpstashStore implements Store {
  constructor(private r: Redis) {}
  async get<T>(key: string) {
    return (await this.r.get<T>(key)) ?? null;
  }
  async set(key: string, value: unknown, opts?: { ex?: number }) {
    if (opts?.ex) await this.r.set(key, value, { ex: opts.ex });
    else await this.r.set(key, value);
  }
  async del(key: string) {
    await this.r.del(key);
  }
  async incr(key: string) {
    return await this.r.incr(key);
  }
  async expire(key: string, seconds: number) {
    await this.r.expire(key, seconds);
  }
  async zadd(key: string, member: string, score: number) {
    await this.r.zadd(key, { score, member });
  }
  async zrem(key: string, member: string) {
    await this.r.zrem(key, member);
  }
  async zrange(key: string, start: number, stop: number, rev: boolean) {
    return (await this.r.zrange<string[]>(key, start, stop, rev ? { rev: true } : {})) ?? [];
  }
  async zcard(key: string) {
    return await this.r.zcard(key);
  }
  async zincrby(key: string, member: string, by: number) {
    await this.r.zincrby(key, by, member);
  }
  async sadd(key: string, member: string) {
    await this.r.sadd(key, member);
  }
  async srem(key: string, member: string) {
    await this.r.srem(key, member);
  }
  async smembers(key: string) {
    return (await this.r.smembers(key)) ?? [];
  }
  async scard(key: string) {
    return await this.r.scard(key);
  }
  async mget<T>(keys: string[]) {
    if (keys.length === 0) return [];
    return (await this.r.mget<T[]>(...keys)) ?? keys.map(() => null);
  }
}

type MemEntry = { value: unknown; expires?: number };

class LocalStore implements Store {
  private kv = new Map<string, MemEntry>();
  private zsets = new Map<string, Map<string, number>>();
  private sets = new Map<string, Set<string>>();
  private flush: () => void = () => {};

  constructor(private file?: string) {
    if (!file) return;
    this.load();
    this.flush = debounce(() => this.save(), 250);
  }

  private load() {
    try {
      const raw = readFileSync(this.file!, "utf8");
      const data = JSON.parse(raw) as {
        kv?: [string, MemEntry][];
        zsets?: [string, [string, number][]][];
        sets?: [string, string[]][];
      };
      this.kv = new Map(data.kv ?? []);
      this.zsets = new Map((data.zsets ?? []).map(([k, v]) => [k, new Map(v)]));
      this.sets = new Map((data.sets ?? []).map(([k, v]) => [k, new Set(v)]));
    } catch {
      // No snapshot yet, or it is unreadable — start empty.
    }
  }

  private save() {
    try {
      mkdirSync(dirname(this.file!), { recursive: true });
      const data = {
        kv: [...this.kv.entries()],
        zsets: [...this.zsets.entries()].map(([k, v]) => [k, [...v.entries()]]),
        sets: [...this.sets.entries()].map(([k, v]) => [k, [...v]]),
      };
      writeFileSync(this.file!, JSON.stringify(data));
    } catch {
      // Read-only filesystem (a serverless host, say) — stay in memory.
    }
  }

  private alive(key: string) {
    const e = this.kv.get(key);
    if (!e) return null;
    if (e.expires && e.expires < Date.now()) {
      this.kv.delete(key);
      return null;
    }
    return e;
  }
  private z(key: string) {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    return z;
  }
  private s(key: string) {
    let s = this.sets.get(key);
    if (!s) {
      s = new Set();
      this.sets.set(key, s);
    }
    return s;
  }

  async get<T>(key: string) {
    const e = this.alive(key);
    return e ? (e.value as T) : null;
  }
  async set(key: string, value: unknown, opts?: { ex?: number }) {
    this.kv.set(key, { value, expires: opts?.ex ? Date.now() + opts.ex * 1000 : undefined });
    this.flush();
  }
  async del(key: string) {
    this.kv.delete(key);
    this.zsets.delete(key);
    this.sets.delete(key);
    this.flush();
  }
  async incr(key: string) {
    const entry = this.alive(key);
    const cur = Number((entry?.value as number) ?? 0) + 1;
    // A counter keeps the window it was given.
    this.kv.set(key, { value: cur, expires: entry?.expires });
    this.flush();
    return cur;
  }
  async expire(key: string, seconds: number) {
    const entry = this.alive(key);
    if (entry) this.kv.set(key, { ...entry, expires: Date.now() + seconds * 1000 });
    this.flush();
  }
  async zadd(key: string, member: string, score: number) {
    this.z(key).set(member, score);
    this.flush();
  }
  async zrem(key: string, member: string) {
    this.z(key).delete(member);
    this.flush();
  }
  async zrange(key: string, start: number, stop: number, rev: boolean) {
    const sorted: ZMember[] = [...this.z(key).entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => (rev ? b.score - a.score : a.score - b.score));
    const end = stop < 0 ? sorted.length + stop + 1 : stop + 1;
    return sorted.slice(start, end).map((m) => m.member);
  }
  async zcard(key: string) {
    return this.z(key).size;
  }
  async zincrby(key: string, member: string, by: number) {
    const z = this.z(key);
    z.set(member, (z.get(member) ?? 0) + by);
    this.flush();
  }
  async sadd(key: string, member: string) {
    this.s(key).add(member);
    this.flush();
  }
  async srem(key: string, member: string) {
    this.s(key).delete(member);
    this.flush();
  }
  async smembers(key: string) {
    return [...this.s(key)];
  }
  async scard(key: string) {
    return this.s(key).size;
  }
  async mget<T>(keys: string[]) {
    return keys.map((k) => {
      const e = this.alive(k);
      return e ? (e.value as T) : null;
    });
  }
}

// Vercel's Upstash integration exposes the same credentials under KV_* names.
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const usingRedis = Boolean(url && token);


const globalForStore = globalThis as unknown as { __shillStore?: Store };

export const store: Store =
  globalForStore.__shillStore ??
  (globalForStore.__shillStore = usingRedis
    ? new UpstashStore(new Redis({ url: url!, token: token! }))
    : new LocalStore(resolve(process.cwd(), process.env.SHILL_DATA_FILE || ".data/store.json")));

if (!usingRedis && process.env.NODE_ENV !== "production") {
  console.warn(
    "[shill] No UPSTASH_REDIS_REST_URL/TOKEN — using the local .data/store.json snapshot. Set both before deploying."
  );
}

export const K = {
  user: (id: string) => `user:${id}`,
  users: "users",
  oauthState: (state: string) => `oauth:${state}`,
  tweet: (id: string) => `tweet:${id}`,
  userTweets: (userId: string) => `user:${userId}:tweets`,
  tracking: "tweets:tracking",
  textHash: (hash: string) => `text:${hash}`,
  rewardedDay: (userId: string, day: string) => `user:${userId}:day:${day}`,
  leaderboard: "leaderboard",
  owed: "owed",
  payout: (id: string) => `payout:${id}`,
  payouts: (userId: string) => `user:${userId}:payouts`,
  stats: "stats",
  rate: (bucket: string, who: string) => `rate:${bucket}:${who}`,
};
