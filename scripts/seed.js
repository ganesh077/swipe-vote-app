import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../server/env.js";
import { getSeedItems } from "../server/items.js";

loadEnv();

const force = process.argv.includes("--force");
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function assertOk(query, label) {
  const { error } = await query;
  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}

if (force) {
  await assertOk(supabase.from("vote_events").delete().gte("id", 0), "Clearing vote_events");
  await assertOk(supabase.from("votes").delete().neq("session_id", ""), "Clearing votes");
  await assertOk(supabase.from("items").delete().neq("id", ""), "Clearing items");
}

const items = getSeedItems().map((item) => ({
  id: item.id,
  label: item.label,
  description: item.description,
  category: item.category,
  image_url: item.imageUrl,
  accent: item.accent,
  sort_order: item.sortOrder
}));

const { error } = await supabase
  .from("items")
  .upsert(items, { onConflict: "id" });

if (error) {
  throw error;
}

console.log(`Seeded ${items.length} Supabase items${force ? " after reset" : ""}.`);
