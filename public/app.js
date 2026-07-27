const state = {
  page: 1,
  pageSize: 20,
  total: 0,
};

const form = document.getElementById('filters');
const rowsEl = document.getElementById('rows');
const metaEl = document.getElementById('meta');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');

function hydrateFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of params.entries()) {
    const field = form.elements.namedItem(key);
    if (!field || value === '') continue;
    if ('value' in field) field.value = value;
  }
}

function paramsFromForm() {
  const data = new FormData(form);
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (String(value).trim() !== '') params.set(key, String(value));
  }
  params.set('page', String(state.page));
  params.set('pageSize', String(state.pageSize));
  return params;
}

const CATEGORY_LABELS = {
  COMPETITOR_CHURN: 'Competitor churn',
  PRICING: 'Pricing',
  NO_LONGER_NEEDED: 'No longer needed',
  ACCIDENT: 'Accident',
  PERFORMANCE: 'Performance',
  RELIABILITY: 'Reliability',
  NOISE: 'Noise',
  MISSING_FEATURES: 'Missing features',
  OTHER: 'Other',
};

const TAG_TONES = ['sage', 'clay', 'sky', 'plum', 'amber', 'teal'];

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString(undefined, { timeZoneName: 'short', hour12: false });
  } catch {
    return String(value);
  }
}

function humanizeCategory(value) {
  if (!value) return '';
  if (CATEGORY_LABELS[value]) return CATEGORY_LABELS[value];
  return String(value)
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function categoryClass(value) {
  if (!value) return '';
  return `category--${String(value).toLowerCase().replace(/_/g, '-')}`;
}

function tagTone(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_TONES[hash % TAG_TONES.length];
}

function renderTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return `<div class="tag-list">${tags
    .map(
      (tag) =>
        `<span class="tag-pill tag-pill--${tagTone(String(tag))}">${escapeHtml(String(tag))}</span>`,
    )
    .join('')}</div>`;
}

function renderCategory(value) {
  if (!value) return '';
  return `<span class="category ${categoryClass(value)}">${escapeHtml(humanizeCategory(value))}</span>`;
}

function render(items) {
  rowsEl.innerHTML = '';
  for (const item of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="no-break">${escapeHtml(formatDate(item.createdAt))}</td>
      <td class="feedback">${escapeHtml(item.feedback || '')}</td>
      <td>${renderTags(item.tags)}</td>
      <td>${renderCategory(item.category)}</td>
      <td>${item.actionability == null ? '' : escapeHtml(String(item.actionability))}</td>
      <td>${escapeHtml(item.status || '')}</td>
    `;
    rowsEl.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function load() {
  const params = paramsFromForm();
  const res = await fetch(`/api/feedback?${params}`);
  if (!res.ok) {
    metaEl.textContent = `Failed to load (${res.status})`;
    return;
  }
  const data = await res.json();
  state.total = data.total;
  state.page = data.page;
  state.pageSize = data.pageSize;
  render(data.items || []);
  const from = state.total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
  const to = Math.min(state.page * state.pageSize, state.total);
  metaEl.textContent = `Showing ${from}–${to} of ${state.total}`;
  prevBtn.disabled = state.page <= 1;
  nextBtn.disabled = state.page * state.pageSize >= state.total;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  state.page = 1;
  load();
});

prevBtn.addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    load();
  }
});

nextBtn.addEventListener('click', () => {
  if (state.page * state.pageSize < state.total) {
    state.page += 1;
    load();
  }
});

hydrateFiltersFromUrl();
load();
