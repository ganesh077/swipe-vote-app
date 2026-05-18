# Street Pick

Street Pick is a mobile-first swipe-to-vote app for choosing which street-food pop-ups should get a weekend market slot. Users vote yes or no on generated food-truck concepts, then compare aggregate results across all sessions.

## Run

Requires Node 22.5+ because the app uses Node's built-in SQLite module.

```bash
npm start
```

Open `http://localhost:3000`.

Useful commands:

```bash
npm run seed -- --force
npm run add-item -- --label "Saffron Noodle Cart" --description "Hand-pulled noodles with chili oil and herbs." --category "Noodles" --accent "#2f9c95"
npm run check
```

## Architecture

The app is intentionally small: a vanilla HTML/CSS/JS mobile frontend served by a Node HTTP server. The backend exposes `GET /items`, `POST /vote`, `DELETE /vote`, and `GET /results`, plus `/api/images/:id.svg` for deterministic generated item visuals. SQLite is the source of truth for items, sessions, current votes, and vote-event analytics. I chose SQLite because it keeps the local demo easy to run while still providing real persistence, transactions, constraints, and aggregate queries.

Vote deduplication is handled in the database with `UNIQUE (session_id, item_id)`. `POST /vote` uses an upsert, so a later vote from the same anonymous session on the same item replaces the prior choice instead of double-counting. The frontend stores only an anonymous session id in `localStorage`; votes and results always come from the server.

## Completed Requirements

- Core: 120 seeded items, each with a stable id, label, description, category, and generated SVG image path.
- Core: swipe right/left and tap Yes/No voting, with tilt, color hint, and threshold feedback.
- Core: downward card pull and visible tabs open the aggregate results view.
- Core: results show yes/no counts and yes rate for every item, sortable by most loved, most divisive, most voted, and least loved, with category filtering.
- Core: backend persistence via SQLite, with basic request validation and transaction-backed writes.
- Core: end-of-deck state links to results and matches.
- Stretch: anonymous identity, remembered votes across reloads, undo last swipe, matches view, polling-based result refresh, seed/admin script for adding items without code changes, and basic analytics.

## Known Issues

- The app is built for a local demo, not deployment. There is no authentication beyond the anonymous session id.
- Node's built-in SQLite API is still marked experimental in Node 22, so the npm scripts run Node with `--no-warnings`.
- Undo is limited to the most recent vote in the current browser session.
- `npm run seed -- --force` resets the SQLite database, including votes and custom items added with `npm run add-item`.
