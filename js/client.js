/* Reads config.js and creates the Supabase client the rest of the app talks to. */

/** Set by config.js (the one file each install edits). */
export const CFG = window.DOSE_LOG_CONFIG || {};

const filledIn = v => Boolean(v) && !/^PASTE/.test(v);

/** True once config.js has a real project URL and key. */
export const isConfigured = () => filledIn(CFG.supabaseUrl) && filledIn(CFG.supabaseKey);

/** False if the Supabase script from index.html didn't load (offline, blocked). */
export const libraryLoaded = () => Boolean(window.supabase);

/** The Supabase client, or null when the app isn't configured yet. */
export const db = isConfigured() && libraryLoaded()
  ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
    })
  : null;
