/* Adding, editing and removing appointments (Calendar screen). */

import {db} from "../client.js";
import {state} from "../state.js";
import {$, banner, errText, dayKey, today} from "../util.js";
import {render} from "../render.js";
import {loadAppts} from "../data.js";

export function newAppt(){
  state.apptForm = {date: state.calDay || today(), time: "09:00"};
  render();
  $("#a-title")?.focus();
}

export function editAppt(id){
  const a = state.appts.find(x => x.id === id);
  if (!a) return;
  const d = new Date(a.starts_at);
  state.apptForm = {
    id: a.id, title: a.title, date: dayKey(d),
    time: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"),
    place: a.place, notes: a.notes
  };
  render();
  $("#appt-form")?.scrollIntoView({block: "start"});
}

export async function saveAppt(){
  const title = $("#a-title").value.trim(), date = $("#a-date").value, time = $("#a-time").value;
  const err = $("#a-err");
  if (!title || !date || !time){ err.hidden = false; err.textContent = "Add what it is, the date and the time."; return; }
  const row = {
    title, starts_at: new Date(date + "T" + time).toISOString(),
    place: $("#a-place").value.trim() || null, notes: $("#a-notes").value.trim() || null
  };
  const id = state.apptForm.id;
  const query = id ? db.from("appointments").update(row).eq("id", id) : db.from("appointments").insert(row);
  const {error} = await query;
  if (error){
    err.hidden = false;
    err.textContent = /appointments/.test(error.message || "") && /exist|schema cache/.test(error.message || "")
      ? "The appointments table isn't set up yet. Run supabase/02-appointments.sql in Supabase." : "Couldn't save: " + errText(error);
    return;
  }
  state.apptForm = null; state.calDay = date;
  await loadAppts();
  render();
}

export async function removeAppt(id){
  state.confirmAppt = null;
  state.appts = state.appts.filter(a => a.id !== id);
  render();
  const {error} = await db.from("appointments").delete().eq("id", id);
  if (error){ banner("Couldn't remove the appointment."); await loadAppts(); render(); }
}
