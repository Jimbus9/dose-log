/* Loading data from Supabase into `state`, and keeping it fresh with realtime updates. */

import {db} from "./client.js";
import {state, DEFAULT_SETTINGS, HISTORY_DAYS} from "./state.js";
import {banner, DAY_MS} from "./util.js";
import {softRender} from "./render.js";

/** The last two weeks of log entries, newest first. Returns false if the load failed. */
export async function loadEntries(){
  const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS).toISOString();
  const {data, error} = await db.from("entries").select("*").gte("at", since).order("at", {ascending: false}).limit(500);
  if (error){ banner("Couldn't load the log. Check your signal."); return false; }
  state.entries = data;
  banner("");
  refreshPhotoUrls();
  return true;
}

export async function loadSettings(){
  const {data} = await db.from("settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return;
  const hhmm = v => v ? String(v).slice(0, 5) : v;          // "08:00:00" -> "08:00"
  state.settings = {
    ...DEFAULT_SETTINGS, ...data,
    long_by: hhmm(data.long_by || DEFAULT_SETTINGS.long_by),
    remind_breakfast: hhmm(data.remind_breakfast), remind_lunch: hhmm(data.remind_lunch),
    remind_evening: hhmm(data.remind_evening), remind_long: hhmm(data.remind_long)
  };
}

export async function loadMembers(){
  const {data} = await db.from("members").select("*").order("added_at");
  if (data) state.members = data;
}

/**
 * Glucose comes from the optional libre-sync job. If that isn't installed these tables
 * don't exist, the queries fail quietly, and the app shows no glucose section.
 */
export async function loadGlucose(){
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const [readings, status] = await Promise.all([
    db.from("glucose").select("ts,mgdl,trend").gte("ts", since).order("ts", {ascending: true}).limit(1000),
    db.from("libre_status").select("*").eq("id", 1).maybeSingle()
  ]);
  if (!readings.error && readings.data) state.glucose = readings.data.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  if (!status.error) state.libreStatus = status.data || null;
}

/** Journal entries, newest first. Quietly empty if the journal SQL hasn't been run. */
export async function loadNotes(){
  const {data, error} = await db.from("journal").select("*").order("happened_on", {ascending: false}).limit(300);
  if (!error && data) state.notes = data.slice().sort((x, y) => (y.happened_on || "").localeCompare(x.happened_on || "") || new Date(y.created_at) - new Date(x.created_at));
}

/** Appointments from the last 120 days onwards, soonest first. */
export async function loadAppts(){
  const since = new Date(Date.now() - 120 * DAY_MS).toISOString();
  const {data, error} = await db.from("appointments").select("*").gte("starts_at", since).order("starts_at").limit(500);
  if (!error && data) state.appts = data.slice().sort((x, y) => new Date(x.starts_at) - new Date(y.starts_at));
}

/** Food photos are private; each one needs a short-lived signed link. */
async function refreshPhotoUrls(){
  const now = Date.now();
  const need = state.entries.map(e => e.photo_path).filter(p => p && !(state.photoUrls[p] && state.photoUrls[p].exp > now));
  if (!need.length) return;
  const {data} = await db.storage.from("photos").createSignedUrls(need, 3600);
  if (!data) return;
  for (const r of data) if (r.signedUrl) state.photoUrls[r.path] = {url: r.signedUrl, exp: now + 50 * 60000};
  softRender();
}

/* ---------- Realtime ---------- */

// Updates often arrive in bursts, so wait a moment and reload once.
let reloadTimer = null;
export function scheduleReload(){
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => { await loadEntries(); softRender(); }, 300);
}

let glucoseTimer = null;
function scheduleGlucoseReload(){
  clearTimeout(glucoseTimer);
  glucoseTimer = setTimeout(async () => { await loadGlucose(); softRender(); }, 500);
}

/** Listen for changes made on other phones, so the log updates without a refresh. */
export function subscribe(){
  if (state.channel) return;
  state.channel = db.channel("dose-log")
    .on("postgres_changes", {event: "*", schema: "public", table: "entries"}, scheduleReload)
    .on("postgres_changes", {event: "*", schema: "public", table: "settings"}, async () => { await loadSettings(); softRender(); })
    .on("postgres_changes", {event: "*", schema: "public", table: "appointments"}, async () => { await loadAppts(); softRender(); })
    .on("postgres_changes", {event: "*", schema: "public", table: "journal"}, async () => { await loadNotes(); softRender(); })
    .on("postgres_changes", {event: "*", schema: "public", table: "glucose"}, scheduleGlucoseReload)
    .on("postgres_changes", {event: "*", schema: "public", table: "libre_status"}, scheduleGlucoseReload)
    .subscribe();
}

/** Refresh when the app comes back to the foreground, and keep "2 hrs ago" current. */
export function startBackgroundRefresh(){
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.me) scheduleReload(); });
  setInterval(() => { if (state.view === "log") softRender(); }, 60000);
}
