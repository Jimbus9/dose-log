# Dose Log

A simple shared log of insulin doses and meals, kept by the person taking them and visible to their family.

- **Dad's screen:** three big buttons: long-acting insulin, meal + insulin, snack. Food can be logged as a photo, a few words, or carbs.
- **Family screen:** today's status, a flag if long-acting hasn't been logged by a set time, and a timeline of every dose, meal and snack.
- **Appointments:** the family sees a month calendar and can add, edit and remove appointments. Dad's screen shows the next one and a simple list.
- **Safety:** tapping long-acting twice in a day shows a warning first. The app never suggests or calculates a dose.

Glucose readings are not part of this app.

## How it works

- The app is plain HTML/JS hosted on GitHub Pages.
- Data, photos and sign-in live in Supabase (London region).
- Nobody sees anything unless their email is on the family list. Sign-in is a code sent by email.

## Setup

1. Supabase → **SQL Editor** → run `supabase/setup.sql`, then `supabase/02-appointments.sql`.
2. In the same editor, add the first family member:
   `insert into public.members (email, name, role) values ('you@example.com', 'Your name', 'family');`
3. Supabase → **Authentication → Emails → Set up SMTP** (Gmail: `smtp.gmail.com`, port 587, an app password). Supabase only lets you edit templates once custom SMTP is on.
   Then in both **Confirm sign up** and **Magic Link**, make the body show `{{ .Token }}` (the code).
   Also set **Authentication → URL Configuration → Site URL** to the GitHub Pages address, so emailed links work too.
4. Put the project URL and publishable key in `config.js`.
5. GitHub → **Settings → Pages** → deploy from branch `main`, folder `/ (root)`.

Add everyone else from the app's **Settings → Family list**.
