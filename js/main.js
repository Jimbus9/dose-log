/*
 * Dose Log: start-up. No build step - the browser loads these files as ES modules.
 *
 *   client.js     Supabase client, from config.js
 *   state.js      constants and the shared state object
 *   selectors.js  read-only questions about the state
 *   render.js     picks and draws the current screen (views/ holds the screens)
 *   data.js       loads data from Supabase, realtime updates
 *   auth.js       email-code sign-in
 *   actions/      everything that changes data (log, appointments, journal, settings)
 *   events.js     click / submit / change handling
 *   push.js       optional reminder notifications
 */

import {$} from "./util.js";
import {isConfigured, libraryLoaded} from "./client.js";
import {startBackgroundRefresh} from "./data.js";
import {initEvents} from "./events.js";
import {initPush} from "./push.js";
import {startAuth} from "./auth.js";

if (!isConfigured() || !libraryLoaded()){
  $("#view").innerHTML = `<div class="empty">${!libraryLoaded()
    ? "Couldn't load. Check your internet connection and reload."
    : "Dose Log isn't connected to its database yet. Add the project URL and key to config.js."}</div>`;
} else {
  startBackgroundRefresh();
  initEvents();
  initPush();
  startAuth();
}
