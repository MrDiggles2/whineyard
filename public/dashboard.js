/* global Chart */

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
  UNCLASSIFIED: 'Unclassified',
};

const REASON_COLORS = [
  '#0b6e4f',
  '#1f4a6e',
  '#7a3b28',
  '#5a356e',
  '#6e4f12',
  '#1f5a52',
  '#4a4a55',
  '#5c355c',
  '#4a463f',
];

const form = document.getElementById('controls');
const metaEl = document.getElementById('meta');
const popMetaEl = document.getElementById('popMeta');
const popRowsEl = document.getElementById('popRows');
const actionabilityReasonEl = document.getElementById('actionabilityReason');

const charts = {
  byReason: null,
  volumeOverTime: null,
  reasonTrends: null,
  actionabilityDist: null,
  actionabilityTrend: null,
};

let latestPayload = null;

function humanizeCategory(value) {
  if (!value) return '';
  if (CATEGORY_LABELS[value]) return CATEGORY_LABELS[value];
  return String(value)
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatUtcDate(d) {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(d, days) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function defaultRange() {
  const to = new Date();
  const toUtc = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  const from = addUtcDays(toUtc, -29);
  return { from: formatUtcDate(from), to: formatUtcDate(toUtc) };
}

function setPreset(days) {
  const to = new Date();
  const toUtc = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  const from = addUtcDays(toUtc, -(days - 1));
  form.from.value = formatUtcDate(from);
  form.to.value = formatUtcDate(toUtc);
}

function queryParams() {
  const params = new URLSearchParams();
  params.set('from', form.from.value);
  params.set('to', form.to.value);
  if (form.includeUnscored.checked) params.set('includeUnscored', 'true');
  return params;
}

function drillThroughUrl({ category, from, to } = {}) {
  const params = new URLSearchParams();
  if (category && category !== 'UNCLASSIFIED') params.set('category', category);
  if (from || form.from.value) params.set('from', from || form.from.value);
  if (to || form.to.value) params.set('to', to || form.to.value);
  if (!form.includeUnscored.checked) params.set('status', 'scored');
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

function colorFor(index) {
  return REASON_COLORS[index % REASON_COLORS.length];
}

function makeDrillHandler(getPayload) {
  return (event, elements) => {
    if (!elements.length) return;
    const info = getPayload(event, elements[0]);
    if (!info) return;
    window.location.href = drillThroughUrl(info);
  };
}

function renderByReason(payload) {
  destroyChart('byReason');
  const labels = payload.byReason.map((r) => humanizeCategory(r.reason));
  const data = payload.byReason.map((r) => r.count);
  charts.byReason = new Chart(document.getElementById('byReasonChart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: payload.byReason.map((_, i) => colorFor(i)),
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      onClick: makeDrillHandler((_e, el) => {
        const row = payload.byReason[el.index];
        return row
          ? { category: row.reason, from: payload.range.from, to: payload.range.to }
          : null;
      }),
    },
  });
}

function renderVolumeOverTime(payload) {
  destroyChart('volumeOverTime');
  charts.volumeOverTime = new Chart(document.getElementById('volumeOverTimeChart'), {
    type: 'line',
    data: {
      labels: payload.volumeOverTime.map((r) => r.bucket),
      datasets: [
        {
          label: 'Volume',
          data: payload.volumeOverTime.map((r) => r.count),
          borderColor: '#0b6e4f',
          backgroundColor: 'rgba(11, 110, 79, 0.15)',
          fill: true,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } },
      onClick: makeDrillHandler((_e, el) => {
        const row = payload.volumeOverTime[el.index];
        return row ? { from: row.bucket, to: row.bucket } : null;
      }),
    },
  });
}

function renderReasonTrends(payload) {
  destroyChart('reasonTrends');
  const buckets = [...new Set(payload.reasonOverTime.map((r) => r.bucket))].sort();
  const reasons = [...new Set(payload.reasonOverTime.map((r) => r.reason))].sort();
  const shareMode = form.shareMode.checked;
  const totalsByBucket = {};
  for (const b of buckets) totalsByBucket[b] = 0;
  for (const row of payload.reasonOverTime) {
    totalsByBucket[row.bucket] = (totalsByBucket[row.bucket] || 0) + row.count;
  }

  const datasets = reasons.map((reason, i) => {
    const byBucket = Object.fromEntries(
      payload.reasonOverTime.filter((r) => r.reason === reason).map((r) => [r.bucket, r.count]),
    );
    return {
      label: humanizeCategory(reason),
      data: buckets.map((b) => {
        const count = byBucket[b] || 0;
        if (!shareMode) return count;
        const total = totalsByBucket[b] || 0;
        return total === 0 ? 0 : (count / total) * 100;
      }),
      borderColor: colorFor(i),
      backgroundColor: colorFor(i),
      tension: 0.2,
      reason,
    };
  });

  charts.reasonTrends = new Chart(document.getElementById('reasonTrendsChart'), {
    type: 'line',
    data: { labels: buckets, datasets },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: shareMode ? 'Share %' : 'Volume' },
        },
      },
      onClick: makeDrillHandler((_e, el) => {
        const ds = datasets[el.datasetIndex];
        const bucket = buckets[el.index];
        return ds && bucket
          ? { category: ds.reason, from: bucket, to: bucket }
          : null;
      }),
    },
  });
}

