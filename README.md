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
- Verge calendar
- live multiplayer leaderboard shell

## Mac Notes

Verge is currently set up best for macOS development.

If `localhost:3000` is already in use, stop the old process first and run `npm run dev` again.

## Windows Setup

Install these first:

- [Git](https://git-scm.com/download/win)
- [Node.js](https://nodejs.org/)

Then open PowerShell, Command Prompt, or Git Bash and run:

```bash
git clone https://github.com/CodedMed/Verge.git
cd Verge
npm install
npm run dev
```

If the Electron window does not open right away, open:

```text
http://localhost:3000
```

If you want a Windows desktop build later, use:

```bash
npm run dist:win
```

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

## Supabase Schema Update

For the latest preferences, calendar, Google sync metadata, and multiplayer leaderboard tables:

1. Open [schema.sql](/Users/johnmeng_1/Documents/Codex/2026-04-22-https-claude-ai-share-df5b5d13-3f4e/verge-fresh/supabase/schema.sql)
2. Copy the full file
3. Paste it into Supabase `SQL Editor`
4. Run it

## Google Calendar Sync

Add these Vercel environment variables to the hosted backend:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_OAUTH_STATE_SECRET`

Recommended callback:

```text
https://verge-fresh.vercel.app/api/google-calendar/callback
```

Then redeploy:

```bash
npx vercel --prod
```

In Verge:

1. Open `Calendar`
2. Click `Connect Google`
3. Finish Google auth
4. Click `Sync to Google`

## Live Multiplayer Leaderboard

The live leaderboard uses the same Supabase project.

Once multiple signed-in users are on the same Supabase backend, Verge will show:

- each player’s current task
- live timer progress
- saved point totals

No extra client setup is needed after the updated `schema.sql` is run.

## Troubleshooting

If the desktop window does not appear, the web app is usually still running at:

```text
http://localhost:3000
```

If you want to confirm the hosted Kai backend is live, open:

[https://verge-fresh.vercel.app/api/kai](https://verge-fresh.vercel.app/api/kai)
