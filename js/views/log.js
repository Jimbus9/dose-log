/* The Log screen: today's status for the family, then a timeline of every entry. */

import {state, KINDS} from "../state.js";
import {esc, dayKey, timeOfDay, timeAgo, today, DAY_MS} from "../util.js";
import {todays, lastOf, isLogger, memberName} from "../selectors.js";
import {glucoseSection} from "./glucose.js";

export function logView(){
  if (!state.loaded) return `<div class="empty">Loading the log…</div>`;
  const long = todays("long")[0];
  const [hh, mm] = (state.settings.long_by || "10:00").split(":").map(Number);
  const due = new Date(); due.setHours(hh, mm, 0, 0);
  const overdue = !long && Date.now() > due.getTime();
  const lastMeal = lastOf("meal");
  const name = state.settings.name;
  let html = `<div class="screen">

      <h1>${name ? esc(name) + " today" : "Today"}</h1>
      <div class="status">
        ${overdue ? `<div class="flag">No long-acting dose logged yet. Usually taken by ${timeOfDay(due)}.</div>` : ""}
        <div class="stat"><span class="lab">Long-acting</span>
          ${long ? `<span class="val">${long.units} units</span><span class="pill ok">✓ ${timeOfDay(long.at)}</span>`
                 : `<span class="val">—</span><span class="pill ${overdue ? "bad" : ""}">Not yet</span>`}
        </div>
        <div class="stat"><span class="lab">Last meal dose</span>
          ${lastMeal ? `<span class="val">${lastMeal.units} units</span><span class="sub">${timeAgo(lastMeal.at)}</span>` : `<span class="val">—</span><span class="sub">None logged</span>`}
        </div>
        <div class="stat"><span class="lab">Meals today</span><span class="val">${todays("meal").length}</span></div>
        <div class="stat"><span class="lab">Snacks today</span><span class="val">${todays("snack").length}</span></div>
      </div>
      ${glucoseSection()}`;

  if (!state.entries.length){
    return html + `<div class="empty">Nothing logged yet. Every tap on the Home screen shows up here straight away, with times, units and food photos.</div></div>`;
  }

  // Group the entries by day, newest day first.
  const groups = {};
  for (const e of state.entries) (groups[dayKey(e.at)] ||= []).push(e);
  const yesterday = dayKey(Date.now() - DAY_MS);
  for (const [day, list] of Object.entries(groups)){
    const label = day === today() ? "Today" : day === yesterday ? "Yesterday"
      : new Date(day + "T12:00").toLocaleDateString("en-GB", {weekday: "long", day: "numeric", month: "short"});
    html += `<section class="day"><h3>${label}</h3><div class="entries">${list.map(entryRow).join("")}</div></section>`;
  }
  return html + `</div>`;
}

function entryRow(e){
  const kind = KINDS[e.kind];
  const dose = e.kind === "snack" ? "" : ` · <em>${e.units} units</em>`;
  const food = [e.food, e.carbs != null ? e.carbs + "g carbs" : null].filter(Boolean).map(esc).join(" · ");
  const photo = e.photo_path && state.photoUrls[e.photo_path];
  const img = e.photo_path ? (photo ? `<img src="${esc(photo.url)}" alt="Food photo" loading="lazy">` : `<span class="hint">Photo loading…</span>`) : "";
  const by = e.logged_by && e.logged_by !== state.me?.email && !isLogger() ? `<span class="by">Logged by ${esc(memberName(e.logged_by))}</span>` : "";

  // The buttons under each entry change while someone is mid-way through removing it or editing its carbs.
  let actions;
  if (state.confirmDel === e.id) actions = `<span>Remove this entry?</span><button class="link danger" data-del="${e.id}">Yes, remove</button><button class="link" data-act="cancel-del">Keep</button>`;
  else if (state.editCarbs === e.id) actions = `<div class="inline-edit"><input id="carbs-${e.id}" type="number" inputmode="numeric" min="0" max="400" aria-label="Carbs in grams" placeholder="grams"><button class="save" data-savecarbs="${e.id}">Save</button><button class="link" data-act="cancel-carbs">Cancel</button></div>`;
  else actions = `${e.kind !== "long" ? `<button class="link" data-carbs="${e.id}">${e.carbs == null ? "+ Add carbs" : "Change carbs"}</button>` : ""}<button class="link" data-askdel="${e.id}">Remove</button>`;

  return `<div class="entry" style="--c:${kind.color}"><time>${timeOfDay(e.at)}</time><div class="body">
      <span class="kind">${kind.short}${dose}</span>${food ? `<span class="food">${food}</span>` : ""}${img}${by}<div class="acts">${actions}</div></div></div>`;
}
