import { createReadStream, existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.js";

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const port = Number(process.env.PORT || 3000);
const authCookieName = "street_pick_auth";
const adminCode = process.env.ADMIN_CODE || "street-admin";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let adminClient = null;
let publicClient = null;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".ico", "image/x-icon"]
]);

const sessionPattern = /^[A-Za-z0-9_-]{12,120}$/;
const itemPattern = /^[a-z0-9-]{3,100}$/;

function getSupabaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    const error = new Error("Missing Supabase env vars. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.");
    error.statusCode = 500;
    throw error;
  }

  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

function getAdminClient() {
  const config = getSupabaseConfig();
  if (!adminClient) {
    adminClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  return adminClient;
}

function getPublicClient() {
  const config = getSupabaseConfig();
  if (!publicClient) {
    publicClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  return publicClient;
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

function sendError(res, status, message, details = undefined) {
  sendJson(res, status, { error: message, details });
}

function normalizePublicUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function publicSiteUrl(req) {
  const configuredUrl = normalizePublicUrl(process.env.PUBLIC_SITE_URL || process.env.SITE_URL);
  if (configuredUrl) {
    return configuredUrl;
  }

  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || req.headers.host || "localhost:3000";
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocol}://${host}/`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function validateSessionId(sessionId) {
  return typeof sessionId === "string" && sessionPattern.test(sessionId);
}

function validateItemId(itemId) {
  return typeof itemId === "string" && itemPattern.test(itemId);
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

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120;
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 120;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = new Map();

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) {
      continue;
    }
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

function encodeAuthCookie(session) {
  return Buffer.from(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  })).toString("base64url");
}

