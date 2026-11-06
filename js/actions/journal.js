/* Writing, editing and deleting health journal entries. */

import {db} from "../client.js";
import {state} from "../state.js";
import {$, banner, errText, dayKey, today} from "../util.js";
import {render} from "../render.js";
import {loadNotes} from "../data.js";

/** Open the entry form (on the Journal screen), then scroll to it and focus the first box. */
export function openNoteForm(initial){
  state.noteForm = initial;
  state.confirmNote = null;
  if (state.view !== "journal") location.hash = "#journal"; else render();
  setTimeout(() => { $("#note-form")?.scrollIntoView({block: "start"}); $("#n-summary")?.focus({preventScroll: true}); }, 50);
}

/** "Write up" button on an appointment: start an entry already linked to it. */
export function startWriteUp(apptId){
  const a = state.appts.find(x => x.id === apptId);
  openNoteForm({appointment_id: a?.id || null, happened_on: a ? dayKey(a.starts_at) : today()});
}

export function editNote(id){
  const n = state.notes.find(x => x.id === id);
  if (n) openNoteForm({...n});
}

/** "Read write-up" button on an appointment: jump to its entry on the Journal screen. */
export function readNote(id){
  state.focusNote = id;
  state.noteForm = null;
  if (state.view !== "journal") location.hash = "#journal"; else render();
  setTimeout(() => $("#note-" + state.focusNote)?.scrollIntoView({block: "center"}), 80);
}

export async function saveNote(){
  const err = $("#n-err");
  const row = {
    appointment_id: $("#n-appt").value || null,
    happened_on: $("#n-date").value,
    title: $("#n-title").value.trim() || null,
    summary: $("#n-summary").value.trim(),
    changes: $("#n-changes").value.trim() || null,
    next_steps: $("#n-next").value.trim() || null
  };
  if (!row.summary || !row.happened_on){ err.hidden = false; err.textContent = "Add the date and what was said."; return; }
  const id = state.noteForm.id;
  const query = id
    ? db.from("journal").update({...row, updated_at: new Date().toISOString()}).eq("id", id)
    : db.from("journal").insert(row).select().single();
  const {data, error} = await query;
  if (error){
    err.hidden = false;
    err.textContent = /journal/.test(error.message || "") && /exist|schema cache/.test(error.message || "")
      ? "The journal isn't set up yet. Run supabase/05-journal.sql in Supabase." : "Couldn't save: " + errText(error);
    return;
  }
  state.noteForm = null;
  state.focusNote = id || data?.id || null;
  await loadNotes();
  render();
  if (state.focusNote) setTimeout(() => $("#note-" + state.focusNote)?.scrollIntoView({block: "center"}), 50);
}

export async function removeNote(id){
  state.confirmNote = null;
  state.notes = state.notes.filter(n => n.id !== id);
  render();
  const {error} = await db.from("journal").delete().eq("id", id);
  if (error){ banner("Couldn't delete the entry."); await loadNotes(); render(); }
}
