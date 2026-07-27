import test from 'node:test';
import assert from 'node:assert/strict';
import { isUuid } from '../src/uuid.js';
import { buildListFilters } from '../src/routes/feedback.js';
import {
  buildAnalyticsCsv,
  buildAnalyticsWhere,
  mergePeriodOverPeriod,
  pctChange,
  resolveAnalyticsRange,
} from '../src/routes/analytics.js';
import { buildJsonlLine, parseScoreFromResultLine } from '../src/batchFormat.js';
import { buildModelInput } from '../src/prompt.js';

test('isUuid accepts valid UUIDs', () => {
  assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
});

test('isUuid rejects invalid values', () => {
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(null), false);
});

test('buildListFilters builds tag category actionability clauses', () => {
  const { whereSql, params } = buildListFilters({
    tag: 'churn',
    category: 'PRICING',
    actionability: '3',
  });
  assert.match(whereSql, /tags @>/);
  assert.match(whereSql, /category =/);
  assert.match(whereSql, /actionability =/);
  assert.deepEqual(params, [JSON.stringify(['churn']), 'PRICING', 3]);
});

test('buildListFilters builds q and status clauses', () => {
  const { whereSql, params } = buildListFilters({
    q: 'post%gis_x',
    status: 'scored',
  });
  assert.match(whereSql, /feedback ILIKE/);
  assert.match(whereSql, /ESCAPE/);
  assert.match(whereSql, /status =/);
  assert.deepEqual(params, ['%post\\%gis\\_x%', 'scored']);
});

test('buildListFilters rejects invalid status', () => {
  assert.throws(() => buildListFilters({ status: 'bogus' }), /invalid status/);
});

test('buildListFilters builds from/to date clauses', () => {
  const { whereSql, params } = buildListFilters({
    from: '2026-07-01',
    to: '2026-07-31',
  });
  assert.match(whereSql, /created_at >=/);
  assert.match(whereSql, /created_at </);
  assert.equal((params[0] as Date).toISOString(), '2026-07-01T00:00:00.000Z');
  assert.equal((params[1] as Date).toISOString(), '2026-08-01T00:00:00.000Z');
});

test('buildListFilters rejects invalid from date', () => {
  assert.throws(() => buildListFilters({ from: 'not-a-date' }), /invalid date/);
});

test('resolveAnalyticsRange defaults to 30 days ending today', () => {
  const now = new Date('2026-07-27T15:00:00.000Z');
  const resolved = resolveAnalyticsRange(undefined, undefined, now);
  assert.equal(resolved.fromIso, '2026-06-28');
  assert.equal(resolved.toIso, '2026-07-27');
  assert.equal(resolved.granularity, 'day');
  assert.equal(resolved.compareFromIso, '2026-05-29');
  assert.equal(resolved.compareToIso, '2026-06-27');
});

test('resolveAnalyticsRange uses weekly granularity over 60 days', () => {
  const resolved = resolveAnalyticsRange('2026-01-01', '2026-04-01');
  assert.equal(resolved.granularity, 'week');
});

test('resolveAnalyticsRange rejects inverted range', () => {
  assert.throws(() => resolveAnalyticsRange('2026-07-10', '2026-07-01'), /invalid date range/);
});

test('pctChange returns null when prior is zero', () => {
  assert.equal(pctChange(5, 0), null);
  assert.equal(pctChange(40, 28), ((40 - 28) / 28) * 100);
});

test('mergePeriodOverPeriod merges reasons from both windows', () => {
  const rows = mergePeriodOverPeriod(
    [
      { reason: 'PRICING', count: 40 },
      { reason: 'NOISE', count: 2 },
    ],
    [
      { reason: 'PRICING', count: 28 },
      { reason: 'OTHER', count: 5 },
    ],
  );
  assert.deepEqual(rows.find((r) => r.reason === 'PRICING'), {
    reason: 'PRICING',
    current: 40,
    prior: 28,
    pctChange: ((40 - 28) / 28) * 100,
  });
  assert.deepEqual(rows.find((r) => r.reason === 'OTHER'), {
    reason: 'OTHER',
    current: 0,
    prior: 5,
    pctChange: -100,
  });
});

test('buildAnalyticsWhere defaults to scored-only', () => {
  const scored = buildAnalyticsWhere(false);
  assert.match(scored.whereSql, /status =/);
  assert.deepEqual(scored.params, ['scored']);
  const all = buildAnalyticsWhere(true);
  assert.equal(all.whereSql, 'TRUE');
  assert.deepEqual(all.params, []);
});

test('buildAnalyticsCsv emits section rows', () => {
  const csv = buildAnalyticsCsv({
    range: { from: '2026-07-01', to: '2026-07-31', granularity: 'day' },
    compareRange: { from: '2026-06-01', to: '2026-06-30' },
    totalVolume: 10,
    byReason: [{ reason: 'PRICING', count: 4 }],
    volumeOverTime: [{ bucket: '2026-07-01', count: 2 }],
    reasonOverTime: [{ bucket: '2026-07-01', reason: 'PRICING', count: 1 }],
    periodOverPeriod: [{ reason: 'PRICING', current: 4, prior: 2, pctChange: 100 }],
    actionability: {
      avg: 3.5,
      distribution: [
        { score: 1, count: 0 },
        { score: 2, count: 0 },
        { score: 3, count: 1 },
        { score: 4, count: 1 },
        { score: 5, count: 0 },
      ],
      avgOverTime: [{ bucket: '2026-07-01', avg: 3.5 }],
      avgOverTimeByReason: [{ bucket: '2026-07-01', reason: 'PRICING', avg: 4 }],
    },
  });
  assert.match(csv, /totalVolume,10/);
  assert.match(csv, /byReason,PRICING,,count,4/);
  assert.match(csv, /periodOverPeriod,PRICING,,pctChange,100/);
});

test('buildJsonlLine uses custom_id and model input', () => {
  const line = buildJsonlLine({
    customId: 'req-1',
    model: 'o3-mini',
    input: 'hello',
  });
  const parsed = JSON.parse(line) as {
    custom_id: string;
    body: { model: string; input: string };
  };
  assert.equal(parsed.custom_id, 'req-1');
  assert.equal(parsed.body.model, 'o3-mini');
  assert.equal(parsed.body.input, 'hello');
});

test('parseScoreFromResultLine extracts category and actionability', () => {
  const row = {
    custom_id: 'abc',
    response: {
      body: {
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: '{\n    "category": "PRICING",\n    "actionability": 4\n}',
              },
            ],
          },
        ],
      },
    },
  };
  assert.deepEqual(parseScoreFromResultLine(row), {
    category: 'PRICING',
    actionability: 4,
  });
});

test('buildModelInput wraps feedback with prompt delimiters', () => {
  const input = buildModelInput('too expensive');
  assert.match(input, /COMPETITOR_CHURN/);
  assert.match(input, /actionability from 1 to 5/);
  assert.match(input, /<START USER FEEDBACK>\ntoo expensive\n<END USER FEEDBACK>/);
});
