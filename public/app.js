import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sessionKey = "streetPickSessionId";
const sessionPattern = /^[A-Za-z0-9_-]{12,120}$/;
const guestSessionId = getSessionId();

const state = {
  sessionId: guestSessionId,
  items: [],
  results: [],
  analytics: null,
  currentUser: null,
  guestSessionId,
  view: "vote",
  sort: "most-loved",
  category: "all",
  isVoting: false,
  drag: null,
  lastVote: null,
  cardRenderedAt: performance.now(),
  poller: null,
  supabase: null,
  realtimeChannel: null,
  realtimeConnected: false
};

const elements = {
  tabs: Array.from(document.querySelectorAll(".tab-button")),
  viewButtons: Array.from(document.querySelectorAll("[data-view]")),
  views: {
    vote: document.getElementById("voteView"),
    results: document.getElementById("resultsView"),
    matches: document.getElementById("matchesView"),
    account: document.getElementById("accountView")
  },
  voteCard: document.getElementById("voteCard"),
  emptyState: document.getElementById("emptyState"),
  cardImage: document.getElementById("cardImage"),
  cardCategory: document.getElementById("cardCategory"),
  cardTitle: document.getElementById("cardTitle"),
  cardDescription: document.getElementById("cardDescription"),
  progressText: document.getElementById("progressText"),
  remainingText: document.getElementById("remainingText"),
  noButton: document.getElementById("noButton"),
  yesButton: document.getElementById("yesButton"),
  undoButton: document.getElementById("undoButton"),
  sortSelect: document.getElementById("sortSelect"),
  categorySelect: document.getElementById("categorySelect"),
  resultsList: document.getElementById("resultsList"),
  matchesList: document.getElementById("matchesList"),
  matchCount: document.getElementById("matchCount"),
  swipeCount: document.getElementById("swipeCount"),
  sessionCount: document.getElementById("sessionCount"),
  decisionTime: document.getElementById("decisionTime"),
  adminForm: document.getElementById("adminForm"),
  adminLabel: document.getElementById("adminLabel"),
  adminCategory: document.getElementById("adminCategory"),
  adminDescription: document.getElementById("adminDescription"),
  adminAccent: document.getElementById("adminAccent"),
  adminImageUrl: document.getElementById("adminImageUrl"),
  adminSubmit: document.getElementById("adminSubmit"),
  authForm: document.getElementById("authForm"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authAdminCode: document.getElementById("authAdminCode"),
  authStatus: document.getElementById("authStatus"),
  loginButton: document.getElementById("loginButton"),
  createUserButton: document.getElementById("createUserButton"),
  createAdminButton: document.getElementById("createAdminButton"),
  logoutButton: document.getElementById("logoutButton"),
  accountTitle: document.getElementById("accountTitle"),
  accountCard: document.getElementById("accountCard"),
  accountSummary: document.getElementById("accountSummary"),
  accountRoleHint: document.getElementById("accountRoleHint"),
  toast: document.getElementById("toast")
};

function getSessionId() {
  const stored = localStorage.getItem(sessionKey);
  if (stored && sessionPattern.test(stored)) {
    return stored;
  }

  const generated = `sv_${crypto.randomUUID()}`;
  localStorage.setItem(sessionKey, generated);
  return generated;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2600);
}

function setAuthStatus(message = "") {
  elements.authStatus.textContent = message;
  elements.authStatus.hidden = !message;
}

async function ensureSupabase() {
  if (state.supabase) {
    return state.supabase;
  }

  const config = await api("/config", { skipAuth: true });
  state.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return state.supabase;
}

async function currentAccessToken() {
  if (!state.supabase) {
    return null;
  }

  const { data } = await state.supabase.auth.getSession();
  return data.session?.access_token || null;
}

