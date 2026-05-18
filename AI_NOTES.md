# AI Usage Notes

I used ChatGPT/Codex as the primary AI coding collaborator for this assessment. Codex generated the first pass of the project structure, seed data generator, API handlers, swipe gesture logic, mobile styling, Supabase migration, README updates, and this reflection. I reviewed and tested the code path by path instead of treating the generated output as final.

The biggest architecture change was moving the source of truth from a local SQLite prototype to Supabase. I asked the AI to compare what that meant for Vercel deployment, auth, realtime updates, and admin item creation. The final choice was Supabase Postgres/Auth/Realtime with a thin Node/Vercel API facade, because it keeps persistence hosted, avoids in-process WebSockets, and still protects the service-role key from the browser.

One concrete place I had to push back was the realtime/admin design. A local WebSocket server worked for a laptop demo but was a poor fit for Vercel, and putting privileged database writes directly in browser code would expose too much trust to the client. I kept Supabase Realtime for live updates, added RLS policies and grants, and left admin item creation behind a server endpoint that verifies the signed-in user's profile role.

The AI did better than expected at quickly mapping the assessment rubric to implementation details: deduped votes, result sorting, generated visuals, undo, matches, analytics, and admin tooling. It did worse on deployment assumptions; the initial design used local SQLite and a long-lived WebSocket server, which had to be rewritten once Vercel and Supabase became requirements. Other than Codex/ChatGPT, I did not use a separate AI assistant.
