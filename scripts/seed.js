import { openDatabase, seedItems } from "../server/db.js";

const force = process.argv.includes("--force");
const db = openDatabase();
const result = seedItems(db, { force });

if (result.skipped) {
  console.log(`Seed skipped: ${result.total} items already exist. Use npm run seed -- --force to reset.`);
} else {
  console.log(`Seeded ${result.inserted} items.`);
}

db.close();
