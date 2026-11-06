/*
 * Logging a dose, meal or snack from the Home screen, and editing the log afterwards.
 *
 * The app only ever records what the person says they took. It never suggests,
 * calculates or adjusts a dose - the number on screen starts from their last entry
 * (or the default in Settings) and they change it themselves.
 */

import {db} from "../client.js";
import {state} from "../state.js";
import {$, banner} from "../util.js";
import {todays, lastOf} from "../selectors.js";
import {render} from "../render.js";
import {loadEntries, scheduleReload} from "../data.js";

/** Begin a log flow. `kind` is "long", "meal" or "snack". */
export async function start(kind, force){
  if (kind === "long" && !force){
    await loadEntries();                // check the freshest log before allowing a second long-acting dose
    if (todays("long").length){ state.step = "already"; return render(); }
  }
  const prev = lastOf(kind);
  const units = kind === "long" ? (prev?.units ?? state.settings.long_units)
             : kind === "meal" ? (prev?.units ?? state.settings.meal_units) : null;
  state.draft = {kind, units: Number(units), food: "", carbs: null, photoPath: null, previewUrl: null};
  state.step = kind === "snack" ? "food" : "dose";
  render();
  window.scrollTo(0, 0);
}

/** Copy the food and carbs fields into the draft before the screen is redrawn. */
export function readFood(){
  const food = $("#food-in"), carbs = $("#carbs-in");
  if (food) state.draft.food = food.value.trim();
  if (carbs) state.draft.carbs = carbs.value === "" ? null : Math.max(0, Math.min(400, Math.round(+carbs.value)));
}

export function changeUnits(delta){
  state.draft.units = Math.max(0, Math.min(100, state.draft.units + delta));
  $("#units").textContent = state.draft.units;
}

export async function save(){
  if (state.saving) return;
  if (state.step === "food") readFood();
  const d = state.draft;
  const row = {kind: d.kind};
  if (d.kind !== "snack") row.units = d.units;
  if (d.kind !== "long"){
    if (d.food) row.food = d.food;
    if (d.carbs != null) row.carbs = d.carbs;
    if (d.photoPath) row.photo_path = d.photoPath;
  }
  state.saving = true; render();
  const {data, error} = await db.from("entries").insert(row).select().single();
  state.saving = false;
  if (error){
    banner("Not saved. Check your signal, then tap Done again.");
    return render();                       // keep the draft so nothing is lost
  }
  banner("");
  if (!state.entries.some(e => e.id === data.id)) state.entries.unshift(data);
  if (d.previewUrl && data.photo_path) state.photoUrls[data.photo_path] = {url: d.previewUrl, exp: Date.now() + 50 * 60000};
  state.last = data;
  state.step = "tick";
  // The Undo button on the tick screen disappears after a minute.
  clearTimeout(state.undoTimer);
  state.undoTimer = setTimeout(() => { state.undoTimer = null; if (state.step === "tick") render(); }, 60000);
  render();
}

export async function undo(){
  const e = state.last;
  clearTimeout(state.undoTimer); state.undoTimer = null;
  state.entries = state.entries.filter(x => x.id !== e.id);
  state.step = "home"; render();
  const {error} = await db.from("entries").delete().eq("id", e.id);
  if (error){ banner("Couldn't undo. Ask the family to remove it from the log."); scheduleReload(); return; }
  if (e.photo_path) db.storage.from("photos").remove([e.photo_path]);
}

/* ---------- Photos ---------- */

export async function onPhoto(file){
  if (!file) return;
  readFood();
  state.draft.uploading = true; render();
  try {
    const blob = await shrink(file);
    const id = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + "-" + Math.random().toString(36).slice(2));
    const path = new Date().getFullYear() + "/" + id + ".jpg";
    const {error} = await db.storage.from("photos").upload(path, blob, {contentType: "image/jpeg", upsert: false});
    if (error) throw error;
    state.draft.photoPath = path;
    state.draft.previewUrl = URL.createObjectURL(blob);
  } catch(e){
    banner("The photo didn't upload. You can still write what you ate.");
  }
  state.draft.uploading = false; render();
}

/** Scale a phone photo down to at most 1200px and re-compress it, so uploads are quick and small. */
function shrink(file){
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1200, scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => resolve(b || file), "image/jpeg", 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ---------- Editing the log (Log screen) ---------- */

export function openCarbsEditor(id){
  state.editCarbs = id; state.confirmDel = null;
  render();
  $("#carbs-" + id)?.focus();
}

export async function saveCarbs(id){
  const value = $("#carbs-" + id).value;
  state.editCarbs = null;
  if (value !== ""){
    const carbs = Math.max(0, Math.min(400, Math.round(+value)));
    const {error} = await db.from("entries").update({carbs}).eq("id", id);
    if (error) banner("Couldn't save carbs.");
    else { const e = state.entries.find(x => x.id === id); if (e) e.carbs = carbs; }
  }
  render();
}

export function askDeleteEntry(id){
  state.confirmDel = id; state.editCarbs = null;
  render();
}

export async function deleteEntry(id){
  const e = state.entries.find(x => x.id === id);
  state.confirmDel = null;
  state.entries = state.entries.filter(x => x.id !== id);
  render();
  const {error} = await db.from("entries").delete().eq("id", id);
  if (error){ banner("Couldn't remove it."); scheduleReload(); }
  else if (e?.photo_path) db.storage.from("photos").remove([e.photo_path]);
}
