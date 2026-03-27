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
    if (typeof topicsSubView !== 'undefined' && topicsSubView) renderTopicResults(topicsSubView);
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

// ── Stub render functions (filled in Tasks 6–8) ───────────────────────────
function renderHighlights() {}
function renderTopicList() {}
function renderSettings() {}

init();
