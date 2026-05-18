import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../server/env.js";

loadEnv();

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = part.slice(2).split("=", 2);
    const key = rawKey.trim();
    const value = inlineValue ?? argv[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }

    args[key] = value;
  }

  return args;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function fail(message) {
  console.error(message);
  console.error("");
  console.error("Usage:");
  console.error('  npm run add-item -- --label "Saffron Noodle Cart" --description "Hand-pulled noodles with chili oil." --category "Noodles" --accent "#2f9c95"');
  process.exit(1);
}

function validateAccent(value) {
  if (!value) {
    return "#2f9c95";
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    fail("--accent must be a hex color like #2f9c95.");
  }

  return value;
}

function validateImageUrl(value, id) {
  const imageUrl = value?.trim() || `/api/images/${id}.svg`;
  if (imageUrl.startsWith("/")) {
    return imageUrl;
  }

  try {
    const url = new URL(imageUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return imageUrl;
    }
  } catch {
    // Fall through to the user-facing error.
  }

  fail("--image-url must be http(s) or a local path beginning with /.");
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  fail("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const args = parseArgs(process.argv.slice(2));
const label = args.label?.trim();
const description = args.description?.trim();
const category = args.category?.trim();

if (!label || label.length < 3) {
  fail("--label is required and must be at least 3 characters.");
}

if (!description || description.length < 8) {
  fail("--description is required and must be at least 8 characters.");
}

if (!category || category.length < 2) {
  fail("--category is required and must be at least 2 characters.");
}

const id = args.id ? slugify(args.id) : slugify(label);
if (!/^[a-z0-9-]{3,100}$/.test(id)) {
  fail("--id must contain letters, numbers, or dashes after slugging.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const accent = validateAccent(args.accent);
const existing = await supabase
  .from("items")
  .select("sort_order")
  .eq("id", id)
  .maybeSingle();

if (existing.error) {
  throw existing.error;
}

const maxSortOrder = await supabase
  .from("items")
  .select("sort_order")
  .order("sort_order", { ascending: false })
  .limit(1);

if (maxSortOrder.error) {
  throw maxSortOrder.error;
}

const sortOrder = existing.data?.sort_order ?? (maxSortOrder.data[0]?.sort_order || 0) + 1;
const imageUrl = validateImageUrl(args["image-url"], id);
const { error } = await supabase.from("items").upsert({
  id,
  label,
  description,
  category,
  image_url: imageUrl,
  accent,
  sort_order: sortOrder
}, { onConflict: "id" });

if (error) {
  throw error;
}

console.log(`${existing.data ? "Updated" : "Added"} item: ${label}`);
console.log(`id: ${id}`);
console.log(`imageUrl: ${imageUrl}`);
console.log(`sortOrder: ${sortOrder}`);
