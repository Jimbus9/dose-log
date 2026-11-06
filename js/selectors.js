/* Read-only questions about the current state ("who am I?", "what is on today?"). */

import {state, ROLE} from "./state.js";
import {dayKey, timeOfDay, today, DAY_MS} from "./util.js";

/* ---------- Log ---------- */

/** Today's entries, optionally only one kind. Newest first. */
export const todays = kind => state.entries.filter(e => dayKey(e.at) === today() && (!kind || e.kind === kind));

/** The most recent entry of one kind. */
export const lastOf = kind => state.entries.find(e => e.kind === kind);

/* ---------- Who is signed in ---------- */

export const isLogger = () => state.me?.role === ROLE.LOGGER;
export const isAdmin = () => state.me?.role === ROLE.ADMIN;

/**
 * The dose-logging phone can also look back at the log, calendar and journal
 * (read-only), unless an admin switches that off in Settings.
 */
export const loggerSeesRecords = () => state.settings.dad_sees_records !== false;
export const readOnly = () => isLogger();

/** Display name for a family member's email. */
export function memberName(email){
  if (!email) return "";
  const m = state.members.find(x => x.email === email);
  return (m && m.name) || email.split("@")[0];
}

/* ---------- Appointments and journal ---------- */

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Appointments from the start of today onwards. */
export const upcoming = () => { const t = startOfToday(); return state.appts.filter(a => new Date(a.starts_at) >= t); };

/** "Today", "Tomorrow", or "Friday 20 November". */
export function dayLabel(t){
  const k = dayKey(t), tk = today(), tom = dayKey(Date.now() + DAY_MS);
  if (k === tk) return "Today";
  if (k === tom) return "Tomorrow";
  return new Date(t).toLocaleDateString("en-GB", {weekday: "long", day: "numeric", month: "long"});
}

/** "Tomorrow, 2:30pm" */
export const apptWhen = a => dayLabel(a.starts_at) + ", " + timeOfDay(a.starts_at);

/** Appointments on one day (key from dayKey). */
export const apptsOn = key => state.appts.filter(a => dayKey(a.starts_at) === key);

/** Journal entries written about one appointment. */
export const notesFor = apptId => state.notes.filter(n => n.appointment_id === apptId);

/** "Thu, 5 Nov 2026" for a "YYYY-MM-DD" string. */
export const dateLabel = d => new Date(d + "T12:00").toLocaleDateString("en-GB", {weekday: "short", day: "numeric", month: "short", year: "numeric"});
