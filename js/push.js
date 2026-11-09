/*
 * Optional reminder notifications for the dose-logging phone.
 * The phone subscribes here; the `reminders` Edge Function (supabase/functions/reminders)
 * sends the notifications, and sw.js shows them.
 */

import {db, CFG} from "./client.js";
import {state} from "./state.js";
import {banner, errText} from "./util.js";
import {render, softRender} from "./render.js";

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!CFG.vapidPublicKey;

let registration = null;

/** Register the service worker and work out whether reminders are on, off, blocked or unsupported. */
export function initPush(){
  state.push = pushSupported() ? "checking" : "unsupported";
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then(async reg => {
    registration = reg;
    if (!pushSupported()) return;
    const sub = await reg.pushManager.getSubscription();
    state.push = Notification.permission === "denied" ? "denied" : sub ? "on" : "off";
    softRender();
  }).catch(() => { state.push = "unsupported"; softRender(); });
}

/** The VAPID public key arrives as URL-safe base64; the browser wants raw bytes. */
function urlBase64ToBytes(b64){
  const pad = "=".repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/** Turn on notifications for this phone. `purpose` only changes the confirmation message. */
export async function enablePush(purpose = "reminders"){
  state.push = "busy"; render();
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted"){ state.push = permission === "denied" ? "denied" : "off"; return render(); }
    const reg = registration || await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ||
      await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(CFG.vapidPublicKey)});
    const j = sub.toJSON();
    const {error} = await db.from("push_subscriptions").upsert({endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth});
    if (error) throw error;
    state.push = "on"; render();
    const msg = purpose === "alerts"
      ? ["Dose alerts are on", "You'll get a notification here when a new dose is logged."]
      : ["Reminders are on", "You'll get a nudge here if a meal or dose hasn't been logged."];
    reg.showNotification(msg[0], {body: msg[1], icon: "icons/icon-192.png", tag: "dose-log-test"});
  } catch(e){
    state.push = "off"; render();
    banner("Couldn't turn on notifications: " + errText(e));
  }
}
