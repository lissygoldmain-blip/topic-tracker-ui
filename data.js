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
