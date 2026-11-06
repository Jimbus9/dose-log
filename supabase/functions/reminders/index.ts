// reminders: nudges the dose-logging phone when something hasn't been logged.
//
// Runs every 5 minutes (see supabase/07-schedule-reminders.sql). At each
// reminder time (UK time, set in the app's Settings) it checks the log:
//   breakfast / lunch / evening: no "Meal + insulin" entry since the previous
//     reminder time  -> reminder
//   long-acting: no long-acting entry today -> reminder
// Notifications go only to phones of family-list members with the "dad"
// (Logs doses) role. Each reminder is sent at most once a day.
//
// Secrets: SYNC_SECRET (shared with libre-sync), VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, optional VAPID_SUBJECT (mailto: address).
//
// Test: POST with {"force": "breakfast"} (or lunch / evening / long) sends
// that reminder straight away, skipping the time and log checks.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
// @ts-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SYNC_SECRET = Deno.env.get("SYNC_SECRET") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:dadsdoselog@gmail.com";
const TZ = "Europe/London";
const SEND_WINDOW_MIN = 30;   // send any time within 30 min after the reminder time

const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

type Kind = "breakfast" | "lunch" | "evening" | "long";
const REMINDERS: { kind: Kind; col: string; since: string | null; title: string; body: string }[] = [
  { kind: "breakfast", col: "remind_breakfast", since: null, title: "Breakfast", body: "Have you had breakfast? Tap to log it and your insulin." },
  { kind: "lunch", col: "remind_lunch", since: "remind_breakfast", title: "Lunch", body: "Have you had lunch? Tap to log it and your insulin." },
  { kind: "evening", col: "remind_evening", since: "remind_lunch", title: "Evening meal", body: "Have you had your evening meal? Tap to log it and your insulin." },
  { kind: "long", col: "remind_long", since: null, title: "Long-acting insulin", body: "Time for your long-acting insulin. Tap to log it once you've taken it." },
];

type Parts = { y: number; m: number; d: number; h: number; mi: number };

export function londonParts(date: Date): Parts {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

// UK wall-clock time -> real instant (handles GMT/BST).
export function londonToUtc(y: number, m: number, d: number, h: number, mi: number): Date {
  const want = Date.UTC(y, m - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = londonParts(new Date(t));
    t += want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  }
  return new Date(t);
}

const toMin = (t: string) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };

async function loggedSince(kind: "meal" | "long", since: Date) {
  const { data, error } = await db.from("entries").select("id").eq("kind", kind).gte("at", since.toISOString()).limit(1);
  if (error) throw new Error("Reading the log failed: " + error.message);
  return (data ?? []).length > 0;
}

async function sendToDosePhones(payload: Record<string, string>) {
  const { data: dads, error: e1 } = await db.from("members").select("email").eq("role", "dad");
  if (e1) throw new Error("Reading the family list failed: " + e1.message);
  const emails = new Set((dads ?? []).map((r) => r.email));
  const { data: subs, error: e2 } = await db.from("push_subscriptions").select("*");
  if (e2) throw new Error("Reading phones failed: " + e2.message);

  let sent = 0;
  for (const s of (subs ?? []).filter((x) => emails.has(x.email))) {
    const req = webpush.generateRequestDetails(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify(payload),
      { vapidDetails: { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE }, TTL: 3600, urgency: "high" },
    );
    const headers = { ...req.headers } as Record<string, string>;
    delete headers["Content-Length"];
    const res = await fetch(req.endpoint, { method: req.method, headers, body: req.body as unknown as BodyInit });
    if (res.status === 404 || res.status === 410) {
      await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);   // phone turned reminders off
    } else if (res.ok) {
      sent++;
    }
  }
  return sent;
}

async function run(force?: Kind) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error("VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY secret is missing.");
  const { data: st, error } = await db.from("settings").select("*").eq("id", 1).maybeSingle();
  if (error || !st) throw new Error("Reading settings failed. Has 06-reminders.sql been run?");

  const now = londonParts(new Date());
  const nowMin = now.h * 60 + now.mi;
  const day = `${now.y}-${String(now.m).padStart(2, "0")}-${String(now.d).padStart(2, "0")}`;
  const at = (t: string) => { const mm = toMin(t); return londonToUtc(now.y, now.m, now.d, Math.floor(mm / 60), mm % 60); };
  const results: Record<string, string> = {};

  for (const r of REMINDERS) {
    if (force && r.kind !== force) continue;
    if (!force) {
      if (!st.reminders_on) { results[r.kind] = "off"; continue; }
      const t = toMin(st[r.col]);
      if (nowMin < t || nowMin >= t + SEND_WINDOW_MIN) continue;
      const since = r.kind === "long" ? at("00:00") : at(r.since ? st[r.since] : "03:00");
      if (await loggedSince(r.kind === "long" ? "long" : "meal", since)) { results[r.kind] = "already logged"; continue; }
      const { data: claimed } = await db.from("reminder_log")
        .upsert({ day, kind: r.kind }, { onConflict: "day,kind", ignoreDuplicates: true }).select();
      if (!claimed || !claimed.length) { results[r.kind] = "already sent"; continue; }
    }
    const n = await sendToDosePhones({ title: r.title, body: r.body, tag: "reminder-" + r.kind, url: "./#dad" });
    results[r.kind] = `sent to ${n} phone${n === 1 ? "" : "s"}`;
  }
  return results;
}

Deno.serve(async (req) => {
  if (!SYNC_SECRET || req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const force = ["breakfast", "lunch", "evening", "long"].includes(body?.force) ? body.force as Kind : undefined;
    return Response.json({ ok: true, results: await run(force) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
