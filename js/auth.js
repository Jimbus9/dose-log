/*
 * Sign-in. People type their email, get a code by email, and type it in. There are no
 * passwords. Signing in alone grants nothing: the email also has to be on the family
 * list (the members table), which the database checks on every request.
 */

import {db} from "./client.js";
import {state} from "./state.js";
import {$, esc, store, errText, banner} from "./util.js";
import {isLogger} from "./selectors.js";
import {render, route, viewFromHash} from "./render.js";
import {loadEntries, loadSettings, loadMembers, loadAppts, loadGlucose, loadNotes, subscribe} from "./data.js";

function showAuthError(msg){
  const e = $("#auth-err");
  if (e){ e.hidden = !msg; e.textContent = msg || ""; }
}

export async function sendCode(email){
  const btn = $("#email-btn");
  if (btn){ btn.disabled = true; btn.textContent = "Sending…"; }
  const {error} = await db.auth.signInWithOtp({email, options: {shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname}});
  if (error){
    if (btn){ btn.disabled = false; btn.textContent = "Email me a code"; }
    const rateLimited = error.status === 429 || /rate|security purposes/i.test(error.message || "");
    // Supabase reports the sign-up block (supabase/10-block-signups.sql) as a generic database error
    const notListed = /database error saving new user|not on the family list/i.test(error.message || "");
    showAuthError(rateLimited ? "Too many emails sent for now. Wait a while, then try again."
      : notListed ? "That email isn't on the family list. Ask the person who runs Dose Log to add it, then try again."
      : "Couldn't send the email: " + errText(error));
    return false;
  }
  store.set("doselog.pendingEmail", email);
  state.auth = "code";
  render();
  $("#code-in")?.focus();
  return true;
}

export async function verifyCode(){
  const email = store.get("doselog.pendingEmail");
  const token = ($("#code-in").value || "").replace(/\D/g, "");
  if (!token) return showAuthError("Type the code from the email.");
  const btn = $("#code-btn");
  btn.disabled = true; btn.textContent = "Checking…";
  const {data, error} = await db.auth.verifyOtp({email, token, type: "email"});
  if (error){
    btn.disabled = false; btn.textContent = "Sign in";
    return showAuthError(/expired|invalid/i.test(error.message || "") ? "That code didn't work. Check it, or send a new one." : errText(error));
  }
  store.set("doselog.pendingEmail", null);
  await afterLogin(data.session);
}

/** Signed in: check the family list, load everything, and show the right first screen. */
async function afterLogin(session){
  if (!session || state.session?.user?.id === session.user.id) return;
  state.session = session;
  const email = (session.user.email || "").toLowerCase();
  const {data: me, error} = await db.from("members").select("*").eq("email", email).maybeSingle();
  if (error){ $("#view").innerHTML = `<div class="empty">Couldn't reach the database: ${esc(errText(error))}. Reload to try again.</div>`; return; }
  if (!me){
    $("#view").innerHTML = `<div class="screen"><div class="alert"><h2>Not on the family list</h2>
        <p>You're signed in as <b>${esc(email)}</b>, but this email hasn't been added yet.</p>
        <p>Ask whoever set up Dose Log to add it in Settings, then reload this page.</p></div>
        <button class="secondary" data-act="signout">Sign out</button></div>`;
    return;
  }
  state.me = me;

  // The dose-logging phone starts on the big buttons; everyone else starts on the log.
  if (!viewFromHash()) state.view = isLogger() ? "home" : "log";
  await Promise.all([loadEntries(), loadSettings(), loadMembers(), loadAppts(), loadGlucose(), loadNotes()]);
  state.loaded = true;
  subscribe();
  route();
}

export async function signOut(){
  if (state.channel){ db.removeChannel(state.channel); state.channel = null; }
  await db.auth.signOut();
  state.me = null; state.session = null; state.entries = []; state.loaded = false; state.auth = "email";
  $("#tabs").hidden = true;
  banner("");
  render();
}

/** Pick up an existing session (or a sign-in link) when the page opens. */
export function startAuth(){
  if (store.get("doselog.pendingEmail")) state.auth = "code";
  db.auth.onAuthStateChange((event, session) => {
    // Deferred on purpose: calling Supabase inside this callback can deadlock the auth client.
    if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) setTimeout(() => afterLogin(session), 0);
  });
  db.auth.getSession().then(({data}) => { if (data.session) afterLogin(data.session); else render(); });
}
