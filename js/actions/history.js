/*
 * Glucose history: load one day's readings and log entries, a summary of recent
 * days, and export everything as CSV files (a backup the family keeps themselves).
 */

import {db} from "../client.js";
import {state} from "../state.js";
import {banner, dayKey, today, errText} from "../util.js";
import {render} from "../render.js";

const PAGE = 1000;               // Supabase returns at most 1000 rows per request
const SUMMARY_DAYS = 14;

/** Fetch every row of a query, 1000 at a time. `build` returns a fresh query each call. */
async function fetchAll(build){
  const rows = [];
  for (let from = 0; ; from += PAGE){
    const {data, error} = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Local midnight at the start of a "YYYY-MM-DD" day, and of the day after. */
function dayBounds(day){
  const [y, m, d] = day.split("-").map(Number);
  return [new Date(y, m - 1, d), new Date(y, m - 1, d + 1)];
}

/** Show one day (default: the one already open, else today). */
export async function openHistory(day){
  const h = state.hist;
  day = day || h.day || today();
  if (day > today()) day = today();
  h.day = day; h.loading = true;
  render();
  try {
    const [start, end] = dayBounds(day);
    const [readings, entries] = await Promise.all([
      fetchAll(() => db.from("glucose").select("ts,mgdl,trend").gte("ts", start.toISOString()).lt("ts", end.toISOString()).order("ts")),
      fetchAll(() => db.from("entries").select("*").gte("at", start.toISOString()).lt("at", end.toISOString()).order("at"))
    ]);
    if (h.day !== day) return;                       // another day was picked meanwhile
    h.readings = readings; h.entries = entries;
  } catch(e){
    banner("Couldn't load that day: " + errText(e));
  }
  h.loading = false;
  if (!h.days) loadRecentDays();
  render();
}

export const shiftDay = delta => {
  const [y, m, d] = state.hist.day.split("-").map(Number);
  openHistory(dayKey(new Date(y, m - 1, d + delta)));
};

/** Summaries of the last two weeks, for the list under the chart. */
async function loadRecentDays(){
  const [start] = dayBounds(dayKey(Date.now() - (SUMMARY_DAYS - 1) * 864e5));
  try {
    const rows = await fetchAll(() => db.from("glucose").select("ts,mgdl").gte("ts", start.toISOString()).order("ts"));
    const byDay = {};
    for (const r of rows) (byDay[dayKey(r.ts)] ||= []).push(r);
    state.hist.days = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => ({day, ...dayStats(list)}));
  } catch(e){
    state.hist.days = [];
  }
  render();
}

/**
 * Plain numbers for one day. Each reading counts equally, so "time in range" here
 * means "share of readings in range" - close enough for a family overview.
 */
export function dayStats(readings){
  const v = readings.map(r => Math.round(r.mgdl / 18.016 * 10) / 10);
  if (!v.length) return {count: 0};
  let lows = 0, prevLow = false;
  for (const x of v){ const low = x < 3.9; if (low && !prevLow) lows++; prevLow = low; }
  const pct = n => Math.round(100 * n / v.length);
  return {
    count: v.length,
    avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10,
    min: Math.min(...v), max: Math.max(...v),
    inRange: pct(v.filter(x => x >= 3.9 && x <= 10).length),
    low: pct(v.filter(x => x < 3.9).length),
    high: pct(v.filter(x => x > 10).length),
    lows
  };
}

/* ---------- Export ---------- */

const csvCell = v => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const ukTime = t => new Date(t).toLocaleString("en-GB", {year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"}).replace(",", "");

/** Download every glucose reading, or every log entry, as a spreadsheet-friendly CSV file. */
export async function exportCsv(kind){
  state.hist.exporting = kind; render();
  try {
    let header, rows;
    if (kind === "glucose"){
      const data = await fetchAll(() => db.from("glucose").select("ts,mgdl").order("ts"));
      header = ["Time (UK)", "mmol/L", "mg/dL"];
      rows = data.map(r => [ukTime(r.ts), (Math.round(r.mgdl / 18.016 * 10) / 10).toFixed(1), r.mgdl]);
    } else {
      const data = await fetchAll(() => db.from("entries").select("*").order("at"));
      const kindName = {long: "Long-acting insulin", meal: "Meal + insulin", snack: "Snack"};
      header = ["Time (UK)", "Type", "Units", "Food", "Carbs (g)", "Logged by", "Checked by", "Checked at"];
      rows = data.map(e => [ukTime(e.at), kindName[e.kind] || e.kind, e.units, e.food, e.carbs, e.logged_by, e.acked_by, e.acked_at ? ukTime(e.acked_at) : ""]);
    }
    const csv = [header, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], {type: "text/csv;charset=utf-8"}));
    const a = document.createElement("a");
    a.href = url; a.download = `dose-log-${kind}-${today()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch(e){
    banner("Couldn't export: " + errText(e));
  }
  state.hist.exporting = null; render();
}
