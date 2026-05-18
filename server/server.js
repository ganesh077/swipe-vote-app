import { createReadStream, existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSeeded, openDatabase } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const port = Number(process.env.PORT || 3000);
const db = openDatabase();

ensureSeeded(db);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".ico", "image/x-icon"]
]);

const sessionPattern = /^[A-Za-z0-9_-]{12,80}$/;
const itemPattern = /^[a-z0-9-]{3,100}$/;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, status, message, details = undefined) {
  sendJson(res, status, { error: message, details });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function validateSessionId(sessionId) {
  return typeof sessionId === "string" && sessionPattern.test(sessionId);
}

function validateItemId(itemId) {
  return typeof itemId === "string" && itemPattern.test(itemId);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validateAccent(value) {
  if (!value) {
    return "#2f9c95";
  }

  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }

  return value;
}

function validateImageUrl(value, itemId) {
  if (!value) {
    return `/api/images/${itemId}.svg`;
  }

  if (typeof value !== "string" || value.length > 500) {
    return null;
  }

  if (value.startsWith("/")) {
    return value;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
  }

  if (!body.trim()) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function getItemById(itemId) {
  return db.prepare(`
    SELECT
      id,
      label,
      description,
      category,
      image_url AS imageUrl,
      accent,
      sort_order AS sortOrder
    FROM items
    WHERE id = ?
  `).get(itemId);
}

function listItems(sessionId = null) {
  if (sessionId) {
    return db.prepare(`
      SELECT
        i.id,
        i.label,
        i.description,
        i.category,
        i.image_url AS imageUrl,
        i.accent,
        i.sort_order AS sortOrder,
        v.choice AS userChoice
      FROM items i
      LEFT JOIN votes v ON v.item_id = i.id AND v.session_id = ?
      ORDER BY i.sort_order ASC
    `).all(sessionId);
  }

  return db.prepare(`
    SELECT
      id,
      label,
      description,
      category,
      image_url AS imageUrl,
      accent,
      sort_order AS sortOrder,
      NULL AS userChoice
    FROM items
    ORDER BY sort_order ASC
  `).all();
}

function getResults(sessionId = null) {
  const rows = sessionId
    ? db.prepare(`
      SELECT
        i.id,
        i.label,
        i.description,
        i.category,
        i.image_url AS imageUrl,
        i.accent,
        i.sort_order AS sortOrder,
        SUM(CASE WHEN v.choice = 'yes' THEN 1 ELSE 0 END) AS yesCount,
        SUM(CASE WHEN v.choice = 'no' THEN 1 ELSE 0 END) AS noCount,
        COUNT(v.choice) AS totalVotes,
        uv.choice AS userChoice
      FROM items i
      LEFT JOIN votes v ON v.item_id = i.id
      LEFT JOIN votes uv ON uv.item_id = i.id AND uv.session_id = ?
      GROUP BY i.id
      ORDER BY i.sort_order ASC
    `).all(sessionId)
    : db.prepare(`
      SELECT
        i.id,
        i.label,
        i.description,
        i.category,
        i.image_url AS imageUrl,
        i.accent,
        i.sort_order AS sortOrder,
        SUM(CASE WHEN v.choice = 'yes' THEN 1 ELSE 0 END) AS yesCount,
        SUM(CASE WHEN v.choice = 'no' THEN 1 ELSE 0 END) AS noCount,
        COUNT(v.choice) AS totalVotes,
        NULL AS userChoice
      FROM items i
      LEFT JOIN votes v ON v.item_id = i.id
      GROUP BY i.id
      ORDER BY i.sort_order ASC
    `).all();

  return rows.map((row) => {
    const yesCount = Number(row.yesCount || 0);
    const noCount = Number(row.noCount || 0);
    const totalVotes = Number(row.totalVotes || 0);
    const yesRate = totalVotes === 0 ? 0 : Math.round((yesCount / totalVotes) * 1000) / 10;
    const divisiveness = totalVotes === 0 ? 100 : Math.abs(50 - yesRate);

    return {
      ...row,
      yesCount,
      noCount,
      totalVotes,
      yesRate,
      divisiveness
    };
  });
}

function getAnalytics() {
  const swipes = db.prepare("SELECT COUNT(*) AS count FROM vote_events").get().count;
  const sessions = db.prepare("SELECT COUNT(*) AS count FROM sessions").get().count;
  const avgDecisionMs = db.prepare(`
    SELECT AVG(decision_ms) AS average
    FROM vote_events
    WHERE decision_ms IS NOT NULL AND decision_ms BETWEEN 0 AND 120000
  `).get().average;

  return {
    totalSwipes: Number(swipes || 0),
    totalSessions: Number(sessions || 0),
    averageDecisionMs: avgDecisionMs === null ? null : Math.round(Number(avgDecisionMs))
  };
}

function recordVote({ itemId, choice, sessionId, decisionMs }) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO sessions (id, last_seen)
      VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP
    `).run(sessionId);

    db.prepare(`
      INSERT INTO votes (item_id, session_id, choice, decision_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, item_id) DO UPDATE SET
        choice = excluded.choice,
        decision_ms = excluded.decision_ms,
        updated_at = CURRENT_TIMESTAMP
    `).run(itemId, sessionId, choice, decisionMs);

    db.prepare(`
      INSERT INTO vote_events (item_id, session_id, choice, decision_ms)
      VALUES (?, ?, ?, ?)
    `).run(itemId, sessionId, choice, decisionMs);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function deleteVote({ itemId, sessionId }) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO sessions (id, last_seen)
      VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP
    `).run(sessionId);

    const result = db.prepare(`
      DELETE FROM votes
      WHERE item_id = ? AND session_id = ?
    `).run(itemId, sessionId);

    db.exec("COMMIT");
    return result.changes || 0;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function saveItem({ id, label, description, category, imageUrl, accent }) {
  const existing = getItemById(id);
  const sortOrder = existing?.sortOrder
    ?? db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS sortOrder FROM items").get().sortOrder;

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

  return getItemById(id);
}

function wrapText(value, maxLength = 18) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 3);
}

