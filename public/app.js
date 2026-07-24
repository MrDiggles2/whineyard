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

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function render(items) {
  rowsEl.innerHTML = '';
  for (const item of items) {
    const tr = document.createElement('tr');
    const tags = Array.isArray(item.tags) ? item.tags.join(', ') : '';
    tr.innerHTML = `
      <td>${escapeHtml(formatDate(item.createdAt))}</td>
      <td class="feedback">${escapeHtml(item.feedback || '')}</td>
      <td>${escapeHtml(tags)}</td>
      <td>${escapeHtml(item.category || '')}</td>
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

load();
