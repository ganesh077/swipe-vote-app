# AI Usage Notes

I used ChatGPT/Codex as the primary AI coding collaborator for this assessment. Codex generated the first pass of the project structure, SQLite schema, seed data generator, API handlers, swipe gesture logic, mobile styling, README, and this reflection. I treated that output as a draft and reviewed the code path by path while testing the app locally.

The main architectural decision was to avoid a heavy frontend framework and use a small Node server with SQLite. I asked the AI to optimize for a local grading demo: fast setup, real persistence, no external image dependencies, and no localStorage as the source of truth. The generated SVG image endpoint came from that constraint, since it gives every item a reliable visual without stock-photo licensing or broken remote links.

One place I had to push back was persistence. A simpler AI-generated approach would have been a JSON file or client-only state because it is faster to scaffold, but that would have been weak for deduplication and aggregate queries. I kept the backend state in SQLite, added a `UNIQUE (session_id, item_id)` constraint, and used an upsert so repeated votes replace the current vote instead of inflating totals.

The AI did better than expected at quickly connecting product requirements to implementation details, especially the gesture thresholds, result sorting modes, and seed-data shape. It did worse on assuming runtime details; I had to verify the available Node version and SQLite support before committing to the dependency-light approach. If I had more time, I would ask the AI for a code review pass focused only on edge cases and then manually decide which findings were worth fixing.