function darken(hex) {
  const value = hex.replace("#", "");
  const number = Number.parseInt(value, 16);
  const r = Math.max(0, ((number >> 16) & 255) - 46);
  const g = Math.max(0, ((number >> 8) & 255) - 46);
  const b = Math.max(0, (number & 255) - 46);
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function svgForItem(item) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(item.accent) ? item.accent : "#2f9c95";
  const shadow = darken(accent);
  const lines = wrapText(item.label);
  const labelTspans = lines
    .map((line, index) => `<tspan x="450" dy="${index === 0 ? 0 : 78}">${escapeXml(line)}</tspan>`)
    .join("");
  const ringOffset = (item.sortOrder % 8) * 16;
  const barOffset = (item.sortOrder % 5) * 42;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1120" viewBox="0 0 900 1120" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(item.label)}</title>
  <desc id="desc">${escapeXml(item.description)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${escapeXml(accent)}"/>
      <stop offset="1" stop-color="${escapeXml(shadow)}"/>
    </linearGradient>
    <pattern id="lines" width="90" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
      <rect width="90" height="90" fill="none"/>
      <rect x="${barOffset}" y="0" width="12" height="90" rx="6" fill="rgba(255,255,255,0.13)"/>
    </pattern>
  </defs>
  <rect width="900" height="1120" rx="0" fill="#f7f1e6"/>
  <rect x="40" y="40" width="820" height="1040" rx="34" fill="url(#bg)"/>
  <rect x="40" y="40" width="820" height="1040" rx="34" fill="url(#lines)"/>
  <circle cx="450" cy="372" r="${210 + ringOffset}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="32"/>
  <circle cx="450" cy="372" r="168" fill="rgba(255,255,255,0.92)"/>
  <circle cx="450" cy="372" r="116" fill="${escapeXml(accent)}" opacity="0.9"/>
  <path d="M310 650 C390 600 510 600 590 650 L630 742 C532 802 368 802 270 742 Z" fill="rgba(255,255,255,0.93)"/>
  <path d="M304 650 C392 690 508 690 596 650" fill="none" stroke="${escapeXml(shadow)}" stroke-width="22" stroke-linecap="round" opacity="0.78"/>
  <text x="450" y="388" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="70" font-weight="800" fill="#ffffff" letter-spacing="2">${escapeXml(item.category.toUpperCase())}</text>
  <text x="450" y="870" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="800" fill="#ffffff">${labelTspans}</text>
  <text x="450" y="1002" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="rgba(255,255,255,0.72)">STREET PICK</text>
</svg>`;
}

function sendSvg(res, item) {
  const body = svgForItem(item);
  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=86400",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  const decoded = decodeURIComponent(pathname);
  const requestedPath = decoded === "/" ? "/index.html" : decoded;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    sendError(res, 404, "Not found.");
    return;
  }

  const extension = path.extname(filePath);
  const contentType = mimeTypes.get(extension) || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(res);
}

async function handleItems(req, res, url) {
  const sessionId = url.searchParams.get("sessionId");

  if (sessionId && !validateSessionId(sessionId)) {
    sendError(res, 400, "Invalid sessionId.");
    return;
  }

  sendJson(res, 200, {
    items: listItems(sessionId),
    total: db.prepare("SELECT COUNT(*) AS count FROM items").get().count
  });
}

async function handleCreateItem(req, res) {
  const body = await readJson(req);
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const requestedId = typeof body.id === "string" ? body.id.trim() : "";
  const id = requestedId ? slugify(requestedId) : slugify(label);
  const accent = validateAccent(body.accent);
  const imageUrl = validateImageUrl(body.imageUrl, id);

  if (label.length < 3 || label.length > 80) {
    sendError(res, 400, "Label must be 3-80 characters.");
    return;
  }

  if (description.length < 8 || description.length > 240) {
    sendError(res, 400, "Description must be 8-240 characters.");
    return;
  }

  if (category.length < 2 || category.length > 40) {
    sendError(res, 400, "Category must be 2-40 characters.");
    return;
  }

  if (!validateItemId(id)) {
    sendError(res, 400, "Item id must become a 3-100 character slug.");
    return;
  }

  if (!accent) {
    sendError(res, 400, "Accent must be a hex color like #2f9c95.");
    return;
  }

  if (!imageUrl) {
    sendError(res, 400, "Image URL must be http(s) or a local path.");
    return;
  }

  const item = saveItem({ id, label, description, category, imageUrl, accent });
  sendJson(res, 201, { ok: true, item });
}

async function handleResults(req, res, url) {
  const sessionId = url.searchParams.get("sessionId");

  if (sessionId && !validateSessionId(sessionId)) {
    sendError(res, 400, "Invalid sessionId.");
    return;
  }

  sendJson(res, 200, {
    results: getResults(sessionId),
    analytics: getAnalytics()
  });
}

async function handleVote(req, res) {
  const body = await readJson(req);
  const { itemId, choice, sessionId } = body;
  const decisionMs = Number.isFinite(Number(body.decisionMs))
    ? Math.max(0, Math.min(120_000, Math.round(Number(body.decisionMs))))
    : null;

  if (!validateSessionId(sessionId)) {
    sendError(res, 400, "Invalid sessionId.");
    return;
  }

  if (!validateItemId(itemId) || !getItemById(itemId)) {
    sendError(res, 400, "Unknown itemId.");
    return;
  }

  if (choice !== "yes" && choice !== "no") {
    sendError(res, 400, "choice must be 'yes' or 'no'.");
    return;
  }

  recordVote({ itemId, choice, sessionId, decisionMs });

  const result = getResults(sessionId).find((item) => item.id === itemId);
  sendJson(res, 200, { ok: true, result });
}

async function handleDeleteVote(req, res) {
  const body = await readJson(req);
  const { itemId, sessionId } = body;

  if (!validateSessionId(sessionId)) {
    sendError(res, 400, "Invalid sessionId.");
    return;
  }

  if (!validateItemId(itemId) || !getItemById(itemId)) {
    sendError(res, 400, "Unknown itemId.");
    return;
  }

  const removed = deleteVote({ itemId, sessionId });
  sendJson(res, 200, { ok: true, removed });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && (pathname === "/api/items" || pathname === "/items")) {
      await handleItems(req, res, url);
      return;
    }

    if (req.method === "POST" && (pathname === "/api/items" || pathname === "/items")) {
      await handleCreateItem(req, res);
      return;
    }

    if (req.method === "GET" && (pathname === "/api/results" || pathname === "/results")) {
      await handleResults(req, res, url);
      return;
    }

    if (req.method === "POST" && (pathname === "/api/vote" || pathname === "/vote")) {
      await handleVote(req, res);
      return;
    }

    if (req.method === "DELETE" && (pathname === "/api/vote" || pathname === "/vote")) {
      await handleDeleteVote(req, res);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/images/") && pathname.endsWith(".svg")) {
      const itemId = pathname.split("/").pop().replace(/\.svg$/, "");
      if (!validateItemId(itemId)) {
        sendError(res, 400, "Invalid image id.");
        return;
      }

      const item = getItemById(itemId);
      if (!item) {
        sendError(res, 404, "Image not found.");
        return;
      }

      sendSvg(res, item);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(req, res, pathname);
      return;
    }

    sendError(res, 405, "Method not allowed.");
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(res, statusCode, statusCode === 500 ? "Internal server error." : error.message);
    if (statusCode === 500) {
      console.error(error);
    }
  }
}

const server = http.createServer(handleRequest);

server.listen(port, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`Street Pick running at http://localhost:${actualPort}`);
});
