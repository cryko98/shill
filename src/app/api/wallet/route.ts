import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { getSessionUserId } from "@/lib/session";
import { getUser, saveUser } from "@/lib/users";
import { isValidWallet } from "@/lib/payout";
import { holdGateReason, refreshHolding, signInMessage } from "@/lib/holdings";
import { K, store } from "@/lib/store";
import { clientIp, limited } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Links a wallet to the X account after a signed nonce proves ownership,
 * then reads its token balance. `{ disconnect: true }` unlinks.
 * One wallet can back only one X account, so a single bag cannot be
 * shared across several shillers.
 */
export async function POST(req: Request) {
  const block = await limited("wallet", clientIp(req), 20, 60);
  if (block) return block;
  const id = await getSessionUserId();
  if (!id) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = await getUser(id);
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { wallet?: string; signature?: string; disconnect?: boolean };

  if (body.disconnect) {
    if (user.wallet) await store.del(K.walletOwner(user.wallet));
    user.wallet = undefined;
    user.holding = undefined;
    await saveUser(user);
    return NextResponse.json({ ok: true, wallet: null, holding: null, gate: holdGateReason(user) });
  }

  const wallet = (body.wallet ?? "").trim();
  if (!wallet || !isValidWallet(wallet) || !body.signature) {
    return NextResponse.json({ error: "Missing wallet or signature" }, { status: 400 });
  }
  const nonce = await store.get<string>(K.nonce(wallet));
  if (!nonce) return NextResponse.json({ error: "Nonce expired, try again" }, { status: 400 });

  let ok = false;
  try {
    ok = nacl.sign.detached.verify(
      new TextEncoder().encode(signInMessage(wallet, nonce)),
      bs58.decode(body.signature),
      bs58.decode(wallet)
    );
  } catch {
    ok = false;
  }
  if (!ok) return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  await store.del(K.nonce(wallet));

  const owner = await store.get<string>(K.walletOwner(wallet));
  if (owner && owner !== user.id) {
    return NextResponse.json({ error: "This wallet is already linked to another X account" }, { status: 409 });
  }
  if (user.wallet && user.wallet !== wallet) await store.del(K.walletOwner(user.wallet));
  await store.set(K.walletOwner(wallet), user.id);

  user.wallet = wallet;
  user.holding = undefined;
  const holding = await refreshHolding(user, { force: true });
  await saveUser(user);
  return NextResponse.json({ ok: true, wallet, holding, gate: holdGateReason(user) });
}