function decodeAuthCookie(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function authCookie(value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${authCookieName}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function mapItem(row) {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    category: row.category,
    imageUrl: row.image_url,
    accent: row.accent,
    sortOrder: row.sort_order,
    userChoice: row.userChoice ?? null
  };
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

async function getProfile(userId) {
  const { data, error } = await getAdminClient()
    .from("profiles")
    .select("id,email,role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function ensureProfile(user, role = "user") {
  const existing = await getProfile(user.id);
  if (existing) {
    return existing;
  }

  const email = normalizeEmail(user.email) || "unknown@example.invalid";
  const { data, error } = await getAdminClient()
    .from("profiles")
    .upsert({ id: user.id, email, role }, { onConflict: "id" })
    .select("id,email,role")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

async function getCurrentUser(req) {
  const bearerToken = getBearerToken(req);
  const cookieAuth = decodeAuthCookie(parseCookies(req).get(authCookieName));
  const accessToken = bearerToken || cookieAuth?.access_token;

  if (!accessToken) {
    return null;
  }

  const { data, error } = await getPublicClient().auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }

  const profile = await ensureProfile(data.user);
  return {
    id: data.user.id,
    email: profile?.email || data.user.email,
    role: profile?.role || "user"
  };
}

async function fetchItems() {
  const { data, error } = await getAdminClient()
    .from("items")
    .select("id,label,description,category,image_url,accent,sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return data.map(mapItem);
}

async function fetchSessionVotes(sessionId) {
  if (!sessionId) {
    return new Map();
  }

  const { data, error } = await getAdminClient()
    .from("votes")
    .select("item_id,choice")
    .eq("session_id", sessionId);

  if (error) {
    throw error;
  }

  return new Map(data.map((vote) => [vote.item_id, vote.choice]));
}

async function listItems(sessionId = null) {
  const [items, userVotes] = await Promise.all([
    fetchItems(),
    fetchSessionVotes(sessionId)
  ]);

  return items.map((item) => ({
    ...item,
    userChoice: userVotes.get(item.id) || null
  }));
}

async function getItemById(itemId) {
  const { data, error } = await getAdminClient()
    .from("items")
    .select("id,label,description,category,image_url,accent,sort_order")
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapItem(data) : null;
}

async function getResults(sessionId = null) {
  const [items, userVotes, votes] = await Promise.all([
    fetchItems(),
    fetchSessionVotes(sessionId),
    getAdminClient().from("votes").select("item_id,choice")
  ]);

  if (votes.error) {
    throw votes.error;
  }

  const counts = new Map();
  for (const vote of votes.data) {
    const current = counts.get(vote.item_id) || { yesCount: 0, noCount: 0 };
    if (vote.choice === "yes") {
      current.yesCount += 1;
    } else {
      current.noCount += 1;
    }
    counts.set(vote.item_id, current);
  }

  return items.map((item) => {
    const count = counts.get(item.id) || { yesCount: 0, noCount: 0 };
    const totalVotes = count.yesCount + count.noCount;
    const yesRate = totalVotes === 0 ? 0 : Math.round((count.yesCount / totalVotes) * 1000) / 10;
    const divisiveness = totalVotes === 0 ? 100 : Math.abs(50 - yesRate);

    return {
      ...item,
      yesCount: count.yesCount,
      noCount: count.noCount,
      totalVotes,
      userChoice: userVotes.get(item.id) || null,
      yesRate,
      divisiveness
    };
  });
}

async function getAnalytics() {
  const client = getAdminClient();
  const [{ data: events, error: eventError }, { data: votes, error: voteError }] = await Promise.all([
    client.from("vote_events").select("decision_ms"),
    client.from("votes").select("session_id")
  ]);

  if (eventError) {
    throw eventError;
  }
  if (voteError) {
    throw voteError;
  }

  const validDecisionTimes = events
    .map((event) => event.decision_ms)
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 120_000);
  const averageDecisionMs = validDecisionTimes.length === 0
    ? null
    : Math.round(validDecisionTimes.reduce((total, value) => total + value, 0) / validDecisionTimes.length);

  return {
    totalSwipes: events.length,
    totalSessions: new Set(votes.map((vote) => vote.session_id)).size,
    averageDecisionMs
  };
}

function sessionIdForRequest(req, clientSessionId) {
  return getCurrentUser(req).then((user) => ({
    user,
    sessionId: user ? `user_${user.id}` : clientSessionId
  }));
}

async function recordVote({ itemId, choice, sessionId, userId, decisionMs }) {
  const client = getAdminClient();
  const payload = {
    item_id: itemId,
    session_id: sessionId,
    user_id: userId || null,
    choice,
    decision_ms: decisionMs,
    updated_at: new Date().toISOString()
  };

  const { error } = await client
    .from("votes")
    .upsert(payload, { onConflict: "session_id,item_id" });

  if (error) {
    throw error;
  }

  const eventResult = await client.from("vote_events").insert({
    item_id: itemId,
    session_id: sessionId,
    user_id: userId || null,
    choice,
    decision_ms: decisionMs
  });

  if (eventResult.error) {
    throw eventResult.error;
  }
}

async function deleteVote({ itemId, sessionId }) {
  const { error } = await getAdminClient()
    .from("votes")
    .delete()
    .eq("item_id", itemId)
    .eq("session_id", sessionId);

  if (error) {
    throw error;
  }
}

async function saveItem({ id, label, description, category, imageUrl, accent }) {
  const client = getAdminClient();
  const existing = await getItemById(id);
  const sortOrder = existing?.sortOrder ?? await nextSortOrder();
  const { error } = await client.from("items").upsert({
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

  return getItemById(id);
}

async function nextSortOrder() {
  const { data, error } = await getAdminClient()
    .from("items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return data.length === 0 ? 1 : data[0].sort_order + 1;
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

async function handleConfig(req, res) {
  getSupabaseConfig();
  sendJson(res, 200, {
    supabaseUrl,
    supabaseAnonKey
  });
}

async function handleItems(req, res, url) {
  const sessionId = url.searchParams.get("sessionId");

  if (sessionId && !validateSessionId(sessionId)) {
    sendError(res, 400, "Invalid sessionId.");
    return;
  }

  const items = await listItems(sessionId);
  sendJson(res, 200, { items, total: items.length });
}

async function handleCreateItem(req, res) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") {
    sendError(res, 403, "Admin sign-in is required.");
    return;
  }

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

  const item = await saveItem({ id, label, description, category, imageUrl, accent });
  sendJson(res, 201, { ok: true, item });
}

async function handleResults(req, res, url) {
  const sessionId = url.searchParams.get("sessionId");

  if (sessionId && !validateSessionId(sessionId)) {
    sendError(res, 400, "Invalid sessionId.");
    return;
  }

  sendJson(res, 200, {
    results: await getResults(sessionId),
    analytics: await getAnalytics()
  });
}

async function handleVote(req, res) {
  const body = await readJson(req);
  const itemId = body.itemId;
  const choice = body.choice;
  const decisionMs = Number.isFinite(Number(body.decisionMs))
    ? Math.max(0, Math.min(120_000, Math.round(Number(body.decisionMs))))
    : null;
  const { user, sessionId } = await sessionIdForRequest(req, body.sessionId);

  if (!validateSessionId(sessionId)) {
    sendError(res, 400, "Invalid sessionId.");
    return;
  }

  if (!validateItemId(itemId) || !await getItemById(itemId)) {
    sendError(res, 400, "Unknown itemId.");
    return;
  }

  if (choice !== "yes" && choice !== "no") {
    sendError(res, 400, "choice must be 'yes' or 'no'.");
    return;
  }

  await recordVote({ itemId, choice, sessionId, userId: user?.id, decisionMs });
  const result = (await getResults(sessionId)).find((item) => item.id === itemId);
  sendJson(res, 200, { ok: true, result });
}

async function handleDeleteVote(req, res) {
  const body = await readJson(req);
  const { user, sessionId } = await sessionIdForRequest(req, body.sessionId);
  const itemId = body.itemId;

  if (!validateSessionId(sessionId)) {
    sendError(res, 400, "Invalid sessionId.");
    return;
  }

  if (!validateItemId(itemId) || !await getItemById(itemId)) {
    sendError(res, 400, "Unknown itemId.");
    return;
  }

  await deleteVote({ itemId, sessionId, userId: user?.id });
  sendJson(res, 200, { ok: true });
}

async function handleRegister(req, res) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = body.password;
  const requestedRole = body.role === "admin" ? "admin" : "user";

  if (!validateEmail(email)) {
    sendError(res, 400, "Enter a valid email address.");
    return;
  }

  if (!validatePassword(password)) {
    sendError(res, 400, "Password must be 8-120 characters.");
    return;
  }

  if (requestedRole === "admin" && body.adminCode !== adminCode) {
    sendError(res, 403, "Admin code is incorrect.");
    return;
  }

  const publicClient = getPublicClient();
  const { data, error } = await publicClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: publicSiteUrl(req)
    }
  });
  if (error) {
    sendError(res, 400, error.message);
    return;
  }

  if (!data.user) {
    sendError(res, 400, "Supabase did not return a user.");
    return;
  }

  const profileResult = await getAdminClient().from("profiles").upsert({
    id: data.user.id,
    email,
    role: requestedRole
  }, { onConflict: "id" });

  if (profileResult.error) {
    throw profileResult.error;
  }

  const login = await publicClient.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) {
    sendJson(res, 202, {
      ok: true,
      user: null,
      message: "Account created. If email confirmation is enabled, confirm the account before signing in."
    });
    return;
  }

  sendJson(res, 201, { ok: true, user: { id: data.user.id, email, role: requestedRole } }, {
    "Set-Cookie": authCookie(encodeAuthCookie(login.data.session), 60 * 60 * 24 * 7)
  });
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = body.password;

  if (!validateEmail(email) || !validatePassword(password)) {
    sendError(res, 400, "Invalid email or password.");
    return;
  }

  const { data, error } = await getPublicClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    sendError(res, 401, "Invalid email or password.");
    return;
  }

  const profile = await getProfile(data.user.id);
  sendJson(res, 200, {
    ok: true,
    user: {
      id: data.user.id,
      email: profile?.email || data.user.email,
      role: profile?.role || "user"
    }
  }, {
    "Set-Cookie": authCookie(encodeAuthCookie(data.session), 60 * 60 * 24 * 7)
  });
}

