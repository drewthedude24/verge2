# Verge

Verge is a desktop-first AI planning app.

You talk through your day or week, Kai turns it into a schedule, and Verge gives you a one-task-at-a-time execution flow with history, timers, and saved plans.

## Quick Start

```bash
git clone https://github.com/CodedMed/Verge.git
cd Verge
npm install
npm run dev
```

That’s the main setup now.

The app already has safe public defaults for:

- Supabase auth + persistence
- hosted Kai backend

So strangers do not need to hunt down model keys to try Verge.

## If You Want a Local Env File

You can still create one if you want to override the defaults:

```bash
cp .env.local.example .env.local
```

Then run:

```bash
npm run dev
```

## What Works Out of the Box

- desktop shell
- live Kai through the hosted backend
- sign in
- saved schedules
- saved planner blocks
- right-side execution rail
- history retrieval from Supabase

## Mac Notes

Verge is currently set up best for macOS development.

If `localhost:3000` is already in use, stop the old process first and run `npm run dev` again.

## Main Scripts

```bash
npm run dev
npm run dev:next
npm run dev:electron
npm run lint
npm run build:next
npm run dist:mac
npm run dist:win
```

## Project Structure

- `app/` — Next routes and API
- `components/auth/` — auth UI
- `components/kai/` — chat, timer, execution rail, history
- `components/layout/` — desktop shell
- `electron/` — Electron app runtime
- `lib/` — prompt, Supabase, storage, hosted backend helpers
- `supabase/` — SQL schema

## Optional Overrides

If you want to point Verge at a different backend or Supabase project, use `.env.local` and override:

- `NEXT_PUBLIC_KAI_API_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Troubleshooting

If the desktop window does not appear, the web app is usually still running at:

```text
http://localhost:3000
```

If you want to confirm the hosted Kai backend is live, open:

[https://verge-fresh.vercel.app/api/kai](https://verge-fresh.vercel.app/api/kai)
