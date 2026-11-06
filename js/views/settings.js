/* The Settings screen: pre-filled doses, reminder times, and the family list. Admins only. */

import {state, ROLE, ROLE_LABEL} from "../state.js";
import {esc} from "../util.js";
import {isAdmin} from "../selectors.js";

export function settingsView(){
  const s = state.settings;
  const signOutBlock = `<div class="section">
        <p class="hint">Signed in as ${esc(state.me.email)} · ${ROLE_LABEL[state.me.role] || state.me.role}</p>
        <button class="secondary" data-act="signout">Sign out</button>
      </div>`;

  if (!isAdmin()){
    const admins = state.members.filter(m => m.role === ROLE.ADMIN).map(m => esc(m.name || m.email.split("@")[0])).join(", ");
    return `<div class="screen"><h1>Settings</h1>
        <p class="hint">Only an admin${admins ? " (" + admins + ")" : ""} can change settings or the family list.</p>
        ${signOutBlock}</div>`;
  }

  const roleOptions = selected => [ROLE.FAMILY, ROLE.LOGGER, ROLE.ADMIN].map(r => `<option value="${r}"${r === selected ? " selected" : ""}>${ROLE_LABEL[r]}</option>`).join("");
  const people = state.members.map(m => {
    const isSelf = m.email === state.me.email;
    const confirming = state.confirmMember === m.email;
    return `<li><span class="who"><b>${esc(m.name || m.email.split("@")[0])}${isSelf ? " (you)" : ""}</b>${esc(m.email)}${isSelf ? " · " + ROLE_LABEL[m.role] : ""}</span>
        ${isSelf ? "" : confirming
          ? `<span><button class="link danger" data-rmmember="${esc(m.email)}">Remove</button> <button class="link" data-act="cancel-member">Keep</button></span>`
          : `<span class="member-acts"><select class="role-sel" data-rolefor="${esc(m.email)}" aria-label="Role for ${esc(m.name || m.email)}">${roleOptions(m.role)}</select>
             <button class="link" data-askmember="${esc(m.email)}">Remove</button></span>`}</li>`;
  }).join("");

  // Some settings only exist once the matching SQL file has been run, so each block checks for its column.
  return `<div class="screen"><h1>Settings</h1>
      <p class="hint">These only pre-fill the number on the Home screen. It can always be changed before saving.</p>
      <div class="field"><label for="set-name">Name shown on the Home screen</label><input class="input" id="set-name" type="text" maxlength="40" value="${esc(s.name)}"></div>
      <div class="row2">
        <div class="field"><label for="set-long">Long-acting (units)</label><input class="input" id="set-long" type="number" inputmode="numeric" min="0" max="100" value="${s.long_units}"></div>
        <div class="field"><label for="set-meal">Meal dose (units)</label><input class="input" id="set-meal" type="number" inputmode="numeric" min="0" max="100" value="${s.meal_units}"></div>
      </div>
      <div class="field"><label for="set-by">Flag long-acting as missing after</label><input class="input" id="set-by" type="time" value="${esc(s.long_by)}"></div>
      ${"dad_sees_records" in s ? `<div class="section">
        <h2>Home-screen phone</h2>
        <label class="check"><input type="checkbox" id="set-logger-sees"${s.dad_sees_records ? " checked" : ""}> Can look back at the log, calendar and journal</label>
        <p class="hint">Read-only. Turn off to show only the big buttons.</p>
      </div>` : ""}
      ${"remind_breakfast" in s ? `<div class="section">
        <h2>Reminders</h2>
        <p class="hint">Sent only to phones on the family list as "Logs doses", and only if nothing has been logged yet. Turn them on from the Home screen on that phone.</p>
        <label class="check"><input type="checkbox" id="set-rem-on"${s.reminders_on ? " checked" : ""}> Send reminders</label>
        <div class="row2">
          <div class="field"><label for="set-rem-b">Breakfast</label><input class="input" id="set-rem-b" type="time" value="${esc(s.remind_breakfast)}"></div>
          <div class="field"><label for="set-rem-l">Lunch</label><input class="input" id="set-rem-l" type="time" value="${esc(s.remind_lunch)}"></div>
          <div class="field"><label for="set-rem-e">Evening meal</label><input class="input" id="set-rem-e" type="time" value="${esc(s.remind_evening)}"></div>
          <div class="field"><label for="set-rem-long">Long-acting</label><input class="input" id="set-rem-long" type="time" value="${esc(s.remind_long)}"></div>
        </div>
      </div>` : ""}
      <button class="primary dark" data-act="save-settings">Save settings</button>
      <p class="hint" id="set-msg"></p>

      <div class="section">
        <h2>Family list</h2>
        <p class="hint">Only these people can sign in and see the log.</p>
        <ul class="people">${people}</ul>
        <form class="stack" id="member-form">
          <div class="field"><label for="m-name">Name</label><input class="input" id="m-name" type="text" maxlength="40" placeholder="e.g. Sam"></div>
          <div class="field"><label for="m-email">Email</label><input class="input" id="m-email" type="email" inputmode="email" required></div>
          <div class="field"><label for="m-role">Role</label>
            <select class="input" id="m-role">${roleOptions(ROLE.FAMILY)}</select></div>
          <p class="hint">Family: log, calendar and journal. Logs doses: the big buttons and reminders. Admin: everything, including settings and this list.</p>
          <button class="secondary" type="submit">Add to family list</button>
          <p class="hint" id="m-msg"></p>
        </form>
      </div>
      ${signOutBlock}
    </div>`;
}
