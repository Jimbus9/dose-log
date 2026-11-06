# Dose Log

A simple shared log of insulin doses and meals, kept by the person taking them and visible to their family.

- **Home screen:** three big buttons: long-acting insulin, meal + insulin, snack. Food can be logged as a photo, a few words, or carbs.
- **Family screen:** today's status, a flag if long-acting hasn't been logged by a set time, and a timeline of every dose, meal and snack.
- **Appointments:** the family sees a month calendar and can add, edit and remove appointments. The Home screen shows the next one and a simple list.
- **Health journal:** after an appointment, whoever went writes what was said, any changes and next steps, so everyone stays up to date.
- **Safety:** tapping long-acting twice in a day shows a warning first. The app never suggests or calculates a dose.

Glucose readings can be pulled in from LibreLinkUp (optional, see below).

## How it works

- The app is plain HTML/JS hosted on GitHub Pages.
- Data, photos and sign-in live in Supabase (London region).
- Nobody sees anything unless their email is on the family list. Sign-in is a code sent by email.

## Setup

1. Supabase → **SQL Editor** → run `supabase/setup.sql`, then `supabase/02-appointments.sql` and `supabase/05-journal.sql`.
2. In the same editor, add the first family member:
   `insert into public.members (email, name, role) values ('you@example.com', 'Your name', 'family');`
3. Supabase → **Authentication → Emails → Set up SMTP** (Gmail: `smtp.gmail.com`, port 587, an app password). Supabase only lets you edit templates once custom SMTP is on.
   Then in both **Confirm sign up** and **Magic Link**, make the body show `{{ .Token }}` (the code).
   Also set **Authentication → URL Configuration → Site URL** to the GitHub Pages address, so emailed links work too.
4. Put the project URL and publishable key in `config.js`.
5. GitHub → **Settings → Pages** → deploy from branch `main`, folder `/ (root)`.

Add everyone else from the app's **Settings → Family list**.

## Optional: glucose from LibreLinkUp

LibreLinkUp has no official API. This uses the same requests as the LibreLinkUp app,
so it can break if Abbott changes them. If it does, the app shows the error and
everything else keeps working.

1. Make a separate LibreLinkUp account for this (not anyone's personal one), sign in to
   the LibreLinkUp app with it once and accept the terms. In the Libre app, invite it
   and accept the invite.
2. SQL Editor → run `supabase/03-glucose.sql`.
3. Edge Functions → deploy `supabase/functions/libre-sync/index.ts` as `libre-sync`,
   with JWT verification turned off (it checks its own secret instead).
4. Edge Functions → Secrets: `LIBRE_EMAIL`, `LIBRE_PASSWORD`, `SYNC_SECRET` (a long random string).
5. SQL Editor → run `supabase/04-schedule.sql` with `PASTE_SYNC_SECRET` replaced by the same
   random string. Don't commit the real value.

## Optional: reminder notifications

Sent only to phones whose family-list role is "Logs doses", and only when nothing
has been logged yet (breakfast, lunch, evening meal: no meal + insulin entry since
the previous reminder time; long-acting: none today). Times are set in Settings.

1. SQL Editor → run `supabase/06-reminders.sql`.
2. Edge Functions → deploy `supabase/functions/reminders/index.ts` as `reminders`, JWT verification off.
3. Edge Functions → Secrets: `VAPID_PUBLIC_KEY` (same as `vapidPublicKey` in `config.js`) and
   `VAPID_PRIVATE_KEY`. Generate a pair with `npx web-push generate-vapid-keys`.
   It also uses `SYNC_SECRET`.
4. SQL Editor → run `supabase/07-schedule-reminders.sql` with `PASTE_SYNC_SECRET` replaced.
5. On the dose-logging phone, open the app installed from Chrome and tap **Turn on reminders**.
