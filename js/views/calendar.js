/* The Calendar screen: a month grid, the selected day's appointments, and the add/edit form. */

import {state} from "../state.js";
import {esc, dayKey, timeOfDay, today} from "../util.js";
import {readOnly, upcoming, dayLabel, apptsOn, notesFor} from "../selectors.js";

export function calendarView(){
  if (!state.loaded) return `<div class="empty">Loading…</div>`;
  const now = new Date();
  const month = state.calMonth || {y: now.getFullYear(), m: now.getMonth()};
  state.calMonth = month;
  const selected = state.calDay || today();
  const first = new Date(month.y, month.m, 1);
  const lead = (first.getDay() + 6) % 7;                 // weeks start on Monday
  const days = new Date(month.y, month.m + 1, 0).getDate();

  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<span class="cal-pad"></span>`;
  for (let d = 1; d <= days; d++){
    const key = dayKey(new Date(month.y, month.m, d));
    const n = apptsOn(key).length;
    cells += `<button class="cal-day${key === today() ? " is-today" : ""}${key === selected ? " is-sel" : ""}" data-calday="${key}" aria-label="${d}${n ? ", " + n + " appointment" + (n > 1 ? "s" : "") : ""}">
        <span>${d}</span>${n ? `<i class="dot"></i>` : ""}</button>`;
  }

  const title = first.toLocaleDateString("en-GB", {month: "long", year: "numeric"});
  const onSelectedDay = apptsOn(selected);
  const comingUp = upcoming().slice(0, 6);
  return `<div class="screen">
      <h1>Appointments</h1>
      <div class="cal">
        <div class="cal-head">
          <button class="cal-nav" data-act="cal-prev" aria-label="Previous month">‹</button>
          <strong>${title}</strong>
          <button class="cal-nav" data-act="cal-next" aria-label="Next month">›</button>
        </div>
        <div class="cal-grid">${["M", "T", "W", "T", "F", "S", "S"].map(d => `<span class="cal-dow">${d}</span>`).join("")}${cells}</div>
      </div>
      <section class="day">
        <h3>${dayLabel(new Date(selected + "T12:00"))}</h3>
        ${onSelectedDay.length ? `<div class="entries">${onSelectedDay.map(a => apptRow(a)).join("")}</div>` : `<p class="hint">Nothing on this day.</p>`}
      </section>
      ${readOnly() ? "" : state.apptForm ? apptFormView() : `<button class="secondary" data-act="appt-new">+ Add appointment</button>`}
      ${comingUp.length ? `<section class="day"><h3>Coming up</h3><div class="entries">${comingUp.map(a => apptRow(a, true)).join("")}</div></section>` : ""}
    </div>`;
}

/** One appointment. In the "Coming up" list (withDay) it shows the date and has no buttons. */
export function apptRow(a, withDay){
  let actions;
  if (state.confirmAppt === a.id) actions = `<span>Remove this appointment?</span><button class="link danger" data-rmappt="${a.id}">Yes, remove</button><button class="link" data-act="cancel-appt">Keep</button>`;
  else {
    const notes = notesFor(a.id);
    const isPast = new Date(a.starts_at) <= new Date();
    const writeUp = notes.length ? `<button class="link strong" data-readnote="${notes[0].id}">Read write-up${notes.length > 1 ? "s (" + notes.length + ")" : ""}</button>`
      : isPast && !readOnly() ? `<button class="link strong" data-writeup="${a.id}">Write up</button>` : "";
    actions = readOnly() ? writeUp : `${writeUp}<button class="link" data-editappt="${a.id}">Edit</button><button class="link" data-askappt="${a.id}">Remove</button>`;
  }
  return `<div class="entry" style="--c:var(--long)"><time>${timeOfDay(a.starts_at)}</time><div class="body">
      <span class="kind">${esc(a.title)}</span>
      ${withDay ? `<span class="food">${dayLabel(a.starts_at)}</span>` : ""}
      ${a.place ? `<span class="food">${esc(a.place)}</span>` : ""}
      ${a.notes ? `<span class="food">${esc(a.notes)}</span>` : ""}
      ${withDay ? "" : `<div class="acts">${actions}</div>`}</div></div>`;
}

function apptFormView(){
  const f = state.apptForm;
  return `<form class="stack appt-form" id="appt-form">
      <h2>${f.id ? "Edit appointment" : "New appointment"}</h2>
      <div class="field"><label for="a-title">What is it?</label><input class="input" id="a-title" type="text" maxlength="120" required placeholder="e.g. Diabetes clinic" value="${esc(f.title || "")}"></div>
      <div class="row2">
        <div class="field"><label for="a-date">Date</label><input class="input" id="a-date" type="date" required value="${esc(f.date)}"></div>
        <div class="field"><label for="a-time">Time</label><input class="input" id="a-time" type="time" required value="${esc(f.time || "09:00")}"></div>
      </div>
      <div class="field"><label for="a-place">Where (optional)</label><input class="input" id="a-place" type="text" maxlength="200" placeholder="e.g. City Hospital, Outpatients" value="${esc(f.place || "")}"></div>
      <div class="field"><label for="a-notes">Notes (optional)</label><input class="input" id="a-notes" type="text" maxlength="1000" placeholder="e.g. Bring the meter." value="${esc(f.notes || "")}"></div>
      <p class="err" id="a-err" hidden></p>
      <button class="primary dark" type="submit">${f.id ? "Save changes" : "Add appointment"}</button>
      <button class="link" type="button" data-act="appt-cancel">Cancel</button>
    </form>`;
}
