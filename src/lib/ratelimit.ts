import { NextResponse } from "next/server";
import { K, store } from "./store";

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}

/** Fixed-window limiter. Returns a 429 response when `who` exceeded `max` in `windowSec`. */
export async function limited(bucket: string, who: string, max: number, windowSec: number) {
  const key = K.rate(bucket, who);
  const n = await store.incr(key);
  if (n === 1) await store.expire(key, windowSec);
  if (n > max) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  return null;
}
