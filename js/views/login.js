/* Sign-in screens: "enter your email", then "type the code we emailed you". */

import {state} from "../state.js";
import {esc, store} from "../util.js";

export function loginView(){
  const email = store.get("doselog.pendingEmail") || "";
  if (state.auth === "code" && email){
    return `<form class="screen" id="code-form">
        <div><h1>Check your email</h1><p class="date">We sent a code to <b>${esc(email)}</b>.</p></div>
        <div class="field"><label for="code-in">Type the code here</label>
          <input class="input code" id="code-in" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" required></div>
        <p class="err" id="auth-err" hidden></p>
        <button class="primary dark" id="code-btn" type="submit">Sign in</button>
        <button class="link" type="button" data-act="resend">Send a new code</button>
        <button class="link" type="button" data-act="other-email">Use a different email</button>
      </form>`;
  }
  return `<form class="screen" id="email-form">
      <div><h1>Dose Log</h1><p class="date">Sign in once on this phone and it stays signed in.</p></div>
      <div class="field"><label for="email-in">Your email</label>
        <input class="input" id="email-in" type="email" autocomplete="email" inputmode="email" value="${esc(email)}" required></div>
      <p class="err" id="auth-err" hidden></p>
      <button class="primary dark" id="email-btn" type="submit">Email me a code</button>
    </form>`;
}
