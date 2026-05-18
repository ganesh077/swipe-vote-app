import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { getSeedItems } from "../server/items.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const filesToParse = [
  "server/env.js",
  "server/server.js",
  "public/app.js",
  "scripts/seed.js",
  "scripts/add-item.js",
  "scripts/smoke-test.js"
];

for (const file of filesToParse) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: projectRoot,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const seedItems = getSeedItems();
const uniqueIds = new Set(seedItems.map((item) => item.id));
if (seedItems.length < 100 || uniqueIds.size !== seedItems.length) {
  throw new Error(`Seed data must contain at least 100 unique items. Found ${seedItems.length} items and ${uniqueIds.size} ids.`);
}

if (process.env.RUN_SUPABASE_SMOKE !== "1") {
  console.log("Static checks passed. Live Supabase smoke skipped; set RUN_SUPABASE_SMOKE=1 with Supabase env vars to run it.");
  process.exit(0);
}

for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[name]) {
    throw new Error(`${name} is required for RUN_SUPABASE_SMOKE=1.`);
  }
}

if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is required for RUN_SUPABASE_SMOKE=1.");
}

const server = spawn(process.execPath, ["--no-warnings", "server/server.js"], {
  cwd: projectRoot,
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "pipe"]
});

let baseUrl = "";
let stderr = "";

server.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

function waitForServer() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start.\n${stderr}`));
    }, 5000);

    server.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        baseUrl = `http://localhost:${match[1]}`;
        resolve();
      }
    });
  });
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} failed: ${JSON.stringify(data)}`);
  }
  return data;
}

try {
  await waitForServer();
  await request("/config");
  const sessionId = `smoke_${crypto.randomUUID()}`;
  const { items } = await request(`/items?sessionId=${sessionId}`);
  if (!Array.isArray(items) || items.length < 100) {
    throw new Error(`Expected at least 100 Supabase items, got ${items.length}. Run npm run seed first.`);
  }

  const { results, analytics } = await request(`/results?sessionId=${sessionId}`);
  if (!Array.isArray(results) || results.length !== items.length || !analytics) {
    throw new Error("Results payload did not match the seeded item set.");
  }

  console.log("Live Supabase smoke passed: config, items, results, and analytics are reachable.");
} finally {
  server.kill();
}
