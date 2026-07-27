import { Router, type Request, type Response } from 'express';
import { getPool } from '../db.js';

export type Granularity = 'day' | 'week';

export interface DateRange {
  from: Date;
  toExclusive: Date;
}

export interface ResolvedAnalyticsRange {
  range: DateRange;
  compareRange: DateRange;
  granularity: Granularity;
  fromIso: string;
  toIso: string;
  compareFromIso: string;
  compareToIso: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const WEEKLY_THRESHOLD_DAYS = 60;

/** Parse YYYY-MM-DD or full ISO into UTC start-of-day. */
export function parseUtcDate(value: string): Date {
  const trimmed = value.trim();
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dayOnly) {
    const y = Number(dayOnly[1]);
    const m = Number(dayOnly[2]);
    const d = Number(dayOnly[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      throw new Error('invalid date');
    }
    return dt;
  }
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) {
    throw new Error('invalid date');
  }
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

export function formatUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addUtcDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

export function defaultAnalyticsRange(now = new Date()): { from: Date; toInclusive: Date } {
  const toInclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = addUtcDays(toInclusive, -(DEFAULT_RANGE_DAYS - 1));
  return { from, toInclusive };
}

export function resolveAnalyticsRange(
  fromRaw?: string,
  toRaw?: string,
  now = new Date(),
): ResolvedAnalyticsRange {
  const defaults = defaultAnalyticsRange(now);
  const from = fromRaw ? parseUtcDate(fromRaw) : defaults.from;
  const toInclusive = toRaw ? parseUtcDate(toRaw) : defaults.toInclusive;
  if (from.getTime() > toInclusive.getTime()) {
    throw new Error('invalid date range');
  }
  const toExclusive = addUtcDays(toInclusive, 1);
  const durationMs = toExclusive.getTime() - from.getTime();
  const days = durationMs / MS_PER_DAY;
  const granularity: Granularity = days > WEEKLY_THRESHOLD_DAYS ? 'week' : 'day';
  const compareToExclusive = from;
  const compareFrom = new Date(from.getTime() - durationMs);
  return {
    range: { from, toExclusive },
    compareRange: { from: compareFrom, toExclusive: compareToExclusive },
    granularity,
    fromIso: formatUtcDate(from),
    toIso: formatUtcDate(toInclusive),
    compareFromIso: formatUtcDate(compareFrom),
    compareToIso: formatUtcDate(addUtcDays(compareToExclusive, -1)),
  };
}

export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

export function buildAnalyticsWhere(includeUnscored: boolean): {
  whereSql: string;
  params: unknown[];
  nextParam: number;
} {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!includeUnscored) {
    params.push('scored');
    where.push(`status = $${params.length}`);
  }
  return {
    whereSql: where.length ? where.join(' AND ') : 'TRUE',
    params,
    nextParam: params.length + 1,
  };
}

export function reasonLabel(category: string | null): string {
  return category && category.trim() !== '' ? category : 'UNCLASSIFIED';
}

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface PeriodOverPeriodRow {
  reason: string;
  current: number;
  prior: number;
  pctChange: number | null;
}

export function mergePeriodOverPeriod(
  current: ReasonCount[],
  prior: ReasonCount[],
): PeriodOverPeriodRow[] {
  const map = new Map<string, PeriodOverPeriodRow>();
  for (const row of current) {
    map.set(row.reason, {
      reason: row.reason,
      current: row.count,
      prior: 0,
      pctChange: null,
    });
  }
  for (const row of prior) {
    const existing = map.get(row.reason);
    if (existing) {
      existing.prior = row.count;
    } else {
      map.set(row.reason, {
        reason: row.reason,
        current: 0,
        prior: row.count,
        pctChange: null,
      });
    }
  }
  for (const row of map.values()) {
    row.pctChange = pctChange(row.current, row.prior);
  }
  return [...map.values()].sort((a, b) => b.current - a.current || a.reason.localeCompare(b.reason));
}

export interface AnalyticsPayload {
  range: { from: string; to: string; granularity: Granularity };
  compareRange: { from: string; to: string };
  totalVolume: number;
  byReason: ReasonCount[];
  volumeOverTime: { bucket: string; count: number }[];
  reasonOverTime: { bucket: string; reason: string; count: number }[];
  periodOverPeriod: PeriodOverPeriodRow[];
  actionability: {
    avg: number | null;
    distribution: { score: number; count: number }[];
    avgOverTime: { bucket: string; avg: number | null }[];
    avgOverTimeByReason: { bucket: string; reason: string; avg: number | null }[];
  };
}

