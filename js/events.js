/*
 * All clicks, form submits and input changes are handled here, in three listeners on
 * the document. Buttons in the views carry data attributes saying what they do:
 *   data-go="long|meal|snack"   start a log flow
 *   data-act="..."              a named action (see the switch below)
 *   data-carbs / data-del / data-editappt / ...   an action on one specific item (value = its id)
 */

import {$, banner, store, dayKey} from "./util.js";
import {state} from "./state.js";
import {render, route} from "./render.js";
import {sendCode, verifyCode, signOut} from "./auth.js";
import {enablePush} from "./push.js";
import {start, readFood, changeUnits, save, undo, onPhoto, openCarbsEditor, saveCarbs, askDeleteEntry, deleteEntry, ackEntry} from "./actions/dose.js";
import {newAppt, editAppt, saveAppt, removeAppt} from "./actions/appointments.js";
import {openNoteForm, startWriteUp, editNote, readNote, saveNote, removeNote} from "./actions/journal.js";
import {saveSettings, addMember, changeRole, removeMember} from "./actions/settings.js";
import {openHistory, shiftDay, exportCsv} from "./actions/history.js";

export function initEvents(){
  window.addEventListener("hashchange", route);
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("change", onChange);
}

async function onClick(ev){
  const t = ev.target.closest("button");
  if (!t) return;
  const d = t.dataset;

  // Buttons that act on one specific thing (the value is its id or email).
  if (d.go) return start(d.go);
  if (d.carbs) return openCarbsEditor(d.carbs);
  if (d.savecarbs) return saveCarbs(d.savecarbs);
  if (d.askdel) return askDeleteEntry(d.askdel);
  if (d.del) return deleteEntry(d.del);
  if (d.ack) return ackEntry(d.ack, true);
  if (d.unack) return ackEntry(d.unack, false);
  if (d.calday){ state.calDay = d.calday; state.confirmAppt = null; return render(); }
  if (d.editappt) return editAppt(d.editappt);
  if (d.askappt){ state.confirmAppt = d.askappt; return render(); }
  if (d.rmappt) return removeAppt(d.rmappt);
  if (d.writeup) return startWriteUp(d.writeup);
  if (d.readnote) return readNote(d.readnote);
  if (d.editnote) return editNote(d.editnote);
  if (d.asknote){ state.confirmNote = d.asknote; return render(); }
  if (d.rmnote) return removeNote(d.rmnote);
  if (d.histday) return openHistory(d.histday);
  if (d.export) return exportCsv(d.export);
  if (d.askmember){ state.confirmMember = d.askmember; return render(); }
  if (d.rmmember) return removeMember(d.rmmember);

  // Named actions.
  switch (d.act){
    case "home": state.step = "home"; state.draft = null; banner(""); render(); window.scrollTo(0, 0); break;
    case "force-long": start("long", true); break;
    case "minus": changeUnits(-1); break;
    case "plus": changeUnits(1); break;
    case "to-food": state.step = "food"; render(); break;
    case "to-dose": readFood(); state.step = "dose"; render(); break;
    case "photo": $("#photo-in").click(); break;
    case "save": save(); break;
    case "undo": undo(); break;
    case "save-settings": saveSettings(); break;
    case "cancel-carbs": state.editCarbs = null; render(); break;
    case "cancel-del": state.confirmDel = null; render(); break;
    case "cancel-member": state.confirmMember = null; render(); break;
    case "all-appts": state.step = "appts"; render(); window.scrollTo(0, 0); break;
    case "cal-prev": case "cal-next": {
      const m = state.calMonth, step = d.act === "cal-next" ? 1 : -1, first = new Date(m.y, m.m + step, 1);
      state.calMonth = {y: first.getFullYear(), m: first.getMonth()};
      render();
      break;
    }
    case "appt-new": newAppt(); break;
    case "appt-cancel": state.apptForm = null; render(); break;
    case "cancel-appt": state.confirmAppt = null; render(); break;
    case "note-new": openNoteForm({happened_on: dayKey(Date.now())}); break;
    case "note-cancel": state.noteForm = null; render(); break;
    case "cancel-note": state.confirmNote = null; render(); break;
    case "push-on": enablePush(); break;
    case "alerts-on": enablePush("alerts"); break;
    case "history": location.hash = "#history"; openHistory(); break;
    case "hist-prev": shiftDay(-1); break;
    case "hist-next": shiftDay(1); break;
    case "signout": signOut(); break;
    case "resend": {
      const email = store.get("doselog.pendingEmail");
      state.auth = "email"; render();
      if (email) sendCode(email);
      break;
    }
    case "other-email": store.set("doselog.pendingEmail", null); state.auth = "email"; render(); break;
  }
}

function onSubmit(ev){
  ev.preventDefault();
  const id = ev.target.id;
  if (id === "email-form") sendCode($("#email-in").value.trim().toLowerCase());
  if (id === "code-form") verifyCode();
  if (id === "member-form") addMember();
  if (id === "appt-form") saveAppt();
  if (id === "note-form") saveNote();
}

function onChange(ev){
  const el = ev.target;
  if (el.dataset && el.dataset.rolefor) return changeRole(el.dataset.rolefor, el.value);
  if (el.id === "n-appt" && el.value){
    // Picking an appointment in the journal form fills in its date.
    const a = state.appts.find(x => x.id === el.value);
    if (a) $("#n-date").value = dayKey(a.starts_at);
  }
  if (el.id === "photo-in") onPhoto(el.files[0]);
  if (el.id === "hist-date" && el.value) openHistory(el.value);
}
