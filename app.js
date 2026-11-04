/* Dose Log app. Plain JS, no build step. */
(() => {
  "use strict";

  const CFG = window.DOSE_LOG_CONFIG || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  const KINDS = {
    long:  {short: "Long-acting", color: "var(--long)"},
    meal:  {short: "Meal",        color: "var(--meal)"},
    snack: {short: "Snack",       color: "var(--snack)"}
  };
  const DEFAULTS = {name: "Dad", long_units: 20, meal_units: 6, long_by: "10:00"};
  const HISTORY_DAYS = 14;

  const S = {
    view: "dad", step: "home", auth: "email",
    session: null, me: null, members: [], entries: [], settings: {...DEFAULTS},
    loaded: false, draft: null, last: null, undoTimer: null, saving: false,
    editCarbs: null, confirmDel: null, confirmMember: null, photoUrls: {}, channel: null,
    appts: [], calMonth: null, calDay: null, apptForm: null, confirmAppt: null
  };

  const store = {
    get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
    set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} }
  };

  /* ---------- Time ---------- */
  const dayKey = t => { const d = new Date(t); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const tm = t => new Date(t).toLocaleTimeString("en-GB", {hour: "numeric", minute: "2-digit", hour12: true}).replace(/\s/g, "");
  const ago = t => {
    const m = Math.round((Date.now() - new Date(t)) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    const h = Math.floor(m / 60);
    return h < 24 ? h + (h === 1 ? " hr" : " hrs") + " ago" : Math.floor(h / 24) + (h < 48 ? " day" : " days") + " ago";
  };
  const today = () => dayKey(Date.now());
  const todays = k => S.entries.filter(e => dayKey(e.at) === today() && (!k || e.kind === k));
  const lastOf = k => S.entries.find(e => e.kind === k);
  const isDad = () => S.me?.role === "dad";

  function banner(msg){ const b = $("#banner"); b.hidden = !msg; b.textContent = msg || ""; }
  function errText(e){ return (e && (e.message || e.error_description)) || "Unknown error"; }

  /* ---------- Not configured ---------- */
  const configured = CFG.supabaseUrl && !/^PASTE/.test(CFG.supabaseUrl) && CFG.supabaseKey && !/^PASTE/.test(CFG.supabaseKey);
  if (!configured || !window.supabase){
    $("#view").innerHTML = `<div class="empty">${!window.supabase
      ? "Couldn't load. Check your internet connection and reload."
      : "Dose Log isn't connected to its database yet. Add the project URL and key to config.js."}</div>`;
    return;
  }
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
  });

  /* ---------- Routing ---------- */
  function route(){
    const h = (location.hash || "").slice(1);
    if (["dad", "family", "calendar", "settings"].includes(h)) S.view = h;
    if (S.view !== "dad") S.step = "home";
    for (const v of ["dad", "family", "calendar", "settings"]){
      const el = $("#tab-" + v);
      if (v === S.view) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    }
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------- Sign in ---------- */
  function loginView(){
    const email = store.get("doselog.pendingEmail") || "";
    if (S.auth === "code" && email){
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
  function authErr(msg){ const e = $("#auth-err"); if (e){ e.hidden = !msg; e.textContent = msg || ""; } }
  async function sendCode(email){
    const btn = $("#email-btn"); if (btn){ btn.disabled = true; btn.textContent = "Sending…"; }
    const {error} = await sb.auth.signInWithOtp({email, options: {shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname}});
    if (error){
      if (btn){ btn.disabled = false; btn.textContent = "Email me a code"; }
      const rate = error.status === 429 || /rate|security purposes/i.test(error.message || "");
      authErr(rate ? "Too many emails sent for now. Wait a while, then try again." : "Couldn't send the email: " + errText(error));
      return false;
    }
    store.set("doselog.pendingEmail", email);
    S.auth = "code"; render(); $("#code-in")?.focus();
    return true;
  }
  async function verifyCode(){
    const email = store.get("doselog.pendingEmail");
    const token = ($("#code-in").value || "").replace(/\D/g, "");
    if (!token) return authErr("Type the code from the email.");
    const btn = $("#code-btn"); btn.disabled = true; btn.textContent = "Checking…";
    const {data, error} = await sb.auth.verifyOtp({email, token, type: "email"});
    if (error){
      btn.disabled = false; btn.textContent = "Sign in";
      return authErr(/expired|invalid/i.test(error.message || "") ? "That code didn't work. Check it, or send a new one." : errText(error));
    }
    store.set("doselog.pendingEmail", null);
    await afterLogin(data.session);
  }

  /* ---------- After sign in ---------- */
  async function afterLogin(session){
    if (!session || S.session?.user?.id === session.user.id) return;
    S.session = session;
    const email = (session.user.email || "").toLowerCase();
    const {data: me, error} = await sb.from("members").select("*").eq("email", email).maybeSingle();
    if (error){ $("#view").innerHTML = `<div class="empty">Couldn't reach the database: ${esc(errText(error))}. Reload to try again.</div>`; return; }
    if (!me){
      $("#view").innerHTML = `<div class="screen"><div class="alert"><h2>Not on the family list</h2>
        <p>You're signed in as <b>${esc(email)}</b>, but this email hasn't been added yet.</p>
        <p>Ask whoever set up Dose Log to add it in Settings, then reload this page.</p></div>
        <button class="secondary" data-act="signout">Sign out</button></div>`;
      return;
    }
    S.me = me;
    $("#tabs").hidden = isDad();
    if (!["dad", "family", "calendar", "settings"].includes((location.hash || "").slice(1))) S.view = isDad() ? "dad" : "family";
    await Promise.all([loadEntries(), loadSettings(), loadMembers(), loadAppts()]);
    S.loaded = true;
    subscribe();
    route();
  }

  async function loadEntries(){
    const since = new Date(Date.now() - HISTORY_DAYS * 864e5).toISOString();
    const {data, error} = await sb.from("entries").select("*").gte("at", since).order("at", {ascending: false}).limit(500);
    if (error){ banner("Couldn't load the log. Check your signal."); return false; }
    S.entries = data; banner("");
    refreshPhotoUrls();
    return true;
  }
  async function loadSettings(){
    const {data} = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
    if (data) S.settings = {...DEFAULTS, ...data, long_by: String(data.long_by || DEFAULTS.long_by).slice(0, 5)};
  }
  async function loadMembers(){
    const {data} = await sb.from("members").select("*").order("added_at");
    if (data) S.members = data;
  }
  async function loadAppts(){
    const since = new Date(Date.now() - 120 * 864e5).toISOString();
    const {data, error} = await sb.from("appointments").select("*").gte("starts_at", since).order("starts_at").limit(500);
    if (!error && data) S.appts = data.slice().sort((x, y) => new Date(x.starts_at) - new Date(y.starts_at));
  }
  async function refreshPhotoUrls(){
    const now = Date.now();
    const need = S.entries.map(e => e.photo_path).filter(p => p && !(S.photoUrls[p] && S.photoUrls[p].exp > now));
    if (!need.length) return;
    const {data} = await sb.storage.from("photos").createSignedUrls(need, 3600);
    if (!data) return;
    for (const r of data) if (r.signedUrl) S.photoUrls[r.path] = {url: r.signedUrl, exp: now + 50 * 60000};
    softRender();
  }

  let reloadT = null;
  function scheduleReload(){
    clearTimeout(reloadT);
    reloadT = setTimeout(async () => { await loadEntries(); softRender(); }, 300);
  }
  function subscribe(){
    if (S.channel) return;
    S.channel = sb.channel("dose-log")
      .on("postgres_changes", {event: "*", schema: "public", table: "entries"}, scheduleReload)
      .on("postgres_changes", {event: "*", schema: "public", table: "settings"}, async () => { await loadSettings(); softRender(); })
      .on("postgres_changes", {event: "*", schema: "public", table: "appointments"}, async () => { await loadAppts(); softRender(); })
      .subscribe();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.me) scheduleReload(); });
  // Keep "2 hrs ago" and the missing-dose flag current.
  setInterval(() => { if (S.view === "family") softRender(); }, 60000);

  // Re-render only when it won't interrupt someone mid-task.
  function softRender(){
    if (!S.me) return;
    if (S.view === "family" && !S.editCarbs && !S.confirmDel) return render();
    if (S.view === "dad" && (S.step === "home" || S.step === "appts")) return render();
    if (S.view === "calendar" && !S.apptForm && !S.confirmAppt) return render();
  }

  /* ---------- Dad ---------- */
  function dadHome(){
    const lt = todays("long")[0];
    const d = new Date().toLocaleDateString("en-GB", {weekday: "long", day: "numeric", month: "long"});
    return `<div class="screen">
      <div><h1>Hello ${esc(S.settings.name)}</h1><p class="date">${d}</p></div>
      <div class="stack">
        <button class="big ${lt ? "done" : ""}" style="--c:${KINDS.long.color}" data-go="long">
          <strong>Long-acting insulin</strong>
          <span>${lt ? "✓ Taken today, " + tm(lt.at) + " · " + lt.units + " units" : "Not taken yet today"}</span>
        </button>
        <button class="big" style="--c:${KINDS.meal.color}" data-go="meal">
          <strong>Meal + insulin</strong><span>Log your dose and what you ate</span>
        </button>
        <button class="big" style="--c:${KINDS.snack.color}" data-go="snack">
          <strong>Snack</strong><span>No insulin, just what you ate</span>
        </button>
      </div>
      ${nextApptCard()}
      ${isDad() ? `<a class="link" href="#family" style="align-self:center">See today's log</a>` : ""}
    </div>`;
  }
  function nextApptCard(){
    const up = upcoming();
    if (!up.length) return "";
    const a = up[0];
    return `<section class="appt-next">
      <span class="lab">Next appointment</span>
      <strong>${esc(a.title)}</strong>
      <span>${apptWhen(a)}</span>
      ${a.place ? `<span class="muted">${esc(a.place)}</span>` : ""}
      ${up.length > 1 ? `<button class="secondary" data-act="dad-appts">See all ${up.length} appointments</button>` : ""}
    </section>`;
  }
  function dadAppts(){
    const up = upcoming();
    return `<div class="screen">
      <button class="back" data-act="home">← Back</button>
      <p class="q">Your appointments</p>
      ${up.length ? `<div class="stack">${up.map(a => `<div class="appt-card">
          <span class="when">${apptWhen(a)}</span>
          <strong>${esc(a.title)}</strong>
          ${a.place ? `<span class="muted">${esc(a.place)}</span>` : ""}
          ${a.notes ? `<span class="muted">${esc(a.notes)}</span>` : ""}
        </div>`).join("")}</div>` : `<div class="empty">No appointments coming up.</div>`}
    </div>`;
  }
  function dadAlreadyLong(){
    const lt = todays("long")[0];
    return `<div class="screen">
      <div class="alert" role="alert">
        <h2>Already taken today</h2>
        <p>Your long-acting insulin was logged at <b>${tm(lt.at)}</b> (${lt.units} units).</p>
        <p>Taking it twice can be dangerous. If you're not sure, call the diabetes team.</p>
      </div>
      <button class="primary dark" data-act="home">Go back</button>
      <button class="secondary" data-act="force-long">I'm sure, log another dose</button>
    </div>`;
  }
  function dadDose(){
    const k = KINDS[S.draft.kind];
    const meal = S.draft.kind === "meal";
    return `<div class="screen">
      <button class="back" data-act="home">← Back</button>
      <p class="q">${meal ? "How many units with this meal?" : "How many units of long-acting?"}</p>
      <div class="stepper">
        <button aria-label="One unit less" data-act="minus">−</button>
        <div class="units"><b id="units">${S.draft.units}</b><small>units</small></div>
        <button aria-label="One unit more" data-act="plus">+</button>
      </div>
      <button class="primary" style="--c:${k.color}" data-act="${meal ? "to-food" : "save"}" ${S.saving ? "disabled" : ""}>${meal ? "Next" : (S.saving ? "Saving…" : "Done")}</button>
    </div>`;
  }
  function dadFood(){
    const k = KINDS[S.draft.kind];
    const d = S.draft;
    return `<div class="screen">
      <button class="back" data-act="${d.kind === "meal" ? "to-dose" : "home"}">← Back</button>
      <p class="q">What did you eat?</p>
      ${d.previewUrl
        ? `<img class="photo-prev" src="${esc(d.previewUrl)}" alt="Photo of the food"><button class="secondary" data-act="photo">Take a different photo</button>`
        : `<label class="photo-btn" for="photo-in">📷 Take a photo</label>`}
      <input id="photo-in" type="file" accept="image/*" capture="environment" hidden>
      <div class="field"><label for="food-in">Or write a few words</label>
        <input class="input" id="food-in" type="text" maxlength="300" placeholder="e.g. Toast and beans" value="${esc(d.food || "")}"></div>
      <div class="field"><label for="carbs-in">Carbs in grams (if you know)</label>
        <input class="input" id="carbs-in" type="number" inputmode="numeric" min="0" max="400" placeholder="Leave blank if not sure" value="${d.carbs ?? ""}"></div>
      <button class="primary" style="--c:${k.color}" data-act="save" ${S.saving || d.uploading ? "disabled" : ""}>${d.uploading ? "Adding photo…" : S.saving ? "Saving…" : "Done"}</button>
    </div>`;
  }
  function dadTick(){
    const e = S.last;
    const what = e.kind === "snack" ? "Snack logged" : e.units + " units logged";
    return `<div class="screen">
      <div class="tick">
        <div class="circle"><svg viewBox="0 0 24 24" fill="none" stroke="var(--on)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h2>${what}</h2><p>${KINDS[e.kind].short} · ${tm(e.at)}</p>
      </div>
      <button class="primary dark" data-act="home">Back to start</button>
      ${S.undoTimer ? `<button class="secondary" data-act="undo">Undo, I tapped by mistake</button>` : ""}
    </div>`;
  }

  /* ---------- Family ---------- */
  function memberName(email){
    if (!email) return "";
    const m = S.members.find(x => x.email === email);
    return (m && m.name) || email.split("@")[0];
  }
  function family(){
    if (!S.loaded) return `<div class="empty">Loading the log…</div>`;
    const lt = todays("long")[0];
    const [hh, mm] = (S.settings.long_by || "10:00").split(":").map(Number);
    const due = new Date(); due.setHours(hh, mm, 0, 0);
    const overdue = !lt && Date.now() > due.getTime();
    const lm = lastOf("meal");
    let html = `<div class="screen">
      ${isDad() ? `<a class="back" href="#dad">← Back to the buttons</a>` : ""}
      <h1>${esc(S.settings.name)} today</h1>
      <div class="status">
        ${overdue ? `<div class="flag">No long-acting dose logged yet. Usually taken by ${tm(due)}.</div>` : ""}
        <div class="stat"><span class="lab">Long-acting</span>
          ${lt ? `<span class="val">${lt.units} units</span><span class="pill ok">✓ ${tm(lt.at)}</span>`
               : `<span class="val">—</span><span class="pill ${overdue ? "bad" : ""}">Not yet</span>`}
        </div>
        <div class="stat"><span class="lab">Last meal dose</span>
          ${lm ? `<span class="val">${lm.units} units</span><span class="sub">${ago(lm.at)}</span>` : `<span class="val">—</span><span class="sub">None logged</span>`}
        </div>
        <div class="stat"><span class="lab">Meals today</span><span class="val">${todays("meal").length}</span></div>
        <div class="stat"><span class="lab">Snacks today</span><span class="val">${todays("snack").length}</span></div>
      </div>`;
    if (!S.entries.length){
      return html + `<div class="empty">Nothing logged yet. Every tap on the Dad screen shows up here straight away, with times, units and food photos.</div></div>`;
    }
    const groups = {};
    for (const e of S.entries) (groups[dayKey(e.at)] ||= []).push(e);
    const yest = dayKey(Date.now() - 864e5);
    for (const [day, list] of Object.entries(groups)){
      const label = day === today() ? "Today" : day === yest ? "Yesterday"
        : new Date(day + "T12:00").toLocaleDateString("en-GB", {weekday: "long", day: "numeric", month: "short"});
      html += `<section class="day"><h3>${label}</h3><div class="entries">${list.map(entryRow).join("")}</div></section>`;
    }
    return html + `</div>`;
  }
  function entryRow(e){
    const k = KINDS[e.kind];
    const dose = e.kind === "snack" ? "" : ` · <em>${e.units} units</em>`;
    const food = [e.food, e.carbs != null ? e.carbs + "g carbs" : null].filter(Boolean).map(esc).join(" · ");
    const photo = e.photo_path && S.photoUrls[e.photo_path];
    const img = e.photo_path ? (photo ? `<img src="${esc(photo.url)}" alt="Food photo" loading="lazy">` : `<span class="hint">Photo loading…</span>`) : "";
    const by = e.logged_by && e.logged_by !== S.me?.email && !isDad() ? `<span class="by">Logged by ${esc(memberName(e.logged_by))}</span>` : "";
    let acts;
    if (S.confirmDel === e.id) acts = `<span>Remove this entry?</span><button class="link danger" data-del="${e.id}">Yes, remove</button><button class="link" data-act="cancel-del">Keep</button>`;
    else if (S.editCarbs === e.id) acts = `<div class="inline-edit"><input id="carbs-${e.id}" type="number" inputmode="numeric" min="0" max="400" aria-label="Carbs in grams" placeholder="grams"><button class="save" data-savecarbs="${e.id}">Save</button><button class="link" data-act="cancel-carbs">Cancel</button></div>`;
    else acts = `${e.kind !== "long" ? `<button class="link" data-carbs="${e.id}">${e.carbs == null ? "+ Add carbs" : "Change carbs"}</button>` : ""}<button class="link" data-askdel="${e.id}">Remove</button>`;
    return `<div class="entry" style="--c:${k.color}"><time>${tm(e.at)}</time><div class="body">
      <span class="kind">${k.short}${dose}</span>${food ? `<span class="food">${food}</span>` : ""}${img}${by}<div class="acts">${acts}</div></div></div>`;
  }

  /* ---------- Appointments ---------- */
  function startOfToday(){ const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function upcoming(){ const t = startOfToday(); return S.appts.filter(a => new Date(a.starts_at) >= t); }
  function dayLabel(t){
    const k = dayKey(t), tk = today(), tom = dayKey(Date.now() + 864e5);
    if (k === tk) return "Today";
    if (k === tom) return "Tomorrow";
    return new Date(t).toLocaleDateString("en-GB", {weekday: "long", day: "numeric", month: "long"});
  }
  const apptWhen = a => dayLabel(a.starts_at) + ", " + tm(a.starts_at);
  const apptsOn = key => S.appts.filter(a => dayKey(a.starts_at) === key);

  function calendar(){
    if (!S.loaded) return `<div class="empty">Loading…</div>`;
    const now = new Date();
    const m = S.calMonth || {y: now.getFullYear(), m: now.getMonth()};
    S.calMonth = m;
    const sel = S.calDay || today();
    const first = new Date(m.y, m.m, 1);
    const lead = (first.getDay() + 6) % 7;                 // weeks start Monday
    const days = new Date(m.y, m.m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < lead; i++) cells += `<span class="cal-pad"></span>`;
    for (let d = 1; d <= days; d++){
      const key = dayKey(new Date(m.y, m.m, d));
      const n = apptsOn(key).length;
      cells += `<button class="cal-day${key === today() ? " is-today" : ""}${key === sel ? " is-sel" : ""}" data-calday="${key}" aria-label="${d}${n ? ", " + n + " appointment" + (n > 1 ? "s" : "") : ""}">
        <span>${d}</span>${n ? `<i class="dot"></i>` : ""}</button>`;
    }
    const title = first.toLocaleDateString("en-GB", {month: "long", year: "numeric"});
    const list = apptsOn(sel);
    const up = upcoming().slice(0, 6);
    return `<div class="screen">
      <h1>Appointments</h1>
      <div class="cal">
        <div class="cal-head">
          <button class="cal-nav" data-act="cal-prev" aria-label="Previous month">‹</button>
          <strong>${title}</strong>
          <button class="cal-nav" data-act="cal-next" aria-label="Next month">›</button>
        </div>
        <div class="cal-grid">${["M","T","W","T","F","S","S"].map(d => `<span class="cal-dow">${d}</span>`).join("")}${cells}</div>
      </div>
      <section class="day">
        <h3>${dayLabel(new Date(sel + "T12:00"))}</h3>
        ${list.length ? `<div class="entries">${list.map(apptRow).join("")}</div>` : `<p class="hint">Nothing on this day.</p>`}
      </section>
      ${S.apptForm ? apptFormView() : `<button class="secondary" data-act="appt-new">+ Add appointment</button>`}
      ${up.length ? `<section class="day"><h3>Coming up</h3><div class="entries">${up.map(a => apptRow(a, true)).join("")}</div></section>` : ""}
    </div>`;
  }
  function apptRow(a, withDay){
    let acts;
    if (S.confirmAppt === a.id) acts = `<span>Remove this appointment?</span><button class="link danger" data-rmappt="${a.id}">Yes, remove</button><button class="link" data-act="cancel-appt">Keep</button>`;
    else acts = `<button class="link" data-editappt="${a.id}">Edit</button><button class="link" data-askappt="${a.id}">Remove</button>`;
    return `<div class="entry" style="--c:var(--long)"><time>${tm(a.starts_at)}</time><div class="body">
      <span class="kind">${esc(a.title)}</span>
      ${withDay ? `<span class="food">${dayLabel(a.starts_at)}</span>` : ""}
      ${a.place ? `<span class="food">${esc(a.place)}</span>` : ""}
      ${a.notes ? `<span class="food">${esc(a.notes)}</span>` : ""}
      ${withDay ? "" : `<div class="acts">${acts}</div>`}</div></div>`;
  }
  function apptFormView(){
    const f = S.apptForm;
    return `<form class="stack appt-form" id="appt-form">
      <h2>${f.id ? "Edit appointment" : "New appointment"}</h2>
      <div class="field"><label for="a-title">What is it?</label><input class="input" id="a-title" type="text" maxlength="120" required placeholder="e.g. Diabetes clinic" value="${esc(f.title || "")}"></div>
      <div class="row2">
        <div class="field"><label for="a-date">Date</label><input class="input" id="a-date" type="date" required value="${esc(f.date)}"></div>
        <div class="field"><label for="a-time">Time</label><input class="input" id="a-time" type="time" required value="${esc(f.time || "09:00")}"></div>
      </div>
      <div class="field"><label for="a-place">Where (optional)</label><input class="input" id="a-place" type="text" maxlength="200" placeholder="e.g. Whiston Hospital, Outpatients" value="${esc(f.place || "")}"></div>
      <div class="field"><label for="a-notes">Notes (optional)</label><input class="input" id="a-notes" type="text" maxlength="1000" placeholder="e.g. Bring the meter. Sister driving." value="${esc(f.notes || "")}"></div>
      <p class="err" id="a-err" hidden></p>
      <button class="primary dark" type="submit">${f.id ? "Save changes" : "Add appointment"}</button>
      <button class="link" type="button" data-act="appt-cancel">Cancel</button>
    </form>`;
  }
  async function saveAppt(){
    const title = $("#a-title").value.trim(), date = $("#a-date").value, time = $("#a-time").value;
    const err = $("#a-err");
    if (!title || !date || !time){ err.hidden = false; err.textContent = "Add what it is, the date and the time."; return; }
    const row = {title, starts_at: new Date(date + "T" + time).toISOString(),
      place: $("#a-place").value.trim() || null, notes: $("#a-notes").value.trim() || null};
    const id = S.apptForm.id;
    const q = id ? sb.from("appointments").update(row).eq("id", id) : sb.from("appointments").insert(row);
    const {error} = await q;
    if (error){ err.hidden = false; err.textContent = /appointments/.test(error.message || "") && /exist|schema cache/.test(error.message || "")
      ? "The appointments table isn't set up yet. Run supabase/02-appointments.sql in Supabase." : "Couldn't save: " + errText(error); return; }
    S.apptForm = null; S.calDay = date;
    await loadAppts(); render();
  }

  /* ---------- Settings ---------- */
  function settings(){
    const s = S.settings;
    const people = S.members.map(m => {
      const self = m.email === S.me.email;
      const confirm = S.confirmMember === m.email;
      return `<li><span class="who"><b>${esc(m.name || m.email.split("@")[0])}${self ? " (you)" : ""}</b>${esc(m.email)} · ${m.role === "dad" ? "Dad's phone" : "Family"}</span>
        ${self ? "" : confirm
          ? `<span><button class="link danger" data-rmmember="${esc(m.email)}">Remove</button> <button class="link" data-act="cancel-member">Keep</button></span>`
          : `<button class="link" data-askmember="${esc(m.email)}">Remove</button>`}</li>`;
    }).join("");
    return `<div class="screen"><h1>Settings</h1>
      <p class="hint">These only pre-fill the number on Dad's screen. He can always change it.</p>
      <div class="field"><label for="set-name">Name on his screen</label><input class="input" id="set-name" type="text" maxlength="40" value="${esc(s.name)}"></div>
      <div class="row2">
        <div class="field"><label for="set-long">Long-acting (units)</label><input class="input" id="set-long" type="number" inputmode="numeric" min="0" max="100" value="${s.long_units}"></div>
        <div class="field"><label for="set-meal">Meal dose (units)</label><input class="input" id="set-meal" type="number" inputmode="numeric" min="0" max="100" value="${s.meal_units}"></div>
      </div>
      <div class="field"><label for="set-by">Flag long-acting as missing after</label><input class="input" id="set-by" type="time" value="${esc(s.long_by)}"></div>
      <button class="primary dark" data-act="save-settings">Save settings</button>
      <p class="hint" id="set-msg"></p>

      <div class="section">
        <h2>Family list</h2>
        <p class="hint">Only these people can sign in and see the log.</p>
        <ul class="people">${people}</ul>
        <form class="stack" id="member-form">
          <div class="field"><label for="m-name">Name</label><input class="input" id="m-name" type="text" maxlength="40" placeholder="e.g. Auntie Pat"></div>
          <div class="field"><label for="m-email">Email</label><input class="input" id="m-email" type="email" inputmode="email" required></div>
          <div class="field"><label for="m-role">Which screen they start on</label>
            <select class="input" id="m-role"><option value="family">Family (sees the log)</option><option value="dad">Dad's phone (big buttons only)</option></select></div>
          <button class="secondary" type="submit">Add to family list</button>
          <p class="hint" id="m-msg"></p>
        </form>
      </div>
      <div class="section">
        <p class="hint">Signed in as ${esc(S.me.email)}</p>
        <button class="secondary" data-act="signout">Sign out</button>
      </div>
    </div>`;
  }

  function render(){
    let html;
    if (!S.me) html = loginView();
    else if (S.view === "family") html = family();
    else if (S.view === "settings") html = isDad() ? family() : settings();
    else if (S.view === "calendar") html = isDad() ? (S.view = "dad", S.step = "appts", dadAppts()) : calendar();
    else html = ({home: dadHome, already: dadAlreadyLong, dose: dadDose, food: dadFood, tick: dadTick, appts: dadAppts})[S.step]();
    $("#view").innerHTML = html;
  }

  /* ---------- Actions ---------- */
  async function start(kind, force){
    if (kind === "long" && !force){
      await loadEntries();                // check the freshest log before allowing a second long-acting dose
      if (todays("long").length){ S.step = "already"; return render(); }
    }
    const prev = lastOf(kind);
    const units = kind === "long" ? (prev?.units ?? S.settings.long_units)
               : kind === "meal" ? (prev?.units ?? S.settings.meal_units) : null;
    S.draft = {kind, units: Number(units), food: "", carbs: null, photoPath: null, previewUrl: null};
    S.step = kind === "snack" ? "food" : "dose";
    render(); window.scrollTo(0, 0);
  }
  function readFood(){
    const f = $("#food-in"), c = $("#carbs-in");
    if (f) S.draft.food = f.value.trim();
    if (c) S.draft.carbs = c.value === "" ? null : Math.max(0, Math.min(400, Math.round(+c.value)));
  }
  async function save(){
    if (S.saving) return;
    if (S.step === "food") readFood();
    const d = S.draft;
    const row = {kind: d.kind};
    if (d.kind !== "snack") row.units = d.units;
    if (d.kind !== "long"){
      if (d.food) row.food = d.food;
      if (d.carbs != null) row.carbs = d.carbs;
      if (d.photoPath) row.photo_path = d.photoPath;
    }
    S.saving = true; render();
    const {data, error} = await sb.from("entries").insert(row).select().single();
    S.saving = false;
    if (error){
      banner("Not saved. Check your signal, then tap Done again.");
      return render();                       // keep the draft so nothing is lost
    }
    banner("");
    if (!S.entries.some(e => e.id === data.id)) S.entries.unshift(data);
    if (d.previewUrl && data.photo_path) S.photoUrls[data.photo_path] = {url: d.previewUrl, exp: Date.now() + 50 * 60000};
    S.last = data; S.step = "tick";
    clearTimeout(S.undoTimer);
    S.undoTimer = setTimeout(() => { S.undoTimer = null; if (S.step === "tick") render(); }, 60000);
    render();
  }
  async function undo(){
    const e = S.last; clearTimeout(S.undoTimer); S.undoTimer = null;
    S.entries = S.entries.filter(x => x.id !== e.id);
    S.step = "home"; render();
    const {error} = await sb.from("entries").delete().eq("id", e.id);
    if (error){ banner("Couldn't undo. Ask the family to remove it from the log."); scheduleReload(); return; }
    if (e.photo_path) sb.storage.from("photos").remove([e.photo_path]);
  }
  async function onPhoto(file){
    if (!file) return;
    readFood();
    S.draft.uploading = true; render();
    try {
      const blob = await shrink(file);
      const id = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + "-" + Math.random().toString(36).slice(2));
      const path = new Date().getFullYear() + "/" + id + ".jpg";
      const {error} = await sb.storage.from("photos").upload(path, blob, {contentType: "image/jpeg", upsert: false});
      if (error) throw error;
      S.draft.photoPath = path;
      S.draft.previewUrl = URL.createObjectURL(blob);
    } catch(e){
      banner("The photo didn't upload. You can still write what you ate.");
    }
    S.draft.uploading = false; render();
  }
  function shrink(file){
    return new Promise(res => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1200, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => res(b || file), "image/jpeg", 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }
  async function saveSettings(){
    const n = id => Math.max(0, Math.min(100, Math.round(+$(id).value || 0)));
    const s = {name: $("#set-name").value.trim() || "Dad", long_units: n("#set-long"), meal_units: n("#set-meal"), long_by: $("#set-by").value || "10:00"};
    const msg = $("#set-msg");
    const {error} = await sb.from("settings").update(s).eq("id", 1);
    if (error){ msg.textContent = "Couldn't save: " + errText(error); return; }
    S.settings = {...S.settings, ...s}; msg.textContent = "Saved.";
  }
  async function addMember(){
    const email = $("#m-email").value.trim().toLowerCase();
    const name = $("#m-name").value.trim();
    const role = $("#m-role").value;
    const msg = $("#m-msg");
    if (!email) return;
    const {error} = await sb.from("members").insert({email, name, role});
    if (error){ msg.textContent = /duplicate/i.test(error.message) ? "That email is already on the list." : "Couldn't add: " + errText(error); return; }
    await loadMembers(); render();
    $("#m-msg").textContent = `Added. Send them the link to this page. They sign in with ${email}.`;
  }
  async function removeMember(email){
    S.confirmMember = null;
    const {error} = await sb.from("members").delete().eq("email", email);
    if (error) banner("Couldn't remove: " + errText(error));
    await loadMembers(); render();
  }
  async function signOut(){
    if (S.channel){ sb.removeChannel(S.channel); S.channel = null; }
    await sb.auth.signOut();
    S.me = null; S.session = null; S.entries = []; S.loaded = false; S.auth = "email";
    $("#tabs").hidden = true; banner(""); render();
  }

  document.addEventListener("click", async ev => {
    const t = ev.target.closest("button"); if (!t) return;
    const go = t.dataset.go, a = t.dataset.act;
    if (go) return start(go);
    if (t.dataset.carbs){ S.editCarbs = t.dataset.carbs; S.confirmDel = null; render(); $("#carbs-" + S.editCarbs)?.focus(); return; }
    if (t.dataset.savecarbs){
      const id = t.dataset.savecarbs, v = $("#carbs-" + id).value; S.editCarbs = null;
      if (v !== ""){
        const carbs = Math.max(0, Math.min(400, Math.round(+v)));
        const {error} = await sb.from("entries").update({carbs}).eq("id", id);
        if (error) banner("Couldn't save carbs."); else { const e = S.entries.find(x => x.id === id); if (e) e.carbs = carbs; }
      }
      return render();
    }
    if (t.dataset.askdel){ S.confirmDel = t.dataset.askdel; S.editCarbs = null; return render(); }
    if (t.dataset.del){
      const id = t.dataset.del, e = S.entries.find(x => x.id === id); S.confirmDel = null;
      S.entries = S.entries.filter(x => x.id !== id); render();
      const {error} = await sb.from("entries").delete().eq("id", id);
      if (error){ banner("Couldn't remove it."); scheduleReload(); }
      else if (e?.photo_path) sb.storage.from("photos").remove([e.photo_path]);
      return;
    }
    if (t.dataset.calday){ S.calDay = t.dataset.calday; S.confirmAppt = null; return render(); }
    if (t.dataset.editappt){
      const a = S.appts.find(x => x.id === t.dataset.editappt); if (!a) return;
      const d = new Date(a.starts_at);
      S.apptForm = {id: a.id, title: a.title, date: dayKey(d), time: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"), place: a.place, notes: a.notes};
      render(); $("#appt-form")?.scrollIntoView({block: "start"}); return;
    }
    if (t.dataset.askappt){ S.confirmAppt = t.dataset.askappt; return render(); }
    if (t.dataset.rmappt){
      const id = t.dataset.rmappt; S.confirmAppt = null;
      S.appts = S.appts.filter(a => a.id !== id); render();
      const {error} = await sb.from("appointments").delete().eq("id", id);
      if (error){ banner("Couldn't remove the appointment."); await loadAppts(); render(); }
      return;
    }
    if (t.dataset.askmember){ S.confirmMember = t.dataset.askmember; return render(); }
    if (t.dataset.rmmember) return removeMember(t.dataset.rmmember);
    switch (a){
      case "home": S.step = "home"; S.draft = null; banner(""); render(); window.scrollTo(0, 0); break;
      case "force-long": start("long", true); break;
      case "minus": S.draft.units = Math.max(0, S.draft.units - 1); $("#units").textContent = S.draft.units; break;
      case "plus": S.draft.units = Math.min(100, S.draft.units + 1); $("#units").textContent = S.draft.units; break;
      case "to-food": S.step = "food"; render(); break;
      case "to-dose": readFood(); S.step = "dose"; render(); break;
      case "photo": $("#photo-in").click(); break;
      case "save": save(); break;
      case "undo": undo(); break;
      case "save-settings": saveSettings(); break;
      case "cancel-carbs": S.editCarbs = null; render(); break;
      case "cancel-del": S.confirmDel = null; render(); break;
      case "cancel-member": S.confirmMember = null; render(); break;
      case "dad-appts": S.step = "appts"; render(); window.scrollTo(0, 0); break;
      case "cal-prev": case "cal-next": {
        const m = S.calMonth, step = a === "cal-next" ? 1 : -1, d = new Date(m.y, m.m + step, 1);
        S.calMonth = {y: d.getFullYear(), m: d.getMonth()}; render(); break;
      }
      case "appt-new": S.apptForm = {date: S.calDay || today(), time: "09:00"}; render(); $("#a-title")?.focus(); break;
      case "appt-cancel": S.apptForm = null; render(); break;
      case "cancel-appt": S.confirmAppt = null; render(); break;
      case "signout": signOut(); break;
      case "resend": { const em = store.get("doselog.pendingEmail"); S.auth = "email"; render(); if (em) sendCode(em); break; }
      case "other-email": store.set("doselog.pendingEmail", null); S.auth = "email"; render(); break;
    }
  });
  document.addEventListener("submit", ev => {
    ev.preventDefault();
    if (ev.target.id === "email-form") sendCode($("#email-in").value.trim().toLowerCase());
    if (ev.target.id === "code-form") verifyCode();
    if (ev.target.id === "member-form") addMember();
    if (ev.target.id === "appt-form") saveAppt();
  });
  document.addEventListener("change", ev => { if (ev.target.id === "photo-in") onPhoto(ev.target.files[0]); });

  /* ---------- Start ---------- */
  if (store.get("doselog.pendingEmail")) S.auth = "code";
  sb.auth.onAuthStateChange((event, session) => {
    // Defer: calling Supabase inside this callback can deadlock the auth client.
    if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) setTimeout(() => afterLogin(session), 0);
  });
  sb.auth.getSession().then(({data}) => { if (data.session) afterLogin(data.session); else render(); });
})();