export function buildAnalyticsCsv(payload: AnalyticsPayload): string {
  const lines: string[] = [];
  const esc = (v: string | number | null) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  lines.push('section,reason,bucket,metric,value');
  lines.push(`overview,,,totalVolume,${esc(payload.totalVolume)}`);
  for (const row of payload.byReason) {
    lines.push(`byReason,${esc(row.reason)},,count,${esc(row.count)}`);
  }
  for (const row of payload.periodOverPeriod) {
    lines.push(`periodOverPeriod,${esc(row.reason)},,current,${esc(row.current)}`);
    lines.push(`periodOverPeriod,${esc(row.reason)},,prior,${esc(row.prior)}`);
    lines.push(
      `periodOverPeriod,${esc(row.reason)},,pctChange,${esc(row.pctChange == null ? '' : Number(row.pctChange.toFixed(2)))}`,
    );
  }
  for (const row of payload.volumeOverTime) {
    lines.push(`volumeOverTime,,${esc(row.bucket)},count,${esc(row.count)}`);
  }
  for (const row of payload.reasonOverTime) {
    lines.push(`reasonOverTime,${esc(row.reason)},${esc(row.bucket)},count,${esc(row.count)}`);
  }
  lines.push(
    `actionability,,,avg,${esc(payload.actionability.avg == null ? '' : Number(payload.actionability.avg.toFixed(3)))}`,
  );
  for (const row of payload.actionability.distribution) {
    lines.push(`actionabilityDistribution,,${esc(row.score)},count,${esc(row.count)}`);
  }
  for (const row of payload.actionability.avgOverTime) {
    lines.push(
      `actionabilityAvgOverTime,,${esc(row.bucket)},avg,${esc(row.avg == null ? '' : Number(row.avg.toFixed(3)))}`,
    );
  }
  for (const row of payload.actionability.avgOverTimeByReason) {
    lines.push(
      `actionabilityAvgOverTimeByReason,${esc(row.reason)},${esc(row.bucket)},avg,${esc(row.avg == null ? '' : Number(row.avg.toFixed(3)))}`,
    );
  }
  return lines.join('\n') + '\n';
}

function parseIncludeUnscored(raw: unknown): boolean {
  return String(raw ?? 'false').toLowerCase() === 'true';
}