async function handleLogout(req, res) {
  sendJson(res, 200, { ok: true, user: null }, {
    "Set-Cookie": authCookie("", 0)
  });
}

async function handleMe(req, res) {
  sendJson(res, 200, { user: await getCurrentUser(req) });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && (pathname === "/api/config" || pathname === "/config")) {
      await handleConfig(req, res);
      return;
    }

    if (req.method === "GET" && (pathname === "/api/items" || pathname === "/items")) {
      await handleItems(req, res, url);
      return;
    }

    if (req.method === "POST" && (pathname === "/api/items" || pathname === "/items")) {
      await handleCreateItem(req, res);
      return;
    }

    if (req.method === "GET" && (pathname === "/api/auth/me" || pathname === "/auth/me")) {
      await handleMe(req, res);
      return;
    }

    if (req.method === "POST" && (pathname === "/api/auth/register" || pathname === "/auth/register")) {
      await handleRegister(req, res);
      return;
    }

    if (req.method === "POST" && (pathname === "/api/auth/login" || pathname === "/auth/login")) {
      await handleLogin(req, res);
      return;
    }

    if (req.method === "POST" && (pathname === "/api/auth/logout" || pathname === "/auth/logout")) {
      await handleLogout(req, res);
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

      const item = await getItemById(itemId);
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

if (process.argv[1] === __filename) {
  const server = http.createServer(handleRequest);

  server.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`Street Pick running at http://localhost:${actualPort}`);
  });
}

export { handleRequest };
