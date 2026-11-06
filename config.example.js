// Copy this file to config.js and fill in your own values (see README, step 6).
// Supabase > Project Settings > API. Both values are safe to publish: the database
// only shows data to people on the family list.
window.DOSE_LOG_CONFIG = {
  supabaseUrl: "PASTE_YOUR_PROJECT_URL",
  supabaseKey: "PASTE_YOUR_PUBLISHABLE_KEY",
  // Only needed for reminder notifications (see README). The public half of your VAPID key pair.
  vapidPublicKey: ""
};
