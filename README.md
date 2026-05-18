# Street Pick

Street Pick is a mobile-first swipe-to-vote app for choosing which street-food pop-ups should get a weekend market slot. Users vote yes or no on generated food-truck concepts, then compare aggregate results across all sessions.

## Run

Requires Node 22.5+ because the app uses Node's built-in SQLite module.

```bash
npm start
```

Open `http://localhost:3000`.

The Account tab supports local email/password accounts. Normal users can vote with a stable account-backed session. Admin accounts can add new voting items from the same tab. For the local demo, the default admin code is `street-admin`; override it with `ADMIN_CODE=your-code npm start`.

Useful commands:

```bash
npm run seed -- --force
npm run add-item -- --label "Saffron Noodle Cart" --description "Hand-pulled noodles with chili oil and herbs." --category "Noodles" --accent "#2f9c95"
npm run check
```

## Architecture

The app is intentionally small: a vanilla HTML/CSS/JS mobile frontend served by a Node HTTP server. The backend exposes `GET /items`, admin-only `POST /items`, `POST /vote`, `DELETE /vote`, `GET /results`, local auth endpoints for register/login/logout/current user, and a `/realtime` WebSocket endpoint for result updates, plus `/api/images/:id.svg` for deterministic generated item visuals. SQLite is the source of truth for items, users, auth sessions, current votes, and vote-event analytics. I chose SQLite because it keeps the local demo easy to run while still providing real persistence, transactions, constraints, and aggregate queries.

Vote deduplication is handled in the database with `UNIQUE (session_id, item_id)`. `POST /vote` uses an upsert, so a later vote from the same anonymous or account-backed session on the same item replaces the prior choice instead of double-counting. The frontend stores only a guest session id in `localStorage`; account sessions use an HttpOnly server cookie, and votes/results always come from the server.

## Completed Requirements

- Core: 120 seeded items, each with a stable id, label, description, category, and generated SVG image path.
- Core: swipe right/left and tap Yes/No voting, with tilt, color hint, and threshold feedback.
- Core: downward card pull and visible tabs open the aggregate results view.
- Core: results show yes/no counts and yes rate for every item, sortable by most loved, most divisive, most voted, and least loved, with category filtering.
- Core: backend persistence via SQLite, with basic request validation and transaction-backed writes.
- Core: end-of-deck state links to results and matches.
- Stretch: anonymous identity, local email/password sign-in, admin/normal user roles, remembered account votes across reloads, undo last swipe, matches view, WebSocket result refresh with polling fallback, Account-tab admin UI plus seed/admin script for adding items without code changes, and basic analytics.

## Deployment Notes

This app is ready for a serverful Node host such as Render, Railway, Fly.io, or a small VM because it uses a long-lived WebSocket server and a local SQLite database. Vercel is not a good direct fit for this exact architecture: Vercel Functions do not act as WebSocket servers, and local SQLite files are not durable production storage in a serverless environment. To deploy this app on Vercel without losing functionality, replace SQLite with a hosted database and replace the in-process WebSocket server with a hosted realtime service such as Ably, Pusher, Supabase Realtime, or a separate WebSocket service.

## Known Issues

- The app is built for a local demo, not production deployment.
- Third-party OAuth and real email delivery are not wired because they require provider credentials and callback/SMTP configuration; the implemented local email/password auth covers the assessment's lightweight sign-in stretch.
- The local demo admin code defaults to `street-admin`; set `ADMIN_CODE` for a less obvious value.
- Node's built-in SQLite API is still marked experimental in Node 22, so the npm scripts run Node with `--no-warnings`.
- Undo is limited to the most recent vote in the current browser session.
- `npm run seed -- --force` resets the SQLite database, including votes and custom items added with `npm run add-item`.
