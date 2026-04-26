# Verge

Verge is a desktop-first AI planning app for students and young professionals.

You talk through a messy day or week, Kai turns it into a real execution plan, and the desktop shell helps you work through one block at a time with a timer, completion controls, history, and saved plans.

## What works today

- Electron desktop shell for macOS
- Chat-based planning with live model providers
- Supabase auth and saved planner history
- Structured execution plans stored as `planner_runs` and `planner_blocks`
- Right-side execution rail with:
  - current block
  - timer
  - complete / skip
  - queue
  - history
- Compact minimized bar with current timer/task context
- Past saved schedules can be pulled back into Kai when the user asks about previous plans

## Mac Quickstart

### 1. Clone and install

```bash
git clone https://github.com/CodedMed/Verge.git
cd Verge
npm install
```

### 2. Add environment variables

Create a local env file:

```bash
cp .env.local.example .env.local
```

There are two ways to do this:

- Founder / cofounder setup:
  Ask the project owner for the shared team `.env.local` and place it in the repo root. This is the fastest path if you are on the Verge team.
- Outside contributor / stranger setup:
  Use the hosted Kai backend that is already configured in `.env.local.example`, then add Supabase public values if you want sign-in and saved history.

Important:
- `.env.local` is intentionally not committed to Git.
- Do not paste private API keys into the repo, README, or public releases.
- If you want strangers to use live AI in production, host Verge with server-side environment variables instead of shipping your private key inside the app.

### Production-safe downloadable app setup

If you want strangers to download Verge and use live AI without ever seeing your provider key:

1. Deploy Verge's backend somewhere public, like Vercel.
2. Put your private provider keys on that server only.
3. Put the public backend URL into the downloadable app with:

```bash
NEXT_PUBLIC_KAI_API_BASE_URL=https://verge-fresh.vercel.app
```

4. Leave the local provider key lines blank in the downloadable app build.

In that setup:

- the app keeps only a public backend URL
- the backend keeps the real model keys
- users do not need local model keys
- users do not get access to `.env.local`

### 3. Start the desktop app

```bash
npm run dev
```

This starts:

- Next.js on `http://localhost:3000`
- the Electron desktop shell

If `3000` is already in use, stop the old process first.

### Stranger quickstart

If someone just wants to try Verge with the hosted AI backend:

1. Clone the repo
2. Run `npm install`
3. Run:

```bash
cp .env.local.example .env.local
```

4. Add Supabase public values if they want sign-in and saved plans:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

5. Start Verge:

```bash
npm run dev
```

What works with this setup:

- live Kai responses through the hosted Vercel backend
- no local model key setup

What still depends on Supabase being filled in:

- sign in
- synced history
- planner persistence across devices

So yes: strangers can use the hosted model without manually finding model keys. They do **not** get access to the provider secrets.

### 4. Stop the app

In the terminal, press `Ctrl+C`.

## Cofounder Setup

If your cofounder just needs to run the same live setup you already use:

1. Clone the repo
2. Run `npm install`
3. Copy the shared team `.env.local` into the project root
4. Run `npm run dev`

That means they do **not** need to go hunt for their own model keys just to run the same founder setup.

The safe way to share that file is out-of-band:

- AirDrop
- 1Password / Bitwarden secure note
- encrypted team vault
- private message with revocable secret sharing

Do **not** commit `.env.local`.

## Supabase Setup

Supabase gives Verge:

- sign in
- cloud-backed saved plans
- saved task blocks across devices
- the base for history, streaks, leaderboard, and social features later

### 1. Create a Supabase project

In Supabase, create a project and copy:

- project base URL
- `anon public` key