async function loadAnalytics(
  resolved: ResolvedAnalyticsRange,
  includeUnscored: boolean,
): Promise<AnalyticsPayload> {
  const db = getPool();
  const trunc = resolved.granularity === 'week' ? 'week' : 'day';

  const base = buildAnalyticsWhere(includeUnscored);
  const fromParam = base.nextParam;
  const toParam = base.nextParam + 1;
  const rangeParams = [...base.params, resolved.range.from, resolved.range.toExclusive];
  const rangeWhere = `${base.whereSql} AND created_at >= $${fromParam} AND created_at < $${toParam}`;

  const reasonExpr = `COALESCE(NULLIF(TRIM(category), ''), 'UNCLASSIFIED')`;

  const totalResult = await db.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM feedback_entries WHERE ${rangeWhere}`,
    rangeParams,
  );

  const byReasonResult = await db.query<{ reason: string; count: number }>(
    `SELECT ${reasonExpr} AS reason, COUNT(*)::int AS count
     FROM feedback_entries
     WHERE ${rangeWhere}
     GROUP BY 1
     ORDER BY count DESC, reason ASC`,
    rangeParams,
  );

  const volumeOverTimeResult = await db.query<{ bucket: Date; count: number }>(
    `SELECT date_trunc('${trunc}', created_at) AS bucket, COUNT(*)::int AS count
     FROM feedback_entries
     WHERE ${rangeWhere}
     GROUP BY 1
     ORDER BY 1`,
    rangeParams,
  );

  const reasonOverTimeResult = await db.query<{ bucket: Date; reason: string; count: number }>(
    `SELECT date_trunc('${trunc}', created_at) AS bucket, ${reasonExpr} AS reason, COUNT(*)::int AS count
     FROM feedback_entries
     WHERE ${rangeWhere}
     GROUP BY 1, 2
     ORDER BY 1, 2`,
    rangeParams,
  );

  const compareFromParam = base.nextParam;
  const compareToParam = base.nextParam + 1;
  const compareParams = [
    ...base.params,
    resolved.compareRange.from,
    resolved.compareRange.toExclusive,
  ];
  const compareWhere = `${base.whereSql} AND created_at >= $${compareFromParam} AND created_at < $${compareToParam}`;

  const priorByReasonResult = await db.query<{ reason: string; count: number }>(
    `SELECT ${reasonExpr} AS reason, COUNT(*)::int AS count
     FROM feedback_entries
     WHERE ${compareWhere}
     GROUP BY 1`,
    compareParams,
  );

  const actionabilityFilter = includeUnscored
    ? `${rangeWhere} AND actionability IS NOT NULL`
    : rangeWhere;

  const avgResult = await db.query<{ avg: string | null }>(
    `SELECT AVG(actionability)::float8 AS avg FROM feedback_entries WHERE ${actionabilityFilter}`,
    rangeParams,
  );

  const distResult = await db.query<{ score: number; count: number }>(
    `SELECT actionability::int AS score, COUNT(*)::int AS count
     FROM feedback_entries
     WHERE ${actionabilityFilter}
     GROUP BY 1
     ORDER BY 1`,
    rangeParams,
  );

  const avgOverTimeResult = await db.query<{ bucket: Date; avg: string | null }>(
    `SELECT date_trunc('${trunc}', created_at) AS bucket, AVG(actionability)::float8 AS avg
     FROM feedback_entries
     WHERE ${actionabilityFilter}
     GROUP BY 1
     ORDER BY 1`,
    rangeParams,
  );

  const avgByReasonResult = await db.query<{
    bucket: Date;
    reason: string;
    avg: string | null;
  }>(
    `SELECT date_trunc('${trunc}', created_at) AS bucket, ${reasonExpr} AS reason,
            AVG(actionability)::float8 AS avg
     FROM feedback_entries
     WHERE ${actionabilityFilter}
     GROUP BY 1, 2
     ORDER BY 1, 2`,
    rangeParams,
  );

  const distribution = [1, 2, 3, 4, 5].map((score) => ({
    score,
    count: distResult.rows.find((r) => r.score === score)?.count ?? 0,
  }));

  const bucketIso = (d: Date) => new Date(d).toISOString().slice(0, 10);

  return {
    range: {
      from: resolved.fromIso,
      to: resolved.toIso,
      granularity: resolved.granularity,
    },
    compareRange: {
      from: resolved.compareFromIso,
      to: resolved.compareToIso,
    },
    totalVolume: totalResult.rows[0]?.total ?? 0,
    byReason: byReasonResult.rows.map((r) => ({
      reason: reasonLabel(r.reason),
      count: r.count,
    })),
    volumeOverTime: volumeOverTimeResult.rows.map((r) => ({
      bucket: bucketIso(r.bucket),
      count: r.count,
    })),
    reasonOverTime: reasonOverTimeResult.rows.map((r) => ({
      bucket: bucketIso(r.bucket),
      reason: reasonLabel(r.reason),
      count: r.count,
    })),
    periodOverPeriod: mergePeriodOverPeriod(
      byReasonResult.rows.map((r) => ({ reason: reasonLabel(r.reason), count: r.count })),
      priorByReasonResult.rows.map((r) => ({ reason: reasonLabel(r.reason), count: r.count })),
    ),
    actionability: {
      avg: avgResult.rows[0]?.avg == null ? null : Number(avgResult.rows[0].avg),
      distribution,
      avgOverTime: avgOverTimeResult.rows.map((r) => ({
        bucket: bucketIso(r.bucket),
        avg: r.avg == null ? null : Number(r.avg),
      })),
      avgOverTimeByReason: avgByReasonResult.rows.map((r) => ({
        bucket: bucketIso(r.bucket),
        reason: reasonLabel(r.reason),
        avg: r.avg == null ? null : Number(r.avg),
      })),
    },
  };
}

export function createAnalyticsRouter(): Router {
  const router = Router();

  router.get('/api/analytics', async (req: Request, res: Response) => {
    try {
      const includeUnscored = parseIncludeUnscored(req.query.includeUnscored);
      let resolved: ResolvedAnalyticsRange;
      try {
        resolved = resolveAnalyticsRange(
          req.query.from ? String(req.query.from) : undefined,
          req.query.to ? String(req.query.to) : undefined,
        );
      } catch (err) {
        return res.status(400).json({
          error: err instanceof Error ? err.message : 'invalid date',
        });
      }

      const payload = await loadAnalytics(resolved, includeUnscored);
      return res.json(payload);
    } catch (err) {
      console.error('GET /api/analytics failed', err);
      return res.status(500).json({ error: 'internal error' });
    }
  });

  router.get('/api/analytics/export', async (req: Request, res: Response) => {
    try {
      const includeUnscored = parseIncludeUnscored(req.query.includeUnscored);
      let resolved: ResolvedAnalyticsRange;
      try {
        resolved = resolveAnalyticsRange(
          req.query.from ? String(req.query.from) : undefined,
          req.query.to ? String(req.query.to) : undefined,
        );
      } catch (err) {
        return res.status(400).json({
          error: err instanceof Error ? err.message : 'invalid date',
        });
      }

      const payload = await loadAnalytics(resolved, includeUnscored);
      const csv = buildAnalyticsCsv(payload);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="analytics-${resolved.fromIso}_${resolved.toIso}.csv"`,
      );
      return res.send(csv);
    } catch (err) {
      console.error('GET /api/analytics/export failed', err);
      return res.status(500).json({ error: 'internal error' });
    }
  });

  return router;
}
