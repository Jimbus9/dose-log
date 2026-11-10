/* Constants and the one shared `state` object the whole app reads and writes. */

/** The three kinds of log entry, and the colour each one uses (see style.css). */
export const KINDS = {
  long:  {short: "Long-acting", color: "var(--long)"},
  meal:  {short: "Meal",        color: "var(--meal)"},
  snack: {short: "Snack",       color: "var(--snack)"}
};

/**
 * Values stored in the members.role column.
 * LOGGER is the phone of the person taking the doses. It is stored as "dad" because
 * that is what the first version of the database called it; renaming it would need a
 * migration on every existing install. The app calls it "Logs doses" everywhere.
 */
export const ROLE = {ADMIN: "admin", FAMILY: "family", LOGGER: "dad"};

export const ROLE_LABEL = {
  [ROLE.ADMIN]: "Admin",
  [ROLE.FAMILY]: "Family",
  [ROLE.LOGGER]: "Logs doses (Home screen)"
};

/** Used until the settings row has loaded. The database row overrides all of these. */
export const DEFAULT_SETTINGS = {name: "", long_units: 20, meal_units: 6, long_by: "10:00"};

/** How many days of log the app loads. */
export const HISTORY_DAYS = 14;

/**
 * Everything the screens need. Views only read it; actions and loaders change it and
 * then call render(). `step` is the position inside the Home screen's dose flow:
 * home -> dose -> food -> tick (or "already" / "appts").
 */
export const state = {
  view: "home", step: "home", auth: "email",
  session: null, me: null, members: [], entries: [], settings: {...DEFAULT_SETTINGS},
  loaded: false, draft: null, last: null, undoTimer: null, saving: false,
  editCarbs: null, confirmDel: null, confirmMember: null, photoUrls: {}, channel: null,
  appts: [], calMonth: null, calDay: null, apptForm: null, confirmAppt: null,
  notes: [], noteForm: null, confirmNote: null, focusNote: null,
  glucose: [], libreStatus: null,
  // Glucose history screen: the day on show (YYYY-MM-DD), its readings and log entries,
  // and a summary of recent days.
  hist: {day: null, readings: [], entries: [], days: null, loading: false, exporting: null},
  push: null
};
