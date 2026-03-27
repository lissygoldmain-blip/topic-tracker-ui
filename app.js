// app.js
import {
  fetchIndex, loadReadSet, markRead,
  computeHighlights, sortResults,
  formatRelativeTime, formatAbsoluteTime,
  topicColor, topicBg, computeLastFetched, flatResults,
} from './data.js';

// ── App state ────────────────────────────────────────────────────────────
let index = {};       // { topicName: [result, ...] }
let readSet = new Set();
let loadError = false;
let topicsSubView = null; // null = topic list; string = topic name being viewed

// ── Tab switching ────────────────────────────────────────────────────────
const tabBtns = document.querySelectorAll('.tab-btn');
const screens = document.querySelectorAll('.screen');

function switchTab(tabName) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  screens.forEach(s => s.classList.toggle('active', s.dataset.tab === tabName));
  renderActiveScreen(tabName);
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function renderActiveScreen(tabName) {
  if (tabName === 'highlights') renderHighlights();
  if (tabName === 'topics') {
    if (topicsSubView) renderTopicResults(topicsSubView);
    else renderTopicList();
  }
  if (tabName === 'settings') renderSettings();
}

// ── Bootstrap ────────────────────────────────────────────────────────────
async function init() {
  readSet = loadReadSet();
  await loadData();
  switchTab('highlights');
}

async function loadData() {
  try {
    index = await fetchIndex();
    loadError = false;
  } catch (err) {
    console.error('Failed to load index.json', err);
    loadError = true;
    index = {};
  }
}

// ── Result card ───────────────────────────────────────────────────────────

function renderCard(result, { showTopicPill = true, showNoveltyDot = false } = {}) {
  const isRead = readSet.has(result.url);
  const div = document.createElement('div');
  div.className = 'result-card' + (isRead ? ' is-read' : '');

  const header = document.createElement('div');
  header.className = 'card-header';

  if (showTopicPill) {
    const pill = document.createElement('span');
    pill.className = 'topic-pill';
    pill.textContent = result.topic_name;
    pill.style.color = topicColor(result.topic_name);
    pill.style.background = topicBg(result.topic_name);
    header.appendChild(pill);
  }

  if (result.escalation_trigger) {
    const badge = document.createElement('span');
    badge.className = 'escalation-badge';
    badge.textContent = `⚡ ${result.escalation_trigger}`;
    header.appendChild(badge);
  }

  if (showNoveltyDot && result.novelty_score >= 0.8) {
    const dot = document.createElement('span');
    dot.className = 'novelty-dot ' + (result.novelty_score >= 0.9 ? 'high' : 'medium');
    header.appendChild(dot);
  }

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = result.title;

  const snippet = document.createElement('div');
  snippet.className = 'card-snippet';
  snippet.textContent = result.snippet;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const fetchedDate = new Date(result.fetched_at);
  meta.textContent = `${result.source} · ${formatRelativeTime(fetchedDate)}`;

  div.appendChild(header);
  div.appendChild(title);
  div.appendChild(snippet);
  div.appendChild(meta);

  div.addEventListener('click', () => openDetail(result));
  return div;
}

// ── Detail sheet ─────────────────────────────────────────────────────────

const detailSheet   = document.getElementById('detail-sheet');
const detailClose   = document.getElementById('detail-close');
const detailContent = document.getElementById('detail-content');
const detailBackdrop = document.getElementById('detail-backdrop');

function openDetail(result) {
  markRead(readSet, result.url);

  const fetchedDate = new Date(result.fetched_at);

  detailContent.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'detail-title';
  title.textContent = result.title;

  const meta = document.createElement('div');
  meta.className = 'detail-meta';
  meta.textContent = `${result.source} · ${formatAbsoluteTime(fetchedDate)}`;

  const summary = document.createElement('p');
  summary.className = 'detail-summary';
  summary.textContent = result.summary || result.snippet || '';

  detailContent.appendChild(title);
  detailContent.appendChild(meta);
  detailContent.appendChild(summary);

  if (result.tags && result.tags.length > 0) {
    const tagsRow = document.createElement('div');
    tagsRow.className = 'tags-row';
    result.tags.forEach(tag => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = tag;
      tagsRow.appendChild(pill);
    });
    detailContent.appendChild(tagsRow);
  }

  const score = document.createElement('div');
  score.className = 'detail-score';
  score.textContent = `Novelty: ${result.novelty_score ?? '—'}`;
  detailContent.appendChild(score);

  if (result.price) {
    const price = document.createElement('div');
    price.className = 'detail-price';
    price.textContent = `Price: ${result.price}`;
    detailContent.appendChild(price);
  }

  if (result.escalation_trigger) {
    const esc = document.createElement('div');
    esc.className = 'detail-escalation';
    esc.textContent = `⚡ ${result.escalation_trigger}`;
    detailContent.appendChild(esc);
  }

  const openBtn = document.createElement('a');
  openBtn.className = 'open-btn';
  openBtn.href = result.url;
  openBtn.target = '_blank';
  openBtn.rel = 'noopener noreferrer';
  openBtn.textContent = 'Open →';
  detailContent.appendChild(openBtn);

  detailSheet.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Re-render active screen to show updated read state
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) renderActiveScreen(activeBtn.dataset.tab);
}

function closeDetail() {
  detailSheet.classList.add('hidden');
  document.body.style.overflow = '';
}

