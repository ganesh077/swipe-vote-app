# Street Pick

Street Pick is a mobile-first swipe-to-vote app for choosing which street-food pop-ups should get a weekend market slot. Users vote yes or no on generated food-truck concepts, then compare aggregate results across all sessions.

## Run Locally

Create a Supabase project, open the SQL editor, and run `supabase/schema.sql`. Then add the server env vars:

```bash
cp .env.example .env
```

Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in your shell or deployment environment. The service-role key is used only by the server/API layer and must not be exposed in browser code.

Seed the 120 voting items:

```bash
npm install
npm run seed -- --force
npm start
```

Open `http://localhost:3000`.

Useful commands:

```bash
npm run add-item -- --label "Saffron Noodle Cart" --description "Hand-pulled noodles with chili oil and herbs." --category "Noodles" --accent "#2f9c95"
npm run check
RUN_SUPABASE_SMOKE=1 npm run check
```

`npm run check` runs static syntax checks and verifies that the seed generator still creates 100+ unique items. The live Supabase smoke check is opt-in because it depends on real project credentials and seeded rows.

## Architecture

Supabase is the source of truth for the backend: Postgres stores items, current deduped votes, vote-event analytics, and account profiles; Supabase Auth handles email/password accounts; Supabase Realtime publishes item/vote changes to the browser. The Node code is a thin local/Vercel API facade for the required endpoints (`GET /items`, `POST /vote`, `GET /results`), generated SVG images, validation, admin-code registration, and safe use of the service-role key.

Vote deduplication is enforced by `primary key (session_id, item_id)` on `public.votes`. `POST /vote` upserts into that table, so a user voting twice on the same item replaces the prior choice instead of double-counting. Anonymous users use a generated `sv_...` session id, while signed-in users vote through a stable `user_<supabase-user-id>` session.

## Completed Requirements

- Core: 120 seeded items, each with a stable id, label, description, category, and generated SVG image path.
- Core: swipe right/left and tap Yes/No voting, with tilt, color hint, and threshold feedback.
- Core: downward card pull and visible tabs open the aggregate results view.
- Core: results show yes/no counts and yes rate for every item, sortable by most loved, most divisive, most voted, and least loved, with category filtering.
- Core: backend persistence via Supabase Postgres, with RLS enabled, request validation, and database-backed deduplication.
- Core: end-of-deck state links to results and matches.
- Stretch: anonymous identity, Supabase email/password sign-in, admin/normal user roles, remembered account votes across reloads, undo last swipe, matches view, Supabase Realtime result refresh with polling fallback, Account-tab admin UI plus seed/admin script for adding items without code changes, and basic analytics.

## Deploy To Vercel

The repo includes `vercel.json` plus API handlers in `api/`. Set these Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_CODE`
- `PUBLIC_SITE_URL` set to the deployed app URL, for example `https://swipe-vote-app.vercel.app`

The app uses Supabase Realtime instead of an in-process WebSocket server, which keeps it compatible with Vercel's serverless runtime.

In Supabase, also set Authentication -> URL Configuration:

- Site URL: `https://swipe-vote-app.vercel.app`
- Redirect URLs: `https://swipe-vote-app.vercel.app/**`
- Optional local development redirect: `http://localhost:3000/**`

## Known Issues

- If Supabase email confirmation is enabled, newly created email/password users must confirm before signing in.
- Undo is limited to the most recent vote in the current browser session.
- `npm run seed -- --force` resets Supabase items and votes, including custom items added with the admin UI or CLI.
