/* Small helpers that know nothing about the rest of the app. */

/** document.querySelector, shortened. */
export const $ = selector => document.querySelector(selector);

/** Escape text so it is safe to put inside innerHTML. Use it on anything a person typed. */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

/** localStorage that never throws (private browsing, blocked storage). Pass null to remove a key. */
export const store = {
  get(key){ try { return localStorage.getItem(key); } catch(e){ return null; } },
  set(key, value){ try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch(e){} }
};

/** A readable message from whatever Supabase or the browser threw. */
export const errText = e => (e && (e.message || e.error_description)) || "Unknown error";

/** Show a message in the strip at the top of the page. Call with no message to hide it. */
export function banner(msg){
  const b = $("#banner");
  b.hidden = !msg;
  b.textContent = msg || "";
}

/* ---------- Time ---------- */

export const DAY_MS = 864e5;

/** "2026-11-06" in the person's local time. Used to group entries by day. */
export const dayKey = t => {
  const d = new Date(t);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

/** "7:30am" */
export const timeOfDay = t => new Date(t).toLocaleTimeString("en-GB", {hour: "numeric", minute: "2-digit", hour12: true}).replace(/\s/g, "");

/** "just now", "12 min ago", "3 hrs ago", "2 days ago" */
export const timeAgo = t => {
  const m = Math.round((Date.now() - new Date(t)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60);
  return h < 24 ? h + (h === 1 ? " hr" : " hrs") + " ago" : Math.floor(h / 24) + (h < 48 ? " day" : " days") + " ago";
};

export const today = () => dayKey(Date.now());
