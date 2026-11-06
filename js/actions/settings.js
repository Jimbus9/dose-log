/* Saving settings and managing the family list (admins only; the database enforces that too). */

import {db} from "../client.js";
import {state} from "../state.js";
import {$, banner, errText} from "../util.js";
import {render} from "../render.js";
import {loadMembers} from "../data.js";

export async function saveSettings(){
  const units = id => Math.max(0, Math.min(100, Math.round(+$(id).value || 0)));
  const s = {
    name: $("#set-name").value.trim(),
    long_units: units("#set-long"), meal_units: units("#set-meal"),
    long_by: $("#set-by").value || "10:00"
  };
  // These blocks are only on the page if the matching SQL file has been run.
  if ($("#set-logger-sees")) s.dad_sees_records = $("#set-logger-sees").checked;
  if ($("#set-rem-on")){
    const breakfast = $("#set-rem-b").value, lunch = $("#set-rem-l").value, evening = $("#set-rem-e").value;
    if (!(breakfast < lunch && lunch < evening)){ $("#set-msg").textContent = "Reminder times must go breakfast, then lunch, then evening meal."; return; }
    Object.assign(s, {
      reminders_on: $("#set-rem-on").checked,
      remind_breakfast: breakfast, remind_lunch: lunch, remind_evening: evening,
      remind_long: $("#set-rem-long").value || "20:00"
    });
  }
  const msg = $("#set-msg");
  const {error} = await db.from("settings").update(s).eq("id", 1);
  if (error){ msg.textContent = "Couldn't save: " + errText(error); return; }
  state.settings = {...state.settings, ...s};
  msg.textContent = "Saved.";
}

export async function addMember(){
  const email = $("#m-email").value.trim().toLowerCase();
  const name = $("#m-name").value.trim();
  const role = $("#m-role").value;
  const msg = $("#m-msg");
  if (!email) return;
  const {error} = await db.from("members").insert({email, name, role});
  if (error){ msg.textContent = /duplicate/i.test(error.message) ? "That email is already on the list." : "Couldn't add: " + errText(error); return; }
  await loadMembers();
  render();
  $("#m-msg").textContent = `Added. Send them the link to this page. They sign in with ${email}.`;
}

export async function changeRole(email, role){
  const {data, error} = await db.from("members").update({role}).eq("email", email).select();
  if (error || !data?.length) banner(error ? "Couldn't change the role: " + errText(error) : "Couldn't change the role. Only an admin can do that.");
  else banner("");
  await loadMembers();
  render();
}

export async function removeMember(email){
  state.confirmMember = null;
  const {error} = await db.from("members").delete().eq("email", email);
  if (error) banner("Couldn't remove: " + errText(error));
  await loadMembers();
  render();
}
