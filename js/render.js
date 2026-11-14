/* Decides which screen to draw, and draws it. The screens themselves live in views/. */

import {$} from "./util.js";
import {state} from "./state.js";
import {isLogger, loggerSeesRecords} from "./selectors.js";
import {loginView} from "./views/login.js";
import {homeView, appointmentsListView, alreadyTakenView, doseView, foodView, tickView} from "./views/home.js";
import {logView} from "./views/log.js";
import {calendarView} from "./views/calendar.js";
import {journalView} from "./views/journal.js";
import {settingsView} from "./views/settings.js";
import {historyView} from "./views/history.js";
import {openHistory} from "./actions/history.js";

const VIEWS = ["home", "log", "calendar", "journal", "settings"];

/**
 * Page address -> screen. "#dad" and "#family" are the original names of the Home and
 * Log screens; they stay valid so old bookmarks and notification links keep working.
 */
const VIEW_FROM_HASH = new Map([
  ["home", "home"], ["log", "log"], ["calendar", "calendar"], ["journal", "journal"], ["settings", "settings"],
  ["history", "history"],
  ["dad", "home"], ["family", "log"]
]);
export const viewFromHash = () => VIEW_FROM_HASH.get((location.hash || "").slice(1));

/** The Home screen has its own little flow; state.step says where we are in it. */
const HOME_STEPS = {home: homeView, already: alreadyTakenView, dose: doseView, food: foodView, tick: tickView, appts: appointmentsListView};

/** The page address changed (a tab was tapped, or a link was opened). */
export function route(){
  const view = viewFromHash();
  if (view) state.view = view;
  if (state.view !== "home") state.step = "home";
  if (state.view === "history" && state.me && !state.hist.day) openHistory();   // opened from a bookmark
  render();
  window.scrollTo(0, 0);
}

export function render(){
  let html;
  $("#tabs").hidden = !state.me || (isLogger() && !loggerSeesRecords());
  // The Home-screen phone doesn't get Settings or the Calendar, and doesn't see the
  // glucose graph (it already has the Libre app; two graphs were confusing).
  $("#tab-settings").hidden = isLogger();
  $("#tab-calendar").hidden = isLogger();
  for (const v of VIEWS){
    const tab = $("#tab-" + v);
    const current = state.view === "history" ? "log" : state.view;    // history is part of the Log
    if (v === current) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  }

  if (!state.me) html = loginView();
  else if (isLogger() && state.view !== "home" && (!loggerSeesRecords() || ["settings", "calendar", "history"].includes(state.view))){
    // This phone isn't allowed that screen: back to the big buttons.
    state.view = "home";
    if (location.hash && location.hash !== "#home") history.replaceState(null, "", "#home");
    html = homeView();
  }
  else if (state.view === "log") html = logView();
  else if (state.view === "history") html = historyView();
  else if (state.view === "settings") html = settingsView();
  else if (state.view === "journal") html = journalView();
  else if (state.view === "calendar") html = calendarView();
  else html = HOME_STEPS[state.step]();
  $("#view").innerHTML = html;
}

/**
 * Redraw after data changed elsewhere (realtime update, timer) - but only when it
 * won't wipe out something the person is half-way through typing or confirming.
 */
export function softRender(){
  if (!state.me) return;
  if (state.view === "log" && !state.editCarbs && !state.confirmDel) return render();
  if (state.view === "home" && (state.step === "home" || state.step === "appts")) return render();
  if (state.view === "calendar" && !state.apptForm && !state.confirmAppt) return render();
  if (state.view === "journal" && !state.noteForm && !state.confirmNote) return render();
  if (state.view === "history") return render();
}