function renderActionabilityDist(payload) {
  destroyChart('actionabilityDist');
  charts.actionabilityDist = new Chart(document.getElementById('actionabilityDistChart'), {
    type: 'bar',
    data: {
      labels: payload.actionability.distribution.map((r) => String(r.score)),
      datasets: [
        {
          label: 'Count',
          data: payload.actionability.distribution.map((r) => r.count),
          backgroundColor: '#1f4a6e',
        },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } },
      onClick: (_event, elements) => {
        if (!elements.length) return;
        const row = payload.actionability.distribution[elements[0].index];
        if (!row) return;
        const params = new URLSearchParams();
        params.set('from', payload.range.from);
        params.set('to', payload.range.to);
        params.set('actionability', String(row.score));
        if (!form.includeUnscored.checked) params.set('status', 'scored');
        window.location.href = `/?${params}`;
      },
    },
  });
}

function renderActionabilityTrend(payload) {
  destroyChart('actionabilityTrend');
  const reason = actionabilityReasonEl.value;
  let series;
  if (!reason) {
    series = payload.actionability.avgOverTime.map((r) => ({
      bucket: r.bucket,
      avg: r.avg,
      reason: '',
    }));
  } else {
    series = payload.actionability.avgOverTimeByReason
      .filter((r) => r.reason === reason)
      .map((r) => ({ bucket: r.bucket, avg: r.avg, reason: r.reason }));
  }

  charts.actionabilityTrend = new Chart(document.getElementById('actionabilityTrendChart'), {
    type: 'line',
    data: {
      labels: series.map((r) => r.bucket),
      datasets: [
        {
          label: reason ? humanizeCategory(reason) : 'Avg actionability',
          data: series.map((r) => r.avg),
          borderColor: '#5a356e',
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { min: 1, max: 5 } },
      onClick: makeDrillHandler((_e, el) => {
        const row = series[el.index];
        return row
          ? {
              category: reason || undefined,
              from: row.bucket,
              to: row.bucket,
            }
          : null;
      }),
    },
  });
}

function populateActionabilityReasons(payload) {
  const selected = actionabilityReasonEl.value;
  const reasons = [...new Set(payload.actionability.avgOverTimeByReason.map((r) => r.reason))].sort();
  actionabilityReasonEl.innerHTML = '<option value="">All reasons</option>';
  for (const reason of reasons) {
    const opt = document.createElement('option');
    opt.value = reason;
    opt.textContent = humanizeCategory(reason);
    actionabilityReasonEl.appendChild(opt);
  }
  if (reasons.includes(selected)) actionabilityReasonEl.value = selected;
}

function renderPop(payload) {
  popMetaEl.textContent = `Current ${payload.range.from} → ${payload.range.to} vs prior ${payload.compareRange.from} → ${payload.compareRange.to}`;
  popRowsEl.innerHTML = '';
  for (const row of payload.periodOverPeriod) {
    const tr = document.createElement('tr');
    const pct =
      row.pctChange == null
        ? '—'
        : `${row.pctChange > 0 ? '+' : ''}${row.pctChange.toFixed(1)}%`;
    const pctClass =
      row.pctChange == null ? '' : row.pctChange > 0 ? 'delta-up' : row.pctChange < 0 ? 'delta-down' : '';
    tr.innerHTML = `
      <td><a href="${drillThroughUrl({ category: row.reason })}">${escapeHtml(humanizeCategory(row.reason))}</a></td>
      <td>${row.current}</td>
      <td>${row.prior}</td>
      <td class="${pctClass}">${pct}</td>
    `;
    popRowsEl.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderKpis(payload) {
  document.getElementById('kpiVolume').textContent = String(payload.totalVolume);
  document.getElementById('kpiActionability').textContent =
    payload.actionability.avg == null ? '—' : payload.actionability.avg.toFixed(2);
  document.getElementById('kpiGranularity').textContent = payload.range.granularity;
  metaEl.textContent = `Range ${payload.range.from} → ${payload.range.to} (${payload.range.granularity} buckets)`;
}

function renderAll(payload) {
  latestPayload = payload;
  renderKpis(payload);
  renderByReason(payload);
  renderVolumeOverTime(payload);
  renderReasonTrends(payload);
  renderActionabilityDist(payload);
  populateActionabilityReasons(payload);
  renderActionabilityTrend(payload);
  renderPop(payload);
}

async function load() {
  metaEl.textContent = 'Loading…';
  const res = await fetch(`/api/analytics?${queryParams()}`);
  if (!res.ok) {
    metaEl.textContent = `Failed to load (${res.status})`;
    return;
  }
  const payload = await res.json();
  renderAll(payload);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  load();
});

form.shareMode.addEventListener('change', () => {
  if (latestPayload) renderReasonTrends(latestPayload);
});

actionabilityReasonEl.addEventListener('change', () => {
  if (latestPayload) renderActionabilityTrend(latestPayload);
});

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setPreset(Number(btn.getAttribute('data-preset')));
    load();
  });
});

document.getElementById('exportCsv').addEventListener('click', () => {
  window.location.href = `/api/analytics/export?${queryParams()}`;
});

const defaults = defaultRange();
form.from.value = defaults.from;
form.to.value = defaults.to;
load();
