# Street Pick

Street Pick is a mobile-first swipe-to-vote web app for choosing which street-food pop-ups should get a weekend market slot. Users swipe or tap yes/no on food concepts, then compare aggregate results across all users.

Live demo: `https://swipe-vote-app.vercel.app`

## Current State

- Deployed on Vercel with Supabase as the persistent backend.
- The starter deck contains 120 generated voting items; the live database may contain more because admins can add items without code changes.
- The current production app supports anonymous voting, email/password accounts, admin users, aggregate results, matches, undo, realtime result updates, and basic analytics.
- OAuth buttons were intentionally removed because Google/GitHub providers were not configured and email/password auth satisfies the assessment requirement.

## Tech Stack

- Frontend: plain HTML, CSS, and JavaScript optimized for a 390 x 844 mobile viewport.
- Backend/API: Node HTTP handlers, exposed locally and through Vercel API routes.
- Database/Auth/Realtime: Supabase Postgres, Supabase Auth, and Supabase Realtime.
- Data/visuals: generated street-food concepts and generated inline SVG card images.

Supabase is the source of truth. `localStorage` is used only to remember an anonymous browser session id; votes and aggregate results are stored in Supabase.

## Requirements Completed

| Requirement | Status |
| --- | --- |
| Pick and document a voting theme | Complete |
| Provide at least 100 items | Complete: 120 starter items |
| Each item has stable id, label/description, and image | Complete |
| Swipe right for yes and left for no | Complete |
| Tap Yes/No buttons | Complete |
| Visual gesture feedback | Complete: tilt, stamps, color/threshold feedback |
| Smooth next-card transition | Complete |
| Results view reachable by downward swipe or visible tab | Complete: both are supported |
| Aggregate yes/no counts across users | Complete |
| Sort/filter results meaningfully | Complete: sort plus category filter |
| Real backend persistence | Complete: Supabase Postgres |
| Required endpoints | Complete: `GET /items`, `POST /vote`, `GET /results` |
| Vote deduplication | Complete: database primary key plus upsert |
| End-of-deck state | Complete |
| README and AI usage notes | Complete |

## Stretch Goals Completed

- Anonymous session identity.
- Email/password sign-in.
- Admin and normal user roles.
- Signed-in users keep their own votes across reloads.
- Undo last swipe.
- Matches view for items the user liked that also have high global yes-rate.
- Supabase Realtime updates with polling fallback.
- Admin Account-tab UI for adding new items without code changes.
- CLI add-item script.
- Seed script for the starter deck.
- Basic analytics: total swipes, total sessions, and average decision time.

## Backend And Data Design

The required API surface is implemented in `server/server.js` and exposed on Vercel through `api/` route wrappers:

- `GET /items` returns the voting deck, including the current user's vote when a session id or signed-in user is present.
- `POST /vote` records a yes/no vote with request validation.
- `GET /results` returns every item with yes/no counts, yes-rate, divisiveness, the current user's vote, and analytics.

Vote deduplication is enforced in Supabase by `primary key (session_id, item_id)` on `public.votes`. The vote endpoint uses an upsert, so a user voting on the same item again replaces their previous choice instead of double-counting.

Admin-only item creation is checked twice: the server verifies the signed-in user's profile role, and Supabase RLS policies restrict item writes to admin profiles.

## Run Locally

Requirements:

- Node.js 22.5 or newer.
- A Supabase project.
- Supabase URL, anon key, and service-role key.

Setup:

```bash
npm install
cp .env.example .env
```

Open your Supabase project SQL editor and run the SQL in `supabase/schema.sql`.

Set these values in `.env`:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
ADMIN_CODE=street-admin
PUBLIC_SITE_URL=http://localhost:3000
```

Do not rely on `.vercel/.env.production.local` for local seeding; Vercel can leave secret values blank when pulling environment variables. The seed scripts need the real Supabase service-role key in `.env` or in the shell environment.

Seed the starter deck and run the app:

```bash
npm run seed -- --force
npm start
```

Open `http://localhost:3000`.

Useful commands:

```bash
npm run dev
npm run check
RUN_SUPABASE_SMOKE=1 npm run check
npm run add-item -- --label "Saffron Noodle Cart" --description "Hand-pulled noodles with chili oil and herbs." --category "Noodles" --accent "#2f9c95"
npm run seed:demo -- --force
npm run seed:demo -- --credits
```

`npm run check` runs static syntax checks and verifies that the seed generator still creates 100+ unique items. The live Supabase smoke check is opt-in because it depends on real project credentials and seeded rows.

`npm run seed:demo -- --force` is a short-demo helper that replaces the deck with 10 curated demo items and Wikimedia Commons food-photo URLs. Use the regular `npm run seed -- --force` command for the full 120-item assessment deck.

## Deploy To Vercel

The repo includes `vercel.json` and API handlers in `api/`. Set these Vercel production environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_CODE`
- `PUBLIC_SITE_URL`, for example `https://swipe-vote-app.vercel.app`

Supabase Auth also needs matching redirect settings:

- Site URL: `https://swipe-vote-app.vercel.app`
- Redirect URLs: `https://swipe-vote-app.vercel.app/**`
- Optional local development redirect: `http://localhost:3000/**`

The app uses Supabase Realtime instead of an in-process WebSocket server, which keeps it compatible with Vercel's serverless runtime.

## Data And Image Sources

The starter items are generated food-pop-up concepts from `server/items.js` and seeded by `scripts/seed.js`. Their default visuals are generated inline SVG cards created by the app code, not photos of real people or third-party assets.

Admin-added items may optionally use a user-supplied image URL. The live demo currently includes at least one admin-added item.

The optional 10-item demo seed in `scripts/seed-demo.js` uses Wikimedia Commons food photos. Run `npm run seed:demo -- --credits` to print image credits and licenses.

## AI Usage

AI usage is documented in `AI_NOTES.md`. In short, Codex/ChatGPT was used for scaffolding, Supabase integration, gesture logic, debugging, review, README updates, and the final reflection. I reviewed, tested, and adjusted the implementation rather than accepting generated output blindly.

## Known Issues And Limits

- New email/password users must confirm their email before signing in when Supabase email confirmation is enabled.
- Undo is limited to the most recent vote in the current browser session.
- `npm run seed -- --force` resets Supabase items and votes, including custom items added with the admin UI or CLI.
- OAuth is not configured; the app uses email/password auth.
- Production deployment is live, but a screen recording is not stored in this repository.
