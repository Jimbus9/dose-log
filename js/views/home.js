/*
 * The Home screen: the big buttons used by the person taking the doses.
 * It is a short flow, tracked by state.step:
 *   home -> dose (how many units) -> food -> tick (done)
 * plus "already" (long-acting already logged today), "recentMeal" (a meal dose in the
 * last 2 hours) and "appts" (appointment list).
 */

import {state, KINDS} from "../state.js";
import {esc, timeOfDay} from "../util.js";
import {todays, lastOf, isLogger, upcoming, apptWhen} from "../selectors.js";

export function homeView(){
  const long = todays("long")[0];
  const meal = todays("meal")[0];                 // newest first
  const date = new Date().toLocaleDateString("en-GB", {weekday: "long", day: "numeric", month: "long"});
  const name = state.settings.name;
  return `<div class="screen">
      <div><h1>Hello${name ? " " + esc(name) : ""}</h1><p class="date">${date}</p></div>
      <div class="stack">
        <button class="big ${long ? "done" : ""}" style="--c:${KINDS.long.color}" data-go="long">
          <strong>Long-acting insulin</strong>
          <span>${long ? "✓ Taken today, " + timeOfDay(long.at) + " · " + long.units + " units" : "Not taken yet today"}</span>
        </button>
        <button class="big" style="--c:${KINDS.meal.color}" data-go="meal">
          <strong>Meal + insulin</strong><span>${meal ? "Last: " + timeOfDay(meal.at) + " · " + meal.units + " units" : "Log your dose and what you ate"}</span>
        </button>
        <button class="big" style="--c:${KINDS.snack.color}" data-go="snack">
          <strong>Snack</strong><span>No insulin, just what you ate</span>
        </button>
      </div>
      ${todaySoFar()}
      ${nextApptCard()}
      ${isLogger() ? remindersCard() : ""}

    </div>`;
}

/** Today's entries in plain words, oldest first, so the person can see what they've already logged. Read-only. */
function todaySoFar(){
  const list = todays().slice().reverse();
  if (!list.length) return "";
  return `<section class="today-so-far" aria-label="Logged today">
      <span class="lab">Today so far</span>
      <ul>${list.map(e => {
        const k = KINDS[e.kind];
        const what = e.kind === "snack" ? "Snack" : `${k.short} · ${e.units} units`;
        return `<li style="--c:${k.color}"><span class="tick-mark" aria-hidden="true">✓</span><time>${timeOfDay(e.at)}</time>
          <span class="what">${what}${e.food ? `<span class="muted"> · ${esc(e.food)}</span>` : ""}</span></li>`;
      }).join("")}</ul>
    </section>`;
}

/** Shown when a meal dose is tapped within 2 hours of the last one. */
export function recentMealView(){
  const last = lastOf("meal");
  const mins = Math.max(1, Math.round((Date.now() - new Date(last.at)) / 60000));
  const ago = mins < 60 ? `${mins} minute${mins === 1 ? "" : "s"} ago` : `${Math.floor(mins / 60)} hr ${mins % 60} min ago`;
  return `<div class="screen">
      <div class="alert" role="alert">
        <h2>Is this a new meal?</h2>
        <p>You logged <b>${last.units} units</b> with a meal at <b>${timeOfDay(last.at)}</b> (${ago})${last.food ? `: ${esc(last.food)}` : ""}.</p>
        <p>If you're not sure whether you've had your dose, check before taking more.</p>
      </div>
      <button class="primary dark" data-act="home">Go back</button>
      <button class="secondary" data-act="force-meal">Yes, this is a new meal</button>
    </div>`;
}

function nextApptCard(){
  const up = upcoming();
  if (!up.length) return "";
  const a = up[0];
  return `<section class="appt-next">
      <span class="lab">Next appointment</span>
      <strong>${esc(a.title)}</strong>
      <span>${apptWhen(a)}</span>
      ${a.place ? `<span class="muted">${esc(a.place)}</span>` : ""}
      ${up.length > 1 ? `<button class="secondary" data-act="all-appts">See all ${up.length} appointments</button>` : ""}
    </section>`;
}

export function appointmentsListView(){
  const up = upcoming();
  return `<div class="screen">
      <button class="back" data-act="home">← Back</button>
      <p class="q">Your appointments</p>
      ${up.length ? `<div class="stack">${up.map(a => `<div class="appt-card">
          <span class="when">${apptWhen(a)}</span>
          <strong>${esc(a.title)}</strong>
          ${a.place ? `<span class="muted">${esc(a.place)}</span>` : ""}
          ${a.notes ? `<span class="muted">${esc(a.notes)}</span>` : ""}
        </div>`).join("")}</div>` : `<div class="empty">No appointments coming up.</div>`}
    </div>`;
}

