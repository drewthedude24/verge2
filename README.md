# Verge

Verge is a desktop-first planning app built with Next.js and Electron. You talk through your week, Kai helps shape a schedule, and the app runs inside a transparent desktop shell instead of feeling like a regular browser tab.

## What changed

- the Electron shell is now frameless, glassy, and desktop-oriented
- lint no longer fails on the Electron runtime files
- Next builds no longer crash when Supabase env vars are missing
- Gemini chat is routed through a safer server path with preview fallback mode
- the login, root page, and dashboard flow are easier to follow

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

```bash
cp .env.local.example .env.local
```

3. Add whichever credentials you have:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`

If Supabase is missing, Verge still runs in preview mode.
If Gemini is missing, Kai falls back to preview responses instead of breaking.

## Development

Run the web app and Electron shell together:

```bash
npm run dev
```

Run lint:

```bash
npm run lint
```

Build the Next standalone app:

```bash
npm run build:next
```

Package desktop builds:

```bash
npm run dist:mac
npm run dist:win
```

## Structure

- `app/` — Next app routes and API
- `components/auth/` — auth UI
- `components/kai/` — chat UI and state
- `components/layout/` — shared desktop shell
- `electron/` — Electron main/preload runtime
- `lib/` — prompts and config helpers

## Notes

- Set `OPEN_ELECTRON_DEVTOOLS=1` if you want devtools to open automatically in Electron.
- The home page is the main app surface now. `/dashboard` just redirects back to `/`.
