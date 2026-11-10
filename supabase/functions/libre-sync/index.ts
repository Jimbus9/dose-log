// libre-sync: copies glucose readings from LibreLinkUp into the glucose table.
//
// Runs every 5 minutes (see supabase/04-schedule.sql). It signs in as a
// LibreLinkUp *follower* account that the sensor wearer has invited.
//
// LibreLinkUp has no official public API. This uses the same requests as the
// LibreLinkUp phone app, so Abbott can change or block it at any time. If it
// stops working, the app shows the error and everything else keeps working.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   LIBRE_EMAIL     follower account email
//   LIBRE_PASSWORD  follower account password
//   SYNC_SECRET     random string; the scheduler sends it so strangers can't trigger this
//   LIBRE_VERSION   optional; app version to present (default below)

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL = Deno.env.get("LIBRE_EMAIL") ?? "";
const PASSWORD = Deno.env.get("LIBRE_PASSWORD") ?? "";
const SYNC_SECRET = Deno.env.get("SYNC_SECRET") ?? "";
const VERSION = Deno.env.get("LIBRE_VERSION") ?? "4.16.0";
const DEFAULT_BASE = "https://api.libreview.io";

const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

type Session = { base_url: string; token: string; account_id: string; expires_at: string };

class LibreError extends Error {
  constructor(message: string, public relogin = false) { super(message); }
}

function headers(s?: Session): Record<string, string> {
  const h: Record<string, string> = {
    "accept-encoding": "gzip",
    "cache-control": "no-cache",
    "connection": "Keep-Alive",
    "content-type": "application/json",
    "product": "llu.android",
    "version": VERSION,
  };
  if (s) {
    h["authorization"] = "Bearer " + s.token;
    h["account-id"] = s.account_id;
  }
  return h;
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// LibreLinkUp sends times like "11/5/2026 1:05:03 PM". FactoryTimestamp is UTC.
export function parseLibreTime(s: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) ?(AM|PM)?$/i.exec((s || "").trim());
  if (!m) return null;
  let h = Number(m[4]);
  const ap = (m[7] || "").toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), h, Number(m[5]), Number(m[6])));
}

async function login(base = DEFAULT_BASE, hops = 0): Promise<Session> {
  if (!EMAIL || !PASSWORD) throw new LibreError("LIBRE_EMAIL or LIBRE_PASSWORD secret is missing.");
  const res = await fetch(base + "/llu/auth/login", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (res.status === 429) throw new LibreError("LibreLinkUp is rate-limiting logins. It will retry automatically.");
  const body = await res.json().catch(() => null);
  if (!body) throw new LibreError(`LibreLinkUp login failed (HTTP ${res.status}).`);
  const d = body.data ?? {};
  if (d.redirect && d.region && hops < 2) return login(`https://api-${d.region}.libreview.io`, hops + 1);
  if (d.step) throw new LibreError("Open the LibreLinkUp app with the follower account and accept the terms, then it will start working.");
  if (body.status === 2) throw new LibreError("LibreLinkUp rejected the email or password. Check the LIBRE_EMAIL and LIBRE_PASSWORD secrets.");
  if (body.status !== 0 || !d.authTicket?.token || !d.user?.id) {
    throw new LibreError(`LibreLinkUp login failed: ${body.error?.message ?? "status " + body.status}. If this persists, the app version may need updating (LIBRE_VERSION secret).`);
  }
  const s: Session = {
    base_url: base,
    token: d.authTicket.token,
    account_id: await sha256hex(String(d.user.id)),
    expires_at: new Date((Number(d.authTicket.expires) || Date.now() / 1000 + 3600) * 1000).toISOString(),
  };
  await db.from("libre_session").upsert({ id: 1, ...s });
  return s;
}

async function savedSession(): Promise<Session | null> {
  const { data } = await db.from("libre_session").select("*").eq("id", 1).maybeSingle();
  if (!data?.token) return null;
  // refresh a day before it expires
  if (new Date(data.expires_at).getTime() - Date.now() < 864e5) return null;
  return data as Session;
}

async function api(s: Session, path: string) {
  const res = await fetch(s.base_url + path, { headers: headers(s) });
  if (res.status === 401 || res.status === 403) throw new LibreError("Session expired.", true);
  if (res.status === 429) throw new LibreError("LibreLinkUp is rate-limiting requests. It will retry automatically.");
  const body = await res.json().catch(() => null);
  if (!body || body.status !== 0) throw new LibreError(`LibreLinkUp request failed (HTTP ${res.status}).`, res.status >= 400);
  return body.data;
}

async function withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
  let s = (await savedSession()) ?? (await login());
  try {
    return await fn(s);
  } catch (e) {
    if (!(e instanceof LibreError) || !e.relogin) throw e;
    s = await login(s.base_url);
    return await fn(s);
  }
}

type Reading = { FactoryTimestamp?: string; ValueInMgPerDl?: number; TrendArrow?: number };

function toRow(r: Reading, withTrend: boolean) {
  const t = r?.FactoryTimestamp ? parseLibreTime(r.FactoryTimestamp) : null;
  const mgdl = Math.round(Number(r?.ValueInMgPerDl));
  if (!t || !(mgdl >= 10 && mgdl <= 600)) return null;
  const row: { ts: string; mgdl: number; trend?: number } = { ts: t.toISOString(), mgdl };
  if (withTrend && Number.isInteger(r.TrendArrow)) row.trend = r.TrendArrow;
  return row;
}

async function sync() {
  const graph = await withSession(async (s) => {
    const conns = await api(s, "/llu/connections");
    if (!Array.isArray(conns) || !conns.length) {
      throw new LibreError("The follower account has no connections. In the Libre app, invite this account, then accept the invite in LibreLinkUp.");
    }
    return api(s, `/llu/connections/${conns[0].patientId}/graph`);
  });

  const history = (graph?.graphData ?? []).map((r: Reading) => toRow(r, false)).filter(Boolean);
  const latest = toRow(graph?.connection?.glucoseMeasurement, true);

  if (history.length) {
    const { error } = await db.from("glucose").upsert(history, { onConflict: "ts", ignoreDuplicates: true });
    if (error) throw new Error("Saving readings failed: " + error.message);
  }
  if (latest) {
    const { error } = await db.from("glucose").upsert(latest, { onConflict: "ts" });
    if (error) throw new Error("Saving the latest reading failed: " + error.message);
  }
  return { saved: history.length + (latest ? 1 : 0), latest };
}

Deno.serve(async (req) => {
  if (!SYNC_SECRET || req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const result = await sync();
    await db.from("libre_status").upsert({ id: 1, last_ok: new Date().toISOString() });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("libre_status").upsert({ id: 1, last_error: message.slice(0, 300), last_error_at: new Date().toISOString() });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
