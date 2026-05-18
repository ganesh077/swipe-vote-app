import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `street-pick-${Date.now()}.sqlite`);
const server = spawn(process.execPath, ["--no-warnings", "server/server.js"], {
  cwd: path.resolve(import.meta.dirname, ".."),
  env: {
    ...process.env,
    PORT: "0",
    DB_PATH: dbPath
  },
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
      const output = chunk.toString();
      const match = output.match(/http:\/\/localhost:(\d+)/);
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

  const sessionId = `smoke_${crypto.randomUUID()}`;
  const { items } = await request(`/items?sessionId=${sessionId}`);
  if (!Array.isArray(items) || items.length < 100) {
    throw new Error(`Expected at least 100 items, got ${items.length}.`);
  }

  const firstItem = items[0];
  await request("/vote", {
    method: "POST",
    body: JSON.stringify({
      itemId: firstItem.id,
      choice: "yes",
      sessionId,
      decisionMs: 1200
    })
  });

  const { results, analytics } = await request(`/results?sessionId=${sessionId}`);
  const firstResult = results.find((item) => item.id === firstItem.id);

  if (!firstResult || firstResult.yesCount !== 1 || firstResult.noCount !== 0) {
    throw new Error("Vote aggregate did not update correctly.");
  }

  await request("/vote", {
    method: "POST",
    body: JSON.stringify({
      itemId: firstItem.id,
      choice: "no",
      sessionId,
      decisionMs: 900
    })
  });

  const updated = await request(`/results?sessionId=${sessionId}`);
  const updatedFirst = updated.results.find((item) => item.id === firstItem.id);

  if (!updatedFirst || updatedFirst.yesCount !== 0 || updatedFirst.noCount !== 1) {
    throw new Error("Vote dedup/upsert did not replace the prior choice.");
  }

  if (!analytics || analytics.totalSwipes < 1) {
    throw new Error("Analytics payload is missing swipe events.");
  }

  console.log("Smoke test passed: items, vote recording, results, and dedup are working.");
} finally {
  server.kill();
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
}
