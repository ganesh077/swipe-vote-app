import { openDatabase } from "../server/db.js";

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
  console.error("");
  console.error("Optional:");
  console.error("  --id custom-stable-id");
  console.error("  --image-url https://example.com/image.jpg");
  console.error("  --sort-order 121");
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

function validateSortOrder(value) {
  if (value === undefined) {
    return null;
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    fail("--sort-order must be a positive integer.");
  }

  return number;
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

const accent = validateAccent(args.accent);
const db = openDatabase();
const existing = db.prepare("SELECT sort_order AS sortOrder FROM items WHERE id = ?").get(id);
const nextSortOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS sortOrder FROM items").get().sortOrder;
const sortOrder = validateSortOrder(args["sort-order"]) ?? existing?.sortOrder ?? nextSortOrder;
const imageUrl = args["image-url"]?.trim() || `/api/images/${id}.svg`;

try {
  db.prepare(`
    INSERT INTO items (id, label, description, category, image_url, accent, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      description = excluded.description,
      category = excluded.category,
      image_url = excluded.image_url,
      accent = excluded.accent,
      sort_order = excluded.sort_order
  `).run(id, label, description, category, imageUrl, accent, sortOrder);

  console.log(`${existing ? "Updated" : "Added"} item: ${label}`);
  console.log(`id: ${id}`);
  console.log(`imageUrl: ${imageUrl}`);
  console.log(`sortOrder: ${sortOrder}`);
} catch (error) {
  if (String(error.message).includes("UNIQUE constraint failed: items.sort_order")) {
    fail(`sort_order ${sortOrder} is already used. Pick a different --sort-order or omit it.`);
  }

  throw error;
} finally {
  db.close();
}
