// app.js
//
// Security note: All dynamic content is passed through escHtml() before
// being inserted via innerHTML. This escapes &, <, >, and " — sufficient
// to prevent XSS from the self-controlled index.json data source.

const CONFIG = {
  // Update this to your actual GitHub username/repo before deploying
  privateRepo: "YOUR_USERNAME/topic-tracker",
  resultsPath: "./results/index.json",
};

// ---- Escape helper (used on ALL dynamic values before innerHTML) ----
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- State ----
let PAT = localStorage.getItem("tracker_pat") || null;
let indexData = {};
let sortMode = {}; // topicName → "newest" | "score"

// ---- Init ----
document.addEventListener("DOMContentLoaded", init);

async function init() {
  document.getElementById("setup-repo-name").textContent = CONFIG.privateRepo;
  document.getElementById("pat-save-btn").addEventListener("click", savePat);
  document.getElementById("setup-skip-btn").addEventListener("click", skipSetup);
  document.getElementById("refresh-btn").addEventListener("click", loadAndRender);

  if (!PAT) {
    showSetup();
  } else {
    showApp();
    await loadAndRender();
  }
}

function showSetup() {
  document.getElementById("setup-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function showApp() {
  document.getElementById("setup-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

function savePat() {
  const val = document.getElementById("pat-input").value.trim();
  if (val) {
    PAT = val;
    localStorage.setItem("tracker_pat", val);
  }
  showApp();
  loadAndRender();
}

function skipSetup() {
  showApp();
  loadAndRender();
}

// ---- Data loading ----
async function loadAndRender() {
  try {
    const res = await fetch(CONFIG.resultsPath + "?t=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    indexData = await res.json();
  } catch (e) {
    const el = document.getElementById("topics-container");
    el.textContent = "Could not load results: " + e.message;
    el.style.color = "#dc2626";
    el.style.padding = "1rem";
    return;
  }
  renderAll();
}

// ---- Rendering ----
function renderAll() {
  const container = document.getElementById("topics-container");
  container.innerHTML = "";

  let latest = null;
  for (const results of Object.values(indexData)) {
    for (const r of results) {
      if (!latest || r.fetched_at > latest) latest = r.fetched_at;
    }
  }
  if (latest) {
    document.getElementById("last-updated").textContent =
      "Updated " + timeAgo(latest);
  }

  const topicNames = Object.keys(indexData);
  if (topicNames.length === 0) {
    container.textContent = "No results yet. Waiting for first poll run.";
    container.style.padding = "1rem";
    return;
  }

  for (const name of topicNames) {
    container.appendChild(buildTopicCard(name, indexData[name]));
  }
}

function buildTopicCard(topicName, results) {
  const card = document.createElement("div");
  card.className = "topic-card";

  const mode = sortMode[topicName] || "newest";
  const sorted = sortResults([...results], mode);
  const pending = results.find(r => r.pending_escalation);
  const urgency = inferUrgency(results);

  // All interpolated values are escaped — see escHtml() note at top
  const headerHtml = buildTopicHeader(topicName, urgency, results.length);
  const pendingHtml = pending ? buildPendingBanner(pending.pending_escalation) : "";
  const controlsHtml = buildControls();
  const feedHtml = buildSortBar(topicName, mode) + sorted.map(buildResultRow).join("");

  const feedEl = document.createElement("div");
  feedEl.className = "results-feed";
  feedEl.innerHTML = feedHtml;

  card.innerHTML = headerHtml + pendingHtml + controlsHtml;
  card.appendChild(feedEl);

  // Toggle feed
  card.querySelector(".topic-header").addEventListener("click", () => {
    feedEl.classList.toggle("hidden");
    card.querySelector(".chevron").classList.toggle("open");
  });

  // Sort buttons
  feedEl.querySelectorAll(".sort-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      sortMode[topicName] = btn.dataset.sort;
      renderAll();
    });
  });

  // Override buttons
  const wire = (sel, fn) => {
    const el = card.querySelector(sel);
    if (el) el.addEventListener("click", fn);
  };

  wire(".apply-override-btn", e => {
    e.stopPropagation();
    applyOverride(
      topicName, "escalate",
      card.querySelector(".level-select").value,
      card.querySelector(".hours-select").value,
    );
  });
  wire(".revert-btn", e => { e.stopPropagation(); applyOverride(topicName, "revert", "", "0"); });
  wire(".snooze-btn", e => { e.stopPropagation(); applyOverride(topicName, "snooze", "", "24"); });
  wire(".escalate-yes-btn", e => {
    e.stopPropagation();
    applyOverride(topicName, "escalate", e.target.dataset.level || "high", "48");
  });
  wire(".escalate-dismiss-btn", e => {
    e.stopPropagation();
    applyOverride(topicName, "dismiss", "", "0");
  });

  return card;
}

function inferUrgency(results) {
  const tags = results.flatMap(r => r.tags || []);
  if (tags.includes("drop_confirmed")) return "urgent";
  if (tags.includes("upcoming_drop")) return "high";
  if (tags.includes("restock_rumored")) return "medium";
  return "medium";
}

function buildTopicHeader(topicName, urgency, count) {
  return (
    '<div class="topic-header">' +
    '<span class="topic-name">' + escHtml(topicName) + "</span>" +
    '<span class="urgency-badge urgency-' + urgency + '">' + urgency + "</span>" +
    '<span class="topic-meta">' + count + " result" + (count !== 1 ? "s" : "") + "</span>" +
    '<span class="chevron open">&#9660;</span>' +
    "</div>"
  );
}

function buildPendingBanner(pending) {
  const level = pending.suggested_level || "high";
  return (
    '<div class="pending-banner">' +
    "<span>&#9889; Signal detected (<strong>" + escHtml(pending.trigger) + "</strong>)" +
    " \u2014 escalate to <strong>" + escHtml(level) + "</strong>?</span>" +
    '<button class="btn-small escalate-yes-btn" data-level="' + escHtml(level) + '">Escalate</button>' +
    '<button class="btn-small btn-secondary escalate-dismiss-btn">Dismiss</button>' +
    "</div>"
  );
}

function buildControls() {
  if (!PAT) {
    return (
      '<div class="topic-controls">' +
      '<span class="controls-locked">Add a PAT to enable override controls</span>' +
      "</div>"
    );
  }
  return (
    '<div class="topic-controls">' +
    '<div class="override-form">' +
    '<select class="level-select">' +
    "<option value=\"urgent\">Urgent</option>" +
    "<option value=\"high\" selected>High</option>" +
    "<option value=\"medium\">Medium</option>" +
    "</select>" +
    '<select class="hours-select">' +
    "<option value=\"24\">24h</option>" +
    "<option value=\"48\" selected>48h</option>" +
    "<option value=\"72\">72h</option>" +
    "</select>" +
    '<button class="btn-small apply-override-btn">Escalate</button>' +
    "</div>" +
    '<button class="btn-small btn-secondary revert-btn">Revert</button>' +
    '<button class="btn-small btn-secondary snooze-btn">Snooze 24h</button>' +
    "</div>"
  );
}

function buildSortBar(topicName, mode) {
  return (
    '<div class="results-sort-bar">Sort: ' +
    '<button class="sort-btn ' + (mode === "newest" ? "active" : "") +
    '" data-sort="newest">Newest</button>' +
    '<button class="sort-btn ' + (mode === "score" ? "active" : "") +
    '" data-sort="score">Score</button>' +
    "</div>"
  );
}

function buildResultRow(r) {
  const url = r.action_url || r.url;
  const score = r.novelty_score;
  const tags = (r.tags || []).filter(t => t !== "noise");
  const tagsHtml = tags.map(t =>
    '<span class="tag-pill tag-' + escHtml(t) + '">' +
    escHtml(t.replace(/_/g, " ")) + "</span>"
  ).join("");
  const priceHtml = r.price
    ? '<span class="source-badge" style="background:#dcfce7;color:#166534">' +
      escHtml(r.price) + "</span>"
    : "";

  return (
    '<div class="result-row">' +
    '<div class="result-title"><a href="' + escHtml(url) +
    '" target="_blank" rel="noopener">' + escHtml(r.title) + "</a></div>" +
    (r.summary ? '<div class="result-summary">' + escHtml(r.summary) + "</div>" : "") +
    '<div class="result-meta">' +
    '<span class="source-badge">' + escHtml(r.source) + "</span>" +
    priceHtml +
    (score !== null && score !== undefined ? scoreBarHtml(score) : "") +
    tagsHtml +
    '<span class="timestamp">' + timeAgo(r.fetched_at) + "</span>" +
    "</div>" +
    "</div>"
  );
}

// ---- Override actions ----
async function applyOverride(topic, action, level, durationHours) {
  if (!PAT) { alert("No PAT configured."); return; }
  const [owner, repo] = CONFIG.privateRepo.split("/");
  const apiUrl =
    "https://api.github.com/repos/" + owner + "/" + repo +
    "/actions/workflows/apply-override.yml/dispatches";
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + PAT,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { topic, action, level, duration_hours: String(durationHours) },
      }),
    });
    if (res.status === 204) {
      showToast("Applied: " + action + ' for "' + topic + '"');
    } else {
      showToast("Error " + res.status + ": " + await res.text(), true);
    }
  } catch (e) {
    showToast("Network error: " + e.message, true);
  }
}

// ---- Utilities ----
function sortResults(results, mode) {
  if (mode === "score") {
    return results.sort((a, b) => (b.novelty_score || 0) - (a.novelty_score || 0));
  }
  return results.sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
}

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

function scoreBarHtml(score) {
  const pct = Math.round(score * 100);
  const cls = score >= 0.8 ? "score-high" : score >= 0.6 ? "score-medium" : "score-low";
  return (
    '<div class="score-bar-wrap">' +
    '<div class="score-bar"><div class="score-bar-fill ' + cls +
    '" style="width:' + pct + '%"></div></div>' +
    '<span class="score-label">' + score.toFixed(2) + "</span>" +
    "</div>"
  );
}

function showToast(msg, isError) {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;bottom:1.5rem;right:1.5rem;" +
    "background:" + (isError ? "#dc2626" : "#1a1a1a") + ";" +
    "color:white;padding:0.75rem 1.25rem;border-radius:6px;" +
    "font-size:14px;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,0.2);max-width:320px;";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
