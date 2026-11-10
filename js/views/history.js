/* Glucose history: pick any day to see its graph, doses and a short summary. */

import {state, KINDS} from "../state.js";
import {esc, timeOfDay, today} from "../util.js";
import {dayLabel} from "../selectors.js";
import {glucoseChart} from "./glucose.js";
import {dayStats} from "../actions/history.js";

export function historyView(){
  const h = state.hist;
  if (!h.day) return `<div class="empty">Loading…</div>`;
  const [y, m, d] = h.day.split("-").map(Number);
  const start = new Date(y, m - 1, d), end = new Date(y, m - 1, d + 1);
  const isToday = h.day === today();
  const s = dayStats(h.readings);

  let body;
  if (h.loading) body = `<div class="empty">Loading ${esc(dayLabel(start))}…</div>`;
  else if (!s.count) body = `<div class="empty">No glucose readings saved for this day.</div>`;
  else body = `
      <div class="status">
        <div class="stat"><span class="lab">Average</span><span class="val">${s.avg.toFixed(1)}</span><span class="sub">mmol/L</span></div>
        <div class="stat"><span class="lab">In range (3.9–10)</span><span class="val">${s.inRange}%</span><span class="sub">of readings</span></div>
        <div class="stat"><span class="lab">Lows (under 3.9)</span><span class="val">${s.lows}</span><span class="sub">${s.low}% of readings · lowest ${s.min.toFixed(1)}</span></div>
        <div class="stat"><span class="lab">Highs (over 10)</span><span class="val">${s.high}%</span><span class="sub">highest ${s.max.toFixed(1)}</span></div>
      </div>
      <section class="glu">${glucoseChart(h.readings, {t0: start.getTime(), t1: isToday ? Date.now() : end.getTime(), entries: h.entries, endLabel: isToday ? "now" : ""})}</section>`;

  const list = h.entries.length ? `<section class="day"><h3>Logged that day</h3><div class="entries">${h.entries.map(e => {
      const k = KINDS[e.kind];
      const food = [e.food, e.carbs != null ? e.carbs + "g carbs" : null].filter(Boolean).map(esc).join(" · ");
      return `<div class="entry" style="--c:${k.color}"><time>${timeOfDay(e.at)}</time><div class="body">
        <span class="kind">${k.short}${e.kind === "snack" ? "" : ` · <em>${e.units} units</em>`}</span>${food ? `<span class="food">${food}</span>` : ""}</div></div>`;
    }).join("")}</div></section>` : (h.loading ? "" : `<p class="hint">Nothing was logged on this day.</p>`);

  return `<div class="screen">
      <a class="back" href="#log">← Back to the log</a>
      <h1>Glucose history</h1>
      <div class="hist-nav">
        <button class="cal-nav" data-act="hist-prev" aria-label="Previous day">‹</button>
        <div class="hist-day"><strong>${esc(dayLabel(start))}</strong>
          <input class="input hist-date" id="hist-date" type="date" max="${today()}" value="${esc(h.day)}" aria-label="Pick a day"></div>
        <button class="cal-nav" data-act="hist-next" aria-label="Next day" ${isToday ? "disabled" : ""}>›</button>
      </div>
      ${body}
      ${list}
      ${recentDays()}
      <section class="section">
        <h2>Keep a copy</h2>
        <p class="hint">Download everything as spreadsheet files. Worth doing once a month as a backup.</p>
        <div class="row2">
          <button class="secondary" data-export="glucose" ${h.exporting ? "disabled" : ""}>${h.exporting === "glucose" ? "Preparing…" : "Glucose readings"}</button>
          <button class="secondary" data-export="entries" ${h.exporting ? "disabled" : ""}>${h.exporting === "entries" ? "Preparing…" : "Doses and meals"}</button>
        </div>
      </section>
      <p class="hint">From LibreLinkUp. The diabetes team's reports come from LibreView, which keeps its own full history.</p>
    </div>`;
}

/** The last two weeks at a glance; tap a day to open it. */
function recentDays(){
  const days = state.hist.days;
  if (!days || !days.length) return "";
  return `<section class="day"><h3>Recent days</h3><div class="entries">${days.map(d => `
      <button class="hist-row${d.day === state.hist.day ? " is-sel" : ""}" data-histday="${d.day}">
        <span class="hist-row-day">${esc(new Date(d.day + "T12:00").toLocaleDateString("en-GB", {weekday: "short", day: "numeric", month: "short"}))}</span>
        <span class="hist-bar" aria-hidden="true"><i class="low" style="width:${d.low}%"></i><i class="in" style="width:${d.inRange}%"></i><i class="high" style="width:${d.high}%"></i></span>
        <span class="hist-row-num">${d.avg.toFixed(1)} avg · ${d.inRange}% in range${d.lows ? ` · ${d.lows} low${d.lows > 1 ? "s" : ""}` : ""}</span>
      </button>`).join("")}</div></section>`;
}
