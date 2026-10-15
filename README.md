# DayFlow — مخططي الشخصي

Personal productivity planner PWA (Arabic RTL by default, English LTR optional): Today dashboard with three priorities and a flexible timeline, tasks (list / board / week plan), categories and projects, a full calendar (day / workweek / week / month / agenda) on the Oman workweek, Oman public holidays and annual leave, reminders with real Web Push, productivity reports, and backup/export.

Prepared by: Hani Al Ghatrifi

## Stack

- React 19 + TypeScript + Vite 8, plain CSS design tokens, Cairo font (bundled, works offline), Lucide icons
- IndexedDB (Dexie) — local-first; every change is saved on the device instantly
- Supabase (Postgres) — optional sync across devices, password-protected; tables live in a private `dayflow` schema reachable only through `public.df_*` RPC functions
- Service worker (Workbox, `src/sw.ts`) — offline app shell + push notifications
- Vercel serverless function `api/dispatch.ts` — sends Web Push (VAPID); triggered every minute by Supabase `pg_cron` + `pg_net`

```
src/lib/        data model, storage (db.ts), sync, reminders/notifications, recurrence, import/export, stats
src/components/ shared UI, editors, time grid
src/pages/      Today, Calendar, Tasks, Categories & Projects, Leave & Holidays, Reports, Settings, dialogs
supabase/       SQL (idempotent) — schema + RPCs, cron job
api/            push dispatcher
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker active) on :4173
```

## Environment variables

Public (in `.env`, safe to commit — the Supabase key is the publishable key; tables are not reachable with it):

| Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable key |
| `VITE_VAPID_PUBLIC_KEY` | VAPID public key for push subscriptions |

Server-only (Vercel → Project → Settings → Environment Variables; never in the repo):

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | same as above |
| `SUPABASE_ANON_KEY` | same as above |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | VAPID key pair (`npx web-push generate-vapid-keys`) |
| `VAPID_SUBJECT` | `mailto:` contact for push services |
| `DISPATCH_SECRET` | long random string; must equal `dayflow.config.dispatch_secret` in the database |

Without the Supabase variables the app runs fully local (sync and push sections say so).

## Database setup

1. Run `supabase/01-dayflow-schema.sql` (idempotent — safe to re-run).
2. Run `supabase/02-dayflow-cron.sql` after replacing the two placeholders (dispatch secret and the deployed URL). It stores the secret and schedules a job every minute that calls `/api/dispatch` only when a reminder is due.

## Deploy (Vercel)

Pushing `main` to GitHub deploys automatically. `vercel.json` sets the SPA rewrites and cache headers (`sw.js` is never cached).

## Install as an app

- **Android — Chrome:** menu ⋮ → *Install app* / *Add to Home screen*.
- **Samsung Internet:** menu ☰ → *Add page to* → *Home screen*.
- **Huawei (Huawei Browser / Petal):** menu → *Add to home screen*. If unavailable, use Chrome or Edge where installed.
- **iPad / iPhone — Safari:** Share → *Add to Home Screen*. Required for notifications (iPadOS/iOS 16.4+), then open from the icon.
- **Windows / macOS — Chrome / Edge:** install icon in the address bar.

## Notifications

1. Settings → Sync: create a password (first device) or sign in (other devices).
2. Settings → Notifications → *Allow notifications*, then *Enable on this device* for push.
3. Use *Test* to send a push through the server, or *Test local notification*.

Two layers, never mixed up in the UI:
- **Local reminders** fire while the app is open (system notification if permitted, plus toast and the reminder center).
- **Push** comes from the server while the app is closed. Both use the same tag, so the OS shows one notification.

Quiet hours move reminders to the end of the quiet window; reminders more than 2 hours late are not sent.

## Known limitations

- Background push depends on the browser: Chrome/Edge on Android and desktop, and Safari on an installed iPad/iPhone app support it. Samsung and Huawei battery optimisation can delay or block delivery — exclude the browser from battery optimisation. Some Huawei browsers have no Web Push support at all.
- Reminders are delivered within about a minute (cron granularity).
- Oman public holidays are not synced live (gov.om exposes no feed). 2026 dates are verified from official announcements; 2027 dates are marked *estimated* until announced — update them from the Leave & Holidays page or by importing a JSON file.
- Hijri dates use the Umm al-Qura calendar and may differ by a day from Oman's moon-sighting announcements.
- Sync is last-write-wins per record; simultaneous edits to the same record on two offline devices keep the later edit.
- Recurring events can be edited for one occurrence or the whole series; "this and following" is not supported.
