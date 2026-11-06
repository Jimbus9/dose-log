/* The Journal screen: what was said at appointments, so everyone knows what's going on. */

import {state} from "../state.js";
import {esc, dayKey, timeOfDay, today, DAY_MS} from "../util.js";
import {readOnly, memberName, dayLabel, notesFor, dateLabel} from "../selectors.js";

export function journalView(){
  if (!state.loaded) return `<div class="empty">Loading…</div>`;
  // Past appointments nobody has written up yet (most recent three).
  const waiting = state.appts.filter(a => new Date(a.starts_at) <= new Date() && !notesFor(a.id).length)
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 3);
  return `<div class="screen">
      <div><h1>Health journal</h1><p class="date">What was said at appointments, so everyone knows what's going on.</p></div>
      ${readOnly() ? "" : state.noteForm ? noteFormView() : `<button class="primary dark" data-act="note-new">+ Write an entry</button>`}
      ${!readOnly() && !state.noteForm && waiting.length ? `<section class="day"><h3>Waiting for a write-up</h3><div class="entries">${waiting.map(a => `
        <div class="entry" style="--c:var(--meal)"><time>${timeOfDay(a.starts_at)}</time><div class="body">
          <span class="kind">${esc(a.title)}</span><span class="food">${dayLabel(a.starts_at)}</span>
          <div class="acts"><button class="link strong" data-writeup="${a.id}">Write up</button></div></div></div>`).join("")}</div></section>` : ""}
      ${state.notes.length ? `<div class="stack">${state.notes.map(noteCard).join("")}</div>`
        : `<div class="empty">No entries yet. After an appointment, whoever went writes what was said, any changes, and what happens next.</div>`}
    </div>`;
}

function noteCard(n){
  const appt = n.appointment_id && state.appts.find(x => x.id === n.appointment_id);
  const section = (label, text) => text ? `<div class="note-sec"><span class="lab">${label}</span><p>${esc(text)}</p></div>` : "";
  let actions;
  if (state.confirmNote === n.id) actions = `<span>Delete this entry?</span><button class="link danger" data-rmnote="${n.id}">Yes, delete</button><button class="link" data-act="cancel-note">Keep</button>`;
  else actions = readOnly() ? "" : `<button class="link" data-editnote="${n.id}">Edit</button><button class="link" data-asknote="${n.id}">Delete</button>`;
  return `<article class="note-card${state.focusNote === n.id ? " is-focus" : ""}" id="note-${n.id}">
      <header><span class="when">${dateLabel(n.happened_on)}</span><strong>${esc(appt ? appt.title : (n.title || "Note"))}</strong>
        ${n.written_by ? `<span class="by">Written by ${esc(memberName(n.written_by))}${n.updated_at && n.updated_at !== n.created_at ? " · edited" : ""}</span>` : ""}</header>
      ${section("What was said", n.summary)}${section("Changes", n.changes)}${section("Next steps", n.next_steps)}
      <div class="acts">${actions}</div>
    </article>`;
}

function noteFormView(){
  const f = state.noteForm;
  // Appointments you can attach the entry to: anything up to tomorrow, most recent first.
  const recent = state.appts.filter(a => new Date(a.starts_at) <= new Date(Date.now() + DAY_MS))
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 15);
  if (f.appointment_id && !recent.some(a => a.id === f.appointment_id)){
    const a = state.appts.find(x => x.id === f.appointment_id); if (a) recent.unshift(a);
  }
  const options = recent.map(a => `<option value="${a.id}"${a.id === f.appointment_id ? " selected" : ""}>${esc(a.title)} (${dayKey(a.starts_at).split("-").reverse().join("/")})</option>`).join("");
  const textarea = (id, label, value, placeholder, required) => `<div class="field"><label for="${id}">${label}</label><textarea class="input" id="${id}" rows="4" maxlength="4000" placeholder="${placeholder}"${required ? " required" : ""}>${esc(value || "")}</textarea></div>`;
  return `<form class="stack appt-form" id="note-form">
      <h2>${f.id ? "Edit entry" : "New journal entry"}</h2>
      <div class="field"><label for="n-appt">Which appointment?</label>
        <select class="input" id="n-appt"><option value="">Not about an appointment</option>${options}</select></div>
      <div class="row2">
        <div class="field"><label for="n-date">Date</label><input class="input" id="n-date" type="date" required value="${esc(f.happened_on || today())}"></div>
        <div class="field"><label for="n-title">Title (if not an appointment)</label><input class="input" id="n-title" type="text" maxlength="120" value="${esc(f.title || "")}" placeholder="e.g. Phone call with GP"></div>
      </div>
      ${textarea("n-summary", "What was said", f.summary, "e.g. HbA1c down to 58. Nurse happy with the long-acting dose.", true)}
      ${textarea("n-changes", "Any changes (doses, medicines, diet)", f.changes, "e.g. Mealtime insulin up from 6 to 7 units. Leave blank if none.")}
      ${textarea("n-next", "Next steps", f.next_steps, "e.g. Blood test in 3 months. Book eye screening.")}
      <p class="err" id="n-err" hidden></p>
      <button class="primary dark" type="submit">${f.id ? "Save changes" : "Save entry"}</button>
      <button class="link" type="button" data-act="note-cancel">Cancel</button>
    </form>`;
}
