# Dose Log

A simple shared log of insulin doses and meals, kept by the person taking them and visible to their family. You host it yourself, so your data stays in your own account.

> **Not a medical device. It only records what the person says they took.** It never suggests, calculates or adjusts a dose, and it should stay that way: software that does those things can count as a medical device. Always follow your diabetes team's plan. Provided as is, with no warranty (see [LICENSE](LICENSE)).

## What it does

- **Home:** three big buttons for the person taking the doses: long-acting insulin, meal + insulin, snack. Food can be logged as a photo, a few words, or carbs.
- **Log:** today's status for the family, a flag if long-acting hasn't been logged by a set time, and a timeline of every dose, meal and snack.
- **Calendar:** a shared month calendar of appointments. The Home screen shows the next one.
- **Journal:** after an appointment, whoever went writes what was said, any changes and next steps, so everyone stays up to date.
- **Safety:** tapping long-acting twice in a day shows a warning first.
- **Optional:** glucose readings from LibreLinkUp, and reminder notifications if a dose or meal hasn't been logged.

## How it works

- The app is plain HTML and JavaScript with no build step, hosted for free on GitHub Pages.
- Data, photos and sign-in live in your own [Supabase](https://supabase.com) project (free tier is plenty for a family).
- Sign-in is a code sent by email. Nobody sees anything unless their email is on the family list, and the database enforces that on every request, not just the app.
- This repository holds only code. No health data is ever stored in it.

## Set up your own

You need a GitHub account, a Supabase account, and an email account that can send mail (Gmail with an app password is fine). Allow about half an hour.

1. **Get a copy of this code.** Fork this repository, or use it as a template, into your own GitHub account.
2. **Create a Supabase project.** Pick a region close to you. When asked, leave "Automatically expose new tables" **off** and "Enable automatic RLS" **on**, so new tables are locked by default.
3. **Create the database.** In Supabase, open **SQL Editor** and run these files from the `supabase/` folder, in this order, pasting each one in:
   `setup.sql`, `02-appointments.sql`, `05-journal.sql`, `08-home-phone-view.sql`, `09-admin-role.sql`
   (On a fresh install, ignore the email on the last line of `09-admin-role.sql`; the next step makes you the admin.)
4. **Add yourself as the first admin.** Still in the SQL Editor:
   ```sql
   insert into public.members (email, name, role) values ('you@example.com', 'Your name', 'admin');
   ```
   Then run `supabase/10-block-signups.sql`. From then on only people on the family list can create an account, so add each person to the family list before they first sign in.
5. **Set up sign-in emails.** Supabase → **Authentication → Emails → Set up SMTP** (Gmail: `smtp.gmail.com`, port 587, an [app password](https://myaccount.google.com/apppasswords)). Supabase only lets you edit email templates once custom SMTP is on. Then, in both **Confirm sign up** and **Magic Link**, make the message body show the code:
   ```html
   <h2>Your Dose Log code</h2><p>Type this into Dose Log:</p><h1>{{ .Token }}</h1>
   ```
   Also set **Authentication → URL Configuration → Site URL** to your site's address (step 7), so emailed links work too.
6. **Point the app at your project.** Copy `config.example.js` to `config.js` and fill in your project URL and publishable key (Supabase → **Project Settings → API**). Commit it. Both values are meant to be public. Never put a `service_role` or secret key anywhere in this repository.
7. **Publish it.** GitHub → your repository → **Settings → Pages** → deploy from branch `main`, folder `/ (root)`. Your site will be at `https://<your-username>.github.io/<repository-name>/`.
8. **Open it on each phone,** sign in, and add it to the home screen. Add everyone else under **Settings → Family list**. Give the phone of the person taking the doses the role **Logs doses**: it opens on the big buttons and can't change settings.

## Optional: glucose from LibreLinkUp

LibreLinkUp has no official API. This uses the same requests as the LibreLinkUp app, so it can break if Abbott changes them. If it does, the app shows the error and everything else keeps working. Glucose is shown in mmol/L.

1. Make a separate LibreLinkUp account for this (not anyone's personal one), sign in to the LibreLinkUp app with it once and accept the terms. In the Libre app, invite it and accept the invite.
2. SQL Editor → run `supabase/03-glucose.sql`.
3. Edge Functions → deploy `supabase/functions/libre-sync/index.ts` as `libre-sync`, with JWT verification turned off (it checks its own secret instead).
4. Edge Functions → Secrets: `LIBRE_EMAIL`, `LIBRE_PASSWORD`, `SYNC_SECRET` (a long random string).
5. SQL Editor → run `supabase/04-schedule.sql` with `PASTE_SYNC_SECRET` replaced by the same random string. Don't commit the real value.

## Optional: reminder notifications

Sent only to phones whose family-list role is "Logs doses", and only when nothing has been logged yet (breakfast, lunch, evening meal: no meal + insulin entry since the previous reminder time; long-acting: none today). Times are set in Settings and are UK time.

1. SQL Editor → run `supabase/06-reminders.sql`.
2. Generate a key pair with `npx web-push generate-vapid-keys`, and put the public half in `config.js` as `vapidPublicKey`.
3. Edge Functions → deploy `supabase/functions/reminders/index.ts` as `reminders`, JWT verification off.
4. Edge Functions → Secrets: `VAPID_PUBLIC_KEY` (same as `vapidPublicKey`), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` address of yours, e.g. `mailto:you@example.com`) and `SYNC_SECRET` (the same one as above).
5. SQL Editor → run `supabase/07-schedule-reminders.sql` with `PASTE_SYNC_SECRET` replaced.
6. On the dose-logging phone, open the app installed from Chrome and tap **Turn on reminders**.

### Dose checks and alerts for admins

Run `supabase/11-dose-checks.sql`. Admins then get a **Seen and agree** button on each dose in the Log; everyone sees who checked it, and only admins can mark it (the database enforces this). If the reminders function is set up, admins can also tap **Get dose alerts on this phone** in Settings to be notified whenever a new dose is logged on the Home-screen phone. Family members and the Home-screen phone never get these alerts.

## Privacy and safety notes

- This is health information. You are responsible for the Supabase project you create: use a strong password, turn on two-factor sign-in for your Supabase and GitHub accounts, and only add people who should see it.
- Photos are stored in a private bucket and shown through short-lived links.
- With `10-block-signups.sql` run, an email that isn't on the family list can't create an account or get a code, so add people to the family list before they first sign in. Without it, anyone who finds your site can have a code emailed to them (they still see nothing, but they use up your sending allowance).
- This is built for one household per install. Running it as a service for other people's health data is a different matter (in the UK, for example, that brings UK GDPR obligations) and is not what this repository sets up.

## Limitations

- Built around insulin, UK conventions (mmol/L, `en-GB` dates, UK-time reminders) and one household.
- Needs a connection: there is no offline mode.
- Reminders need a phone and browser that support web push notifications. The app is built for Chrome on Android, installed to the home screen.

## Code map

There is no build step: the browser loads the files in `js/` directly as ES modules.

| File | What it does |
| --- | --- |
| `index.html`, `style.css`, `manifest.webmanifest`, `sw.js` | The page, styles, install-to-home-screen details, and the service worker that shows reminders |
| `config.js` | Your Supabase URL and publishable key (see `config.example.js`) |
| `js/main.js` | Start-up |
| `js/client.js` | Creates the Supabase client from `config.js` |
| `js/state.js`, `js/selectors.js` | The shared state object, and read-only questions about it |
| `js/render.js` | Chooses and draws the current screen |
| `js/views/` | One file per screen (home, log, glucose, calendar, journal, settings, login) |
| `js/data.js` | Loads data from Supabase and listens for realtime updates |
| `js/auth.js` | Email-code sign-in |
| `js/actions/` | Everything that changes data: logging, appointments, journal, settings |
| `js/events.js` | Click, submit and change handling |
| `js/push.js` | Reminder notification subscription |
| `supabase/` | Database setup SQL and the optional Edge Functions |

To try changes locally, run `python3 -m http.server` in this folder and open `http://localhost:8000`.

Two names date from the first version and are kept so existing installs keep working: the role stored as `dad` (shown in the app as "Logs doses"), and the `dad_sees_records` setting. Page addresses `#dad` and `#family` still work as `#home` and `#log`.

## Licence

[MIT](LICENSE).