async function api(path, options = {}) {
  const { skipAuth = false, ...fetchOptions } = options;
  const headers = { "Content-Type": "application/json", ...(fetchOptions.headers || {}) };

  if (!skipAuth) {
    const token = await currentAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(path, {
    ...fetchOptions,
    headers
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { error: await response.text() };
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function sessionIdForUser(user) {
  return user ? `user_${user.id}` : state.guestSessionId;
}

function setCurrentUser(user) {
  state.currentUser = user;
  state.sessionId = sessionIdForUser(user);
  state.lastVote = null;
  renderAccount();
}

async function loadCurrentUser() {
  const data = await api("/auth/me");
  setCurrentUser(data.user);
}

function renderAccount() {
  const user = state.currentUser;
  const isSignedIn = Boolean(user);
  const isAdmin = user?.role === "admin";

  elements.accountTitle.textContent = isSignedIn ? "Account" : "Sign in";
  elements.authForm.hidden = isSignedIn;
  elements.accountCard.hidden = !isSignedIn;
  elements.adminForm.hidden = !isAdmin;
  elements.accountSummary.textContent = isSignedIn
    ? `${user.email} · ${user.role}`
    : "";
  elements.accountRoleHint.textContent = isAdmin
    ? "Admin tools are available below."
    : "Signed in as a normal user. Admin tools are hidden.";
}

function currentItem() {
  return state.items.find((item) => !item.userChoice) || null;
}

function votedCount() {
  return state.items.filter((item) => item.userChoice).length;
}

async function loadItems() {
  const data = await api(`/items?sessionId=${encodeURIComponent(state.sessionId)}`);
  state.items = data.items;
  renderVote();
  preloadNextImage();
}

async function loadResults({ render = true } = {}) {
  const data = await api(`/results?sessionId=${encodeURIComponent(state.sessionId)}`);
  state.results = data.results;
  state.analytics = data.analytics;
  if (render) {
    renderResults();
    renderMatches();
  }
}

function renderVote() {
  const item = currentItem();
  const total = state.items.length;
  const voted = votedCount();

  elements.progressText.textContent = `${voted} / ${total} voted`;
  elements.remainingText.textContent = total === 0 ? "Loading" : `${Math.max(total - voted, 0)} left`;
  elements.undoButton.disabled = !state.lastVote || state.isVoting;
  elements.noButton.disabled = !item || state.isVoting;
  elements.yesButton.disabled = !item || state.isVoting;

  if (!item) {
    elements.voteCard.hidden = true;
    elements.emptyState.hidden = false;
    return;
  }

  elements.emptyState.hidden = true;
  elements.voteCard.hidden = false;
  resetCardTransform({ instant: true });

  elements.cardImage.src = item.imageUrl;
  elements.cardImage.alt = item.label;
  elements.cardCategory.textContent = item.category;
  elements.cardTitle.textContent = item.label;
  elements.cardDescription.textContent = item.description;
  state.cardRenderedAt = performance.now();
}

function preloadNextImage() {
  const next = state.items.find((item) => !item.userChoice && item.id !== currentItem()?.id);
  if (!next) {
    return;
  }
  const image = new Image();
  image.src = next.imageUrl;
}

function setView(view) {
  state.view = view;

  for (const [name, element] of Object.entries(elements.views)) {
    element.classList.toggle("active", name === view);
  }

  for (const tab of elements.tabs) {
    tab.classList.toggle("active", tab.dataset.view === view);
  }

  if (view === "results" || view === "matches") {
    loadResults().catch(() => showToast("Results could not refresh."));
    startPolling();
  } else {
    stopPolling();
  }
}

function startPolling() {
  if (state.poller || state.realtimeConnected) {
    return;
  }

  state.poller = window.setInterval(() => {
    loadResults().catch(() => {});
  }, 8000);
}

function stopPolling() {
  if (state.poller) {
    window.clearInterval(state.poller);
    state.poller = null;
  }
}

async function connectRealtime() {
  if (state.realtimeChannel) {
    return;
  }

  await ensureSupabase();
  state.realtimeChannel = state.supabase
    .channel("street-pick-db-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, () => {
      loadResults().catch(() => {});
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => {
      Promise.all([loadItems(), loadResults()]).catch(() => {});
    })
    .subscribe((status) => {
      state.realtimeConnected = status === "SUBSCRIBED";
      if (state.realtimeConnected) {
        stopPolling();
      } else if (state.view === "results" || state.view === "matches") {
        startPolling();
      }
    });
}

function resetCardTransform({ instant = false } = {}) {
  const card = elements.voteCard;
  if (instant) {
    card.classList.add("is-resetting");
  }

  card.classList.remove("is-dragging", "fly-yes", "fly-no");
  card.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
  card.style.opacity = "1";
  card.style.setProperty("--yes-opacity", "0");
  card.style.setProperty("--no-opacity", "0");
  card.style.setProperty("--pull-opacity", "0");

  if (instant) {
    card.getBoundingClientRect();
    card.classList.remove("is-resetting");
  }
}

function rubberBand(value, limit) {
  return Math.tanh(value / limit) * limit;
}

function applyCardTransform(dx, dy) {
  const cardWidth = elements.voteCard.getBoundingClientRect().width || 360;
  const visualDx = rubberBand(dx, cardWidth * 0.62);
  const visualDy = clamp(dy, -80, 170);
  const rotate = clamp(visualDx / 18, -14, 14);
  const yesOpacity = clamp(dx / 150, 0, 1);
  const noOpacity = clamp(-dx / 150, 0, 1);
  const pullOpacity = Math.abs(dx) < 90 ? clamp(visualDy / 150, 0, 1) : 0;

  elements.voteCard.style.transform = `translate3d(${visualDx}px, ${visualDy}px, 0) rotate(${rotate}deg)`;
  elements.voteCard.style.setProperty("--yes-opacity", yesOpacity.toFixed(3));
  elements.voteCard.style.setProperty("--no-opacity", noOpacity.toFixed(3));
  elements.voteCard.style.setProperty("--pull-opacity", pullOpacity.toFixed(3));
}

function animateCardExit(choice) {
  const direction = choice === "yes" ? 1 : -1;
  const card = elements.voteCard;

  card.classList.remove("is-dragging", "fly-yes", "fly-no");
  card.style.setProperty("--yes-opacity", choice === "yes" ? "1" : "0");
  card.style.setProperty("--no-opacity", choice === "no" ? "1" : "0");
  card.style.setProperty("--pull-opacity", "0");
  card.style.transform = `translate3d(${direction * 118}vw, -18px, 0) rotate(${direction * 16}deg)`;
  card.style.opacity = "0";
}

function horizontalVoteThreshold() {
  return Math.min(82, elements.voteCard.getBoundingClientRect().width * 0.22);
}

function onPointerDown(event) {
  if (state.isVoting || !currentItem()) {
    return;
  }

  event.preventDefault();
  state.drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dx: 0,
    dy: 0
  };

  elements.voteCard.setPointerCapture(event.pointerId);
  elements.voteCard.classList.add("is-dragging");
}

function onPointerMove(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  state.drag.dx = event.clientX - state.drag.startX;
  state.drag.dy = event.clientY - state.drag.startY;
  applyCardTransform(state.drag.dx, state.drag.dy);
}

function onPointerUp(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) {
    return;
  }

  const { dx, dy } = state.drag;
  const threshold = horizontalVoteThreshold();
  state.drag = null;
  elements.voteCard.classList.remove("is-dragging");

  if (elements.voteCard.hasPointerCapture(event.pointerId)) {
    elements.voteCard.releasePointerCapture(event.pointerId);
  }

  if (dy > 120 && Math.abs(dx) < threshold) {
    resetCardTransform();
    setView("results");
    return;
  }

  if (dx > threshold) {
    submitVote("yes");
    return;
  }

  if (dx < -threshold) {
    submitVote("no");
    return;
  }

  resetCardTransform();
}

function onPointerCancel(event) {
  if (state.drag?.pointerId === event.pointerId) {
    state.drag = null;
    elements.voteCard.classList.remove("is-dragging");
    resetCardTransform();
  }
}

function onLostPointerCapture(event) {
  if (state.drag?.pointerId === event.pointerId) {
    state.drag = null;
    elements.voteCard.classList.remove("is-dragging");
    resetCardTransform();
  }
}

async function submitVote(choice) {
  const item = currentItem();
  if (!item || state.isVoting) {
    return;
  }

  state.isVoting = true;
  elements.undoButton.disabled = true;
  animateCardExit(choice);

  const decisionMs = Math.round(performance.now() - state.cardRenderedAt);
  await new Promise((resolve) => window.setTimeout(resolve, 190));

  try {
    await api("/vote", {
      method: "POST",
      body: JSON.stringify({
        itemId: item.id,
        choice,
        sessionId: state.sessionId,
        decisionMs
      })
    });

    item.userChoice = choice;
    state.lastVote = { itemId: item.id, choice };
    state.isVoting = false;
    renderVote();
    preloadNextImage();
    loadResults({ render: false }).catch(() => {});
  } catch (error) {
    state.isVoting = false;
    elements.voteCard.classList.remove("fly-yes", "fly-no");
    resetCardTransform();
    showToast(error.message);
    renderVote();
  }
}

async function undoLastVote() {
  if (!state.lastVote || state.isVoting) {
    return;
  }

  const { itemId } = state.lastVote;
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return;
  }

  state.isVoting = true;
  try {
    await api("/vote", {
      method: "DELETE",
      body: JSON.stringify({
        itemId,
        sessionId: state.sessionId
      })
    });

    item.userChoice = null;
    state.lastVote = null;
    state.isVoting = false;
    renderVote();
    loadResults({ render: false }).catch(() => {});
  } catch (error) {
    state.isVoting = false;
    showToast(error.message);
    renderVote();
  }
}

function categoryOptions() {
  return ["all", ...new Set(state.results.map((item) => item.category).sort())];
}

function syncCategorySelect() {
  const options = categoryOptions();
  const existing = Array.from(elements.categorySelect.options).map((option) => option.value);
  if (options.join("|") === existing.join("|")) {
    return;
  }

  elements.categorySelect.replaceChildren(
    ...options.map((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category === "all" ? "All" : category;
      return option;
    })
  );
  elements.categorySelect.value = options.includes(state.category) ? state.category : "all";
}

function sortedResults() {
  const rows = state.results
    .filter((item) => state.category === "all" || item.category === state.category)
    .slice();

  rows.sort((a, b) => {
    if (state.sort === "most-divisive") {
      return a.divisiveness - b.divisiveness || b.totalVotes - a.totalVotes || a.sortOrder - b.sortOrder;
    }
    if (state.sort === "most-voted") {
      return b.totalVotes - a.totalVotes || b.yesRate - a.yesRate || a.sortOrder - b.sortOrder;
    }
    if (state.sort === "least-loved") {
      return a.yesRate - b.yesRate || b.totalVotes - a.totalVotes || a.sortOrder - b.sortOrder;
    }
    return b.yesRate - a.yesRate || b.totalVotes - a.totalVotes || a.sortOrder - b.sortOrder;
  });

  return rows;
}

function renderResults() {
  syncCategorySelect();
  elements.sortSelect.value = state.sort;
  elements.categorySelect.value = state.category;

  if (state.analytics) {
    elements.swipeCount.textContent = String(state.analytics.totalSwipes);
    elements.sessionCount.textContent = String(state.analytics.totalSessions);
    elements.decisionTime.textContent = state.analytics.averageDecisionMs === null
      ? "--"
      : (state.analytics.averageDecisionMs / 1000).toFixed(1);
  }

  const rows = sortedResults();
  elements.resultsList.replaceChildren(
    ...rows.map((item, index) => createResultRow(item, index + 1))
  );
}

function renderMatches() {
  const matches = state.results
    .filter((item) => item.userChoice === "yes" && item.yesRate >= 70)
    .sort((a, b) => b.yesRate - a.yesRate || b.totalVotes - a.totalVotes);

  elements.matchCount.textContent = `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;

  if (matches.length === 0) {
    const empty = document.createElement("article");
    empty.className = "empty-state";
    empty.innerHTML = `
      <span class="empty-kicker">No matches yet</span>
      <h2>Keep voting.</h2>
      <p>Matches appear when your yes vote also has a global yes rate of 70% or higher.</p>
    `;
    elements.matchesList.replaceChildren(empty);
    return;
  }

  elements.matchesList.replaceChildren(
    ...matches.map((item, index) => createResultRow(item, index + 1))
  );
}

function createResultRow(item, rank) {
  const row = document.createElement("article");
  row.className = "result-row";

  const image = document.createElement("img");
  image.src = item.imageUrl;
  image.alt = item.label;

  const main = document.createElement("div");
  main.className = "result-main";

  const topLine = document.createElement("div");
  topLine.className = "result-topline";

  const title = document.createElement("h3");
  title.textContent = item.label;

  const rankElement = document.createElement("span");
  rankElement.className = "rank";
  rankElement.textContent = `#${rank}`;

  const meta = document.createElement("p");
  meta.className = "result-meta";
  meta.textContent = `${item.category} · ${item.totalVotes} votes`;

  const bar = document.createElement("div");
  bar.className = "bar";
  bar.style.setProperty("--yes-rate", `${item.yesRate}%`);

  const fill = document.createElement("span");
  bar.append(fill);

  const stats = document.createElement("div");
  stats.className = "result-stats";

  const yes = document.createElement("span");
  yes.textContent = `${item.yesRate.toFixed(1)}% yes`;

  const counts = document.createElement("span");
  counts.textContent = `${item.yesCount}Y / ${item.noCount}N`;

  const userVote = document.createElement("span");
  userVote.className = "user-vote";
  userVote.textContent = item.userChoice ? `You: ${item.userChoice}` : "You: --";

  topLine.append(title, rankElement);
  stats.append(yes, counts, userVote);
  main.append(topLine, meta, bar, stats);
  row.append(image, main);
  return row;
}

async function submitAdminItem(event) {
  event.preventDefault();

  const payload = {
    label: elements.adminLabel.value.trim(),
    category: elements.adminCategory.value.trim(),
    description: elements.adminDescription.value.trim(),
    accent: elements.adminAccent.value,
    imageUrl: elements.adminImageUrl.value.trim()
  };

  if (!payload.imageUrl) {
    delete payload.imageUrl;
  }

  elements.adminSubmit.disabled = true;
  elements.adminSubmit.textContent = "Adding...";

  try {
    const data = await api("/items", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    elements.adminForm.reset();
    elements.adminAccent.value = "#2f9c95";
    await Promise.all([loadItems(), loadResults()]);
    showToast(`Added ${data.item.label}.`);
    setView("vote");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.adminSubmit.disabled = false;
    elements.adminSubmit.textContent = "Add item";
  }
}

async function authenticate(mode, role = "user") {
  setAuthStatus("");
  const payload = {
    email: elements.authEmail.value.trim(),
    password: elements.authPassword.value
  };

  if (mode === "register") {
    payload.role = role;
    payload.adminCode = elements.authAdminCode.value;
  }

  try {
    const data = await api(mode === "login" ? "/auth/login" : "/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (data.user) {
      if (state.supabase) {
        await state.supabase.auth.signOut();
      }
      setCurrentUser(data.user);
      await Promise.all([loadItems(), loadResults()]);
      setAuthStatus("");
      elements.authForm.reset();
      showToast(`${mode === "login" ? "Signed in" : "Account created"} as ${data.user.role}.`);
      setView("vote");
      return;
    }

    setCurrentUser(null);
    elements.authPassword.value = "";
    elements.authAdminCode.value = "";
    const message = data.message || "Confirmation email sent. Confirm the account, then return here to sign in.";
    setAuthStatus(message);
    showToast(message);
  } catch (error) {
    setAuthStatus(error.message);
    showToast(error.message);
  }
}

async function submitLogin(event) {
  event.preventDefault();
  await authenticate("login");
}

async function createAccount(role) {
  await authenticate("register", role);
}

async function logout() {
  try {
    if (state.supabase) {
      await state.supabase.auth.signOut();
    }
    await api("/auth/logout", { method: "POST", body: JSON.stringify({}) });
    setCurrentUser(null);
    await Promise.all([loadItems(), loadResults()]);
    showToast("Logged out.");
    setView("vote");
  } catch (error) {
    showToast(error.message);
  }
}

function bindEvents() {
  elements.voteCard.addEventListener("pointerdown", onPointerDown);
  elements.voteCard.addEventListener("pointermove", onPointerMove);
  elements.voteCard.addEventListener("pointerup", onPointerUp);
  elements.voteCard.addEventListener("pointercancel", onPointerCancel);
  elements.voteCard.addEventListener("lostpointercapture", onLostPointerCapture);

  elements.noButton.addEventListener("click", () => submitVote("no"));
  elements.yesButton.addEventListener("click", () => submitVote("yes"));
  elements.undoButton.addEventListener("click", undoLastVote);
  elements.adminForm.addEventListener("submit", submitAdminItem);
  elements.authForm.addEventListener("submit", submitLogin);
  elements.createUserButton.addEventListener("click", () => createAccount("user"));
  elements.createAdminButton.addEventListener("click", () => createAccount("admin"));
  elements.logoutButton.addEventListener("click", logout);

  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  elements.sortSelect.addEventListener("change", () => {
    state.sort = elements.sortSelect.value;
    renderResults();
  });

  elements.categorySelect.addEventListener("change", () => {
    state.category = elements.categorySelect.value;
    renderResults();
  });
}

async function init() {
  bindEvents();
  try {
    await ensureSupabase();
    await loadCurrentUser().catch(() => setCurrentUser(null));
    connectRealtime().catch(() => startPolling());
    await Promise.all([loadItems(), loadResults({ render: false })]);
    renderResults();
    renderMatches();
  } catch (error) {
    showToast(error.message);
  }
}

init();