detailClose.addEventListener('click', closeDetail);
detailBackdrop.addEventListener('click', closeDetail);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

// ── Shared utilities ───────────────────────────────────────────────────────

function errorState(onRetry) {
  const div = document.createElement('div');
  div.className = 'error-state';
  const p = document.createElement('p');
  p.textContent = 'Couldn\'t load results.';
  div.appendChild(p);
  const btn = document.createElement('button');
  btn.textContent = 'Retry';
  btn.addEventListener('click', onRetry);
  div.appendChild(btn);
  return div;
}

// ── Stub render functions (filled in Tasks 6–8) ───────────────────────────
function renderHighlights() {
  const screen = document.getElementById('screen-highlights');
  screen.innerHTML = '';

  const heading = document.createElement('h1');
  heading.className = 'screen-heading';
  heading.textContent = 'Highlights';
  screen.appendChild(heading);

  if (loadError) {
    screen.appendChild(errorState(() => { loadData().then(() => renderHighlights()); }));
    return;
  }

  const all = flatResults(index);
  const highlights = computeHighlights(all);
  const sorted = sortResults(highlights, readSet);

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nothing new to highlight.';
    screen.appendChild(empty);
    return;
  }

  sorted.forEach(result => {
    screen.appendChild(renderCard(result, { showTopicPill: true, showNoveltyDot: true }));
  });
}
function renderTopicList() {
  topicsSubView = null;
  const screen = document.getElementById('screen-topics');
  screen.innerHTML = '';

  const heading = document.createElement('h1');
  heading.className = 'screen-heading';
  heading.textContent = 'Topics';
  screen.appendChild(heading);

  if (loadError) {
    screen.appendChild(errorState(() => { loadData().then(() => renderTopicList()); }));
    return;
  }

  const topicNames = Object.keys(index);

  if (topicNames.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No topics yet.';
    screen.appendChild(empty);
    return;
  }

  topicNames.forEach(name => {
    const results = index[name] || [];
    const hasEscalation = results.some(r => r.escalation_trigger !== null);

    const row = document.createElement('div');
    row.className = 'topic-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'topic-row-name';
    nameEl.textContent = name;

    const meta = document.createElement('span');
    meta.className = 'topic-row-meta';
    meta.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;

    row.appendChild(nameEl);
    row.appendChild(meta);

    if (hasEscalation) {
      const esc = document.createElement('span');
      esc.className = 'escalation-badge topic-escalation-badge';
      esc.textContent = '⚡';
      row.appendChild(esc);
    }

    row.addEventListener('click', () => renderTopicResults(name));
    screen.appendChild(row);
  });
}

function renderTopicResults(topicName) {
  topicsSubView = topicName;
  const screen = document.getElementById('screen-topics');
  screen.innerHTML = '';

  const backBtn = document.createElement('button');
  backBtn.className = 'back-btn';
  backBtn.textContent = '← Topics';
  backBtn.addEventListener('click', renderTopicList);
  screen.appendChild(backBtn);

  const heading = document.createElement('h1');
  heading.className = 'screen-heading';
  heading.textContent = topicName;
  screen.appendChild(heading);

  const results = index[topicName] || [];

  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No results yet for this topic.';
    screen.appendChild(empty);
    return;
  }

  const sorted = sortResults(results, readSet);
  sorted.forEach(result => {
    screen.appendChild(renderCard(result, { showTopicPill: false, showNoveltyDot: false }));
  });
}

function renderSettings() {
  const screen = document.getElementById('screen-settings');
  screen.innerHTML = '';

  const heading = document.createElement('h1');
  heading.className = 'screen-heading';
  heading.textContent = 'Settings';
  screen.appendChild(heading);

  // Last fetched
  const lastSection = document.createElement('div');
  lastSection.className = 'settings-section';
  const lastLabel = document.createElement('div');
  lastLabel.className = 'settings-label';
  lastLabel.textContent = 'Last fetched';
  const lastValue = document.createElement('div');
  lastValue.className = 'settings-value';
  const lastDate = computeLastFetched(index);
  lastValue.textContent = lastDate ? formatAbsoluteTime(lastDate) : '\u2014';
  lastSection.appendChild(lastLabel);
  lastSection.appendChild(lastValue);
  screen.appendChild(lastSection);

  // Refresh button
  const refreshSection = document.createElement('div');
  refreshSection.className = 'settings-section';
  const refreshLabel = document.createElement('div');
  refreshLabel.className = 'settings-label';
  refreshLabel.textContent = 'Data';
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'refresh-btn';
  refreshBtn.textContent = 'Refresh';

  let feedbackTimeout = null;

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing\u2026';
    clearTimeout(feedbackTimeout);

    await loadData();
    // loadData() swallows exceptions and sets loadError — check the flag
    if (!loadError) {
      refreshBtn.textContent = 'Updated';
      feedbackTimeout = setTimeout(() => {
        refreshBtn.textContent = 'Refresh';
        refreshBtn.disabled = false;
        renderSettings(); // re-render to update last fetched
      }, 2000);
    } else {
      refreshBtn.textContent = 'Couldn\u2019t refresh \u2014 try again.';
      feedbackTimeout = setTimeout(() => {
        refreshBtn.textContent = 'Refresh';
        refreshBtn.disabled = false;
      }, 3000);
    }
  });

  refreshSection.appendChild(refreshLabel);
  refreshSection.appendChild(refreshBtn);
  screen.appendChild(refreshSection);
}

init();
