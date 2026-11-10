/*
 * Optional glucose section for the Log screen: latest reading plus a 24-hour chart
 * with doses marked on it. Readings arrive via the libre-sync Edge Function; if that
 * isn't installed this section simply doesn't appear.
 */

import {state} from "../state.js";
import {esc, timeOfDay, timeAgo} from "../util.js";

/** mg/dL (what LibreLinkUp sends) -> mmol/L to 1 decimal place (what UK meters show). */
export const mmol = mgdl => Math.round(mgdl / 18.016 * 10) / 10;
const ARROWS = {1: "↓", 2: "↘", 3: "→", 4: "↗", 5: "↑"};
const ARROW_WORDS = {1: "falling fast", 2: "falling", 3: "steady", 4: "rising", 5: "rising fast"};
/** Below, inside or above the usual 3.9-10 mmol/L target range. */
export const band = v => v < 3.9 ? "low" : v > 10 ? "high" : "in";

export function glucoseSection(){
  const st = state.libreStatus, pts = state.glucose;
  if (!st && !pts.length) return "";                       // sync not set up
  const last = pts[pts.length - 1];
  const errNewer = st?.last_error && (!st.last_ok || new Date(st.last_error_at) > new Date(st.last_ok));
  const staleMin = last ? Math.round((Date.now() - new Date(last.ts)) / 60000) : null;
  let head;
  if (last){
    const v = mmol(last.mgdl), b = band(v);
    head = `<div class="glu-now glu-${staleMin > 30 ? "stale" : b}">
        <span class="lab">Glucose</span>
        <span class="glu-val">${v.toFixed(1)}<small> mmol/L</small> <span class="arrow" aria-label="${ARROW_WORDS[last.trend] || ""}">${ARROWS[last.trend] || ""}</span></span>
        <span class="sub">${b === "low" ? "Below 3.9 · " : b === "high" ? "Above 10 · " : ""}${timeAgo(last.ts)}${staleMin > 30 ? " · no newer reading" : ""}</span>
      </div>`;
  } else {
    head = `<div class="glu-now glu-stale"><span class="lab">Glucose</span><span class="sub">Waiting for the first reading from LibreLinkUp…</span></div>`;
  }
  return `<section class="glu">
      ${head}
      ${pts.length > 1 ? glucoseChart(pts) : ""}
      ${pts.length ? `<button class="secondary" data-act="history">See past days</button>` : ""}
      ${errNewer ? `<p class="glu-err">Libre sync problem: ${esc(st.last_error)}</p>` : ""}
      <p class="hint">From LibreLinkUp. Check the Libre app before acting on a reading.</p>
    </section>`;
}

/**
 * A glucose line with doses and snacks marked underneath.
 * By default it shows the last 24 hours; the history screen passes one calendar day.
 */
export function glucoseChart(pts, {t0, t1, entries = state.entries, endLabel = "now"} = {}){
  const W = 360, H = 190, L = 28, R = 8, T = 10, B = 40;   // B leaves room for the dose row
  t1 = t1 ?? Date.now(); t0 = t0 ?? t1 - 24 * 3600e3;
  const span = (t1 - t0) / 3600e3;
  const yMin = 2, yMax = 20;
  const x = t => L + (Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0) * (W - L - R);
  const y = v => T + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * (H - T - B);

  // The line breaks wherever readings are more than 30 minutes apart.
  let path = "", prev = null;
  for (const p of pts){
    const t = new Date(p.ts).getTime(); if (t < t0) continue;
    path += (prev && t - prev < 30 * 60000 ? "L" : "M") + x(t).toFixed(1) + " " + y(mmol(p.mgdl)).toFixed(1);
    prev = t;
  }

  const grid = [4, 10, 15].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g-grid"/><text x="${L - 4}" y="${y(v) + 4}" class="g-axis" text-anchor="end">${v}</text>`).join("");
  const ticks = [];
  for (let i = 0; i <= 4; i++){
    const t = t0 + i * span / 4 * 3600e3;
    ticks.push(`<text x="${x(t)}" y="${H - 2}" class="g-axis" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${i === 4 && endLabel ? endLabel : timeOfDay(t)}</text>`);
  }

  // Doses and snacks as marks along the bottom.
  const rowY = H - B + 14;
  const marks = entries.filter(e => { const t = new Date(e.at).getTime(); return t >= t0 && t <= t1; }).map(e => {
    const cx = x(new Date(e.at).getTime());
    const c = e.kind === "long" ? "var(--long)" : e.kind === "meal" ? "var(--meal)" : "var(--snack)";
    const label = e.kind === "snack" ? "" : `<text x="${cx}" y="${rowY - 8}" class="g-dose" text-anchor="middle">${e.units}u</text>`;
    return `<line x1="${cx}" x2="${cx}" y1="${T}" y2="${rowY - 6}" class="g-mark" style="stroke:${c}"/><circle cx="${cx}" cy="${rowY}" r="5" style="fill:${c}"/>${label}`;
  }).join("");

  const last = pts[pts.length - 1];
  const lx = x(new Date(last.ts).getTime()), ly = y(mmol(last.mgdl));
  return `<div class="glu-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Glucose ${endLabel === "now" ? "over the last 24 hours" : "for the day"}, with doses and food marked">
      <rect x="${L}" y="${y(10)}" width="${W - L - R}" height="${y(3.9) - y(10)}" class="g-band"/>
      ${grid}${marks}
      <path d="${path}" class="g-line"/>
      <circle cx="${lx}" cy="${ly}" r="4" class="g-end"/>
      ${ticks.join("")}
    </svg>
    <div class="g-key"><span><i style="background:var(--long)"></i>Long-acting</span><span><i style="background:var(--meal)"></i>Meal dose</span><span><i style="background:var(--snack)"></i>Snack</span><span><i class="band"></i>3.9–10 range</span></div>
    </div>`;
}
