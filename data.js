// data.js — pure data functions, no DOM

const READ_KEY = 'tracker_read_urls';

// ── Read/unread persistence ───────────────────────────────────────────────

export function loadReadSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function markRead(readSet, url) {
  readSet.add(url);
  localStorage.setItem(READ_KEY, JSON.stringify([...readSet]));
}

export function markUnread(readSet, url) {
  readSet.delete(url);
  localStorage.setItem(READ_KEY, JSON.stringify([...readSet]));
}

// ── Data fetching ────────────────────────────────────────────────────────

export async function fetchIndex() {
  const resp = await fetch('results/index.json');
  if (resp.status === 404) return {};
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ── Highlights filter ────────────────────────────────────────────────────

export function computeHighlights(allResults) {
  return allResults.filter(r => r.novelty_score >= 0.8 || r.escalation_trigger !== null);
}

// ── Sorting ──────────────────────────────────────────────────────────────
// Unread first (by novelty desc), then read (by novelty desc)

export function sortResults(results, readSet) {
  const unread = results.filter(r => !readSet.has(r.url));
  const read   = results.filter(r =>  readSet.has(r.url));
  const byNoveltyDesc = (a, b) => (b.novelty_score || 0) - (a.novelty_score || 0);
  return [...unread.sort(byNoveltyDesc), ...read.sort(byNoveltyDesc)];
}

// ── Relative time formatting ─────────────────────────────────────────────

export function formatRelativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH   = Math.floor(diffMs / 3_600_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH  <= 48) return `${diffH}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatAbsoluteTime(date) {
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Topic color (stable hash → hue) ─────────────────────────────────────

export function topicColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

export function topicBg(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 40%, 92%)`;
}

// ── Preferences (date filter, hide-read) ─────────────────────────────────

export function loadPrefs() {
  return {
    hideRead: JSON.parse(localStorage.getItem('tracker_hide_read') || 'false'),
    dateFilter: localStorage.getItem('tracker_date_filter') || '7d',
  };
}

export function savePrefs(prefs) {
  localStorage.setItem('tracker_hide_read', JSON.stringify(prefs.hideRead));
  localStorage.setItem('tracker_date_filter', prefs.dateFilter);
}

// ── Date range filter ─────────────────────────────────────────────────────

export function filterByAge(results, key) {
  const days = { '24h': 1, '7d': 7, 'all': null }[key] ?? 7;
  if (days === null) return results;
  const cutoff = Date.now() - days * 86_400_000;
  // Prefer published_at (actual article date) over fetched_at (when poller ran)
  return results.filter(r => {
    const dateStr = r.published_at || r.fetched_at;
    return dateStr && new Date(dateStr).getTime() >= cutoff;
  });
}

// Returns the best display date for a result (published > fetched)
export function resultDate(r) {
  return new Date(r.published_at || r.fetched_at);
}

// ── Last fetched ─────────────────────────────────────────────────────────

export function computeLastFetched(index) {
  let max = null;
  for (const results of Object.values(index)) {
    for (const r of results) {
      if (!r.fetched_at) continue;
      const t = new Date(r.fetched_at).getTime();
      if (!isNaN(t) && (max === null || t > max.getTime())) {
        max = new Date(r.fetched_at);
      }
    }
  }
  return max;
}

// ── Flat result list ─────────────────────────────────────────────────────

export function flatResults(index) {
  return Object.values(index).flat();
}

// ── Feedback (votes + notes) ──────────────────────────────────────────────

const FEEDBACK_KEY = 'tracker_feedback';
const GH_PAT_KEY   = 'tracker_gh_pat';
const GH_REPO_KEY  = 'tracker_gh_repo';

export function loadFeedback() {
  try { return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]'); }
  catch { return []; }
}

// Upsert mutates the array in place so callers share the same reference.
export function upsertFeedback(feedback, item) {
  const idx = feedback.findIndex(f => f.url === item.url);
  if (idx >= 0) feedback[idx] = item;
  else feedback.push(item);
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedback));
}

export function removeFeedback(feedback, url) {
  const idx = feedback.findIndex(f => f.url === url);
  if (idx >= 0) {
    feedback.splice(idx, 1);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedback));
  }
}

export function loadGhPat()       { return localStorage.getItem(GH_PAT_KEY)  || ''; }
export function saveGhPat(pat)    { localStorage.setItem(GH_PAT_KEY, pat); }
export function loadGhRepo()      { return localStorage.getItem(GH_REPO_KEY) || 'lissygoldmain-blip/topic-tracker'; }
export function saveGhRepo(repo)  { localStorage.setItem(GH_REPO_KEY, repo); }

// Writes feedback.json to the tracker repo via the GitHub Contents API.
// Requires a PAT with Contents:write on that repo.
export async function syncFeedbackToGitHub(pat, repo) {
  const feedback = loadFeedback();
  const json     = JSON.stringify(feedback, null, 2);
  // UTF-8-safe base64 encoding for GitHub API
  const bytes    = new TextEncoder().encode(json);
  const binary   = Array.from(bytes, b => String.fromCharCode(b)).join('');
  const content  = btoa(binary);

  const apiUrl = `https://api.github.com/repos/${repo}/contents/feedback.json`;
  const headers = { Authorization: `token ${pat}`, 'Content-Type': 'application/json' };

  // Fetch existing SHA so we can update rather than create
  let sha;
  try {
    const check = await fetch(apiUrl, { headers });
    if (check.ok) { sha = (await check.json()).sha; }
  } catch { /* file doesn't exist yet — first sync */ }

  const resp = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: 'chore: sync feedback',
      content,
      ...(sha ? { sha } : {}),
    }),
  });
  return resp.ok;
}