/** Shown when long-acting is tapped twice in a day. Logging a second dose needs a deliberate extra tap. */
export function alreadyTakenView(){
  const long = todays("long")[0];
  return `<div class="screen">
      <div class="alert" role="alert">
        <h2>Already taken today</h2>
        <p>Your long-acting insulin was logged at <b>${timeOfDay(long.at)}</b> (${long.units} units).</p>
        <p>Taking it twice can be dangerous. If you're not sure, call the diabetes team.</p>
      </div>
      <button class="primary dark" data-act="home">Go back</button>
      <button class="secondary" data-act="force-long">I'm sure, log another dose</button>
    </div>`;
}

export function doseView(){
  const kind = KINDS[state.draft.kind];
  const meal = state.draft.kind === "meal";
  return `<div class="screen">
      <button class="back" data-act="home">← Back</button>
      <p class="q">${meal ? "How many units with this meal?" : "How many units of long-acting?"}</p>
      <div class="stepper">
        <button aria-label="One unit less" data-act="minus">−</button>
        <div class="units"><b id="units">${state.draft.units}</b><small>units</small></div>
        <button aria-label="One unit more" data-act="plus">+</button>
      </div>
      <button class="primary" style="--c:${kind.color}" data-act="${meal ? "to-food" : "save"}" ${state.saving ? "disabled" : ""}>${meal ? "Next" : (state.saving ? "Saving…" : "Done")}</button>
    </div>`;
}

export function foodView(){
  const d = state.draft;
  const kind = KINDS[d.kind];
  return `<div class="screen">
      <button class="back" data-act="${d.kind === "meal" ? "to-dose" : "home"}">← Back</button>
      <p class="q">What did you eat?</p>
      ${d.previewUrl
        ? `<img class="photo-prev" src="${esc(d.previewUrl)}" alt="Photo of the food"><button class="secondary" data-act="photo">Take a different photo</button>`
        : `<label class="photo-btn" for="photo-in">📷 Take a photo</label>`}
      <input id="photo-in" type="file" accept="image/*" capture="environment" hidden>
      <div class="field"><label for="food-in">Or write a few words</label>
        <input class="input" id="food-in" type="text" maxlength="300" placeholder="e.g. Toast and beans" value="${esc(d.food || "")}"></div>
      <div class="field"><label for="carbs-in">Carbs in grams (if you know)</label>
        <input class="input" id="carbs-in" type="number" inputmode="numeric" min="0" max="400" placeholder="Leave blank if not sure" value="${d.carbs ?? ""}"></div>
      <button class="primary" style="--c:${kind.color}" data-act="save" ${state.saving || d.uploading ? "disabled" : ""}>${d.uploading ? "Adding photo…" : state.saving ? "Saving…" : "Done"}</button>
    </div>`;
}

/** The big tick after saving. The Undo button stays for a minute (see actions/dose.js). */
export function tickView(){
  const e = state.last;
  const what = e.kind === "snack" ? "Snack logged" : e.units + " units logged";
  return `<div class="screen">
      <div class="tick">
        <div class="circle"><svg viewBox="0 0 24 24" fill="none" stroke="var(--on)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h2>${what}</h2><p>${KINDS[e.kind].short} · ${timeOfDay(e.at)}</p>
      </div>
      <button class="primary dark" data-act="home">Back to start</button>
      ${state.undoTimer ? `<button class="secondary" data-act="undo">Undo, I tapped by mistake</button>` : ""}
    </div>`;
}

/** The "turn on reminders" card. Only for the dose-logging phone, and only if the reminders feature is installed. */
function remindersCard(){
  const st = state.settings;
  if (!("remind_breakfast" in st) || state.push === "checking") return "";
  if (state.push === "unsupported") return `<p class="hint" style="text-align:center">Reminders need this app installed from Chrome.</p>`;
  if (state.push === "on") return `<p class="rem-on">🔔 Reminders are on for this phone</p>`;
  if (state.push === "denied") return `<div class="appt-next"><strong>Reminders are blocked</strong>
      <span class="muted">Notifications were turned off for this app. Turn them on in the phone's Settings → Apps → Dose Log → Notifications, then come back here.</span></div>`;
  return `<section class="appt-next">
      <span class="lab">Reminders</span>
      <strong>Get a nudge if you forget to log</strong>
      <span class="muted">Breakfast ${timeOfDay("2000-01-01T" + st.remind_breakfast)}, lunch ${timeOfDay("2000-01-01T" + st.remind_lunch)}, evening meal ${timeOfDay("2000-01-01T" + st.remind_evening)}, long-acting ${timeOfDay("2000-01-01T" + st.remind_long)}. Only if nothing's logged yet.</span>
      <button class="primary" style="--c:var(--long)" data-act="push-on" ${state.push === "busy" ? "disabled" : ""}>${state.push === "busy" ? "Turning on…" : "Turn on reminders"}</button>
    </section>`;
}