Your `.env.local` should use the base URL, not the REST path:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key
```

### 2. Run the schema

Open the SQL editor in Supabase and run the contents of:

[`supabase/schema.sql`](/Users/johnmeng_1/Documents/Codex/2026-04-22-https-claude-ai-share-df5b5d13-3f4e/verge-fresh/supabase/schema.sql)

That creates the tables and policies Verge needs:

- `planner_runs`
- `planner_blocks`

### 3. Confirm it works

1. Sign in inside Verge
2. Ask Kai for a concrete schedule
3. Open Supabase Table Editor
4. Check:
   - `planner_runs`
   - `planner_blocks`

If rows appear there, Supabase is connected correctly.

## Model Providers

Verge supports multiple providers through environment variables:

- Cerebras
- Groq
- OpenRouter
- Gemini

The app can run in:

- `LLM_PROVIDER=auto`
- or a specific provider like `cerebras` / `gemini`

Example:

```bash
LLM_PROVIDER=auto

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free

GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant

CEREBRAS_API_KEY=
CEREBRAS_MODEL=qwen-3-235b-a22b-instruct-2507
```

### About the shared founder key

If you already have a working founder `.env.local`, your cofounder can use that same local file to run the same setup.

For public distribution, do **not** bake your private provider key into the app bundle. That would expose the key to anyone who downloads it.

For a real public launch, the correct setup is:

- deploy Verge with server-side env vars
- keep secrets on the server
- let the desktop/web client talk to your backend

### Hosted backend mode

Verge now supports a hosted Kai backend directly.

If `NEXT_PUBLIC_KAI_API_BASE_URL` is set, the app sends Kai requests to:

```bash
https://verge-fresh.vercel.app/api/kai
```

instead of requiring the model provider keys locally.

That means a downloadable Verge build can work with:

```bash
NEXT_PUBLIC_KAI_API_BASE_URL=https://verge-fresh.vercel.app
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

and no local `GEMINI_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, or `GROQ_API_KEY`.

### Deploying the backend

The easiest production path is:

1. create a Vercel project from this repo
2. add server environment variables in Vercel:
   - `LLM_PROVIDER`
   - one or more provider keys like `CEREBRAS_API_KEY`
   - optional `KAI_CORS_ALLOW_ORIGIN`
3. deploy
4. copy the deployment URL into:

```bash
NEXT_PUBLIC_KAI_API_BASE_URL=https://verge-fresh.vercel.app
```

The `/api/kai` route now supports cross-origin requests, so the desktop app can call a hosted Verge backend safely without exposing the provider key.

## How Verge stores plans

When Kai creates a schedule, the structured output is saved as:

- one `planner_run`
- many `planner_blocks`

That is what powers:

- active task execution
- complete / skip state
- timer UI
- history retrieval
- future leaderboard points and streaks

## Asking Kai about previous schedules

Kai can now use saved Supabase history when the user asks things like:

- "What schedule did you make for me yesterday?"
- "Reuse my last schedule."
- "Compare this plan to the one from before."

Verge loads recent `planner_runs` and `planner_blocks`, turns them into planner context, and sends that context into the model when the user is clearly asking about history or when they intentionally open a saved run in the history rail.

## Development Scripts

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

- `app/` — Next app routes and API
- `components/auth/` — auth UI
- `components/kai/` — Kai chat, execution rail, timers, history UI
- `components/layout/` — desktop shell layout
- `electron/` — Electron main/preload/native desktop logic
- `lib/` — prompt logic, persistence helpers, Supabase helpers
- `supabase/` — SQL schema and backend setup

## Current Product Direction

The main product path from here is:

1. make the execution rail the center of the work session
2. persist timer + block progress more deeply
3. add history browsing beyond the right rail
4. add points / streaks / leaderboard on top of reliable completion data

## Troubleshooting

### Another dev server is already running

If Verge says another Next dev server is already running, stop the old one first:

```bash
lsof -i :3000
kill <PID>
```

### Supabase saves fail with permission errors

Make sure you ran the full schema in `supabase/schema.sql`. Verge needs both:

- row-level security policies
- table grants for `authenticated`

### The app opens but AI is in fallback mode

That means your selected live provider is unavailable or no model key is configured.

### The desktop app does not open

The web app may still be running at:

```text
http://localhost:3000
```

If Electron does not appear, restart `npm run dev`.
