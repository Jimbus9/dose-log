/*
 * Light / Dark / Auto display, chosen per device (so a phone and a tablet can differ).
 * Saved in this browser only. "Auto" follows the phone's own setting.
 * The choice is applied by a small script in index.html before the page draws.
 */

import {store} from "./util.js";

const KEY = "doselog.theme";

function apply(choice){
  const root = document.documentElement;
  if (choice === "light" || choice === "dark") root.dataset.theme = choice;
  else delete root.dataset.theme;
  for (const b of document.querySelectorAll("[data-theme-set]")){
    b.setAttribute("aria-pressed", String(b.dataset.themeSet === (choice || "auto")));
  }
}

export function initTheme(){
  apply(store.get(KEY) || "auto");
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-theme-set]");
    if (!b) return;
    const choice = b.dataset.themeSet;
    store.set(KEY, choice === "auto" ? null : choice);
    apply(choice);
  });
}
