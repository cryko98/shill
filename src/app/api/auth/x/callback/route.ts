import { NextResponse } from "next/server";
import { exchangeCode, fetchMe } from "@/lib/x";
import { createSession } from "@/lib/session";
import { getUser, saveUser, upsertFromX } from "@/lib/users";
import { clientIp, limited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function home(req: Request, params?: Record<string, string>) {
  const url = new URL("/", process.env.NEXT_PUBLIC_SITE_URL || req.url);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const block = await limited("callback", clientIp(req), 20, 60);
  if (block) return block;

  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const denied = u.searchParams.get("error");
  if (denied) return home(req, { login: "denied" });
  if (!code || !state) return home(req, { login: "invalid" });

  try {
    const tokens = await exchangeCode(code, state);
    const me = await fetchMe(tokens.access);
    const existing = await getUser(me.id);
    const user = await upsertFromX(me, existing);
    user.tokens = tokens;
    await saveUser(user);
    await createSession(user.id);
    return home(req, { login: "ok" });
  } catch (e) {
    console.error("[shill] X login failed:", (e as Error).message);
    return home(req, { login: "failed" });
  }
}
