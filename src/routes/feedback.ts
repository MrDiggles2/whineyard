import { Router, type Request, type Response } from 'express';
import { getPool } from '../db.js';
import type { FeedbackDto, FeedbackRow, FeedbackStatus } from '../types/feedback.js';
import { isUuid } from '../uuid.js';

const SORT_COLUMNS = new Set(['created_at', 'actionability', 'category']);
const ALLOWED_STATUSES = new Set<FeedbackStatus>([
  'pending',
  'submitted',
  'scored',
  'failed',
]);

export function createFeedbackRouter(): Router {
  const router = Router();

  router.post('/api/feedback/:formUuid', async (req: Request, res: Response) => {
    try {
      const { formUuid } = req.params;
      if (!isUuid(formUuid)) {
        return res.status(400).json({ error: 'formUuid must be a valid UUID' });
      }

      const feedback = req.body?.feedback;
      if (typeof feedback !== 'string' || feedback.trim() === '') {
        return res.status(400).json({ error: 'feedback is required' });
      }

      const tags: unknown = req.body?.tags ?? [];
      if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
        return res.status(400).json({ error: 'tags must be an array of strings' });
      }

      const db = getPool();
      const result = await db.query<FeedbackRow>(
        `INSERT INTO feedback_entries (form_uuid, feedback, tags, status)
         VALUES ($1, $2, $3::jsonb, 'pending')
         RETURNING *`,
        [formUuid, feedback, JSON.stringify(tags)],
      );

      return res.status(201).json(mapRow(result.rows[0]));
    } catch (err) {
      console.error('POST /feedback failed', err);
      return res.status(500).json({ error: 'internal error' });
    }
  });

  router.get('/api/feedback', async (req: Request, res: Response) => {
    try {
      const {
        tag,
        category,
        actionability,
        q,
        status,
        sort = 'created_at',
        order = 'desc',
        page = '1',
        pageSize = '20',
      } = req.query;

      if (typeof sort !== 'string' || !SORT_COLUMNS.has(sort)) {
        return res.status(400).json({ error: 'invalid sort' });
      }
      const sortOrder = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const size = Math.min(100, Math.max(1, parseInt(String(pageSize), 10) || 20));
      const offset = (pageNum - 1) * size;

      let whereSql: string;
      let params: unknown[];
      try {
        ({ whereSql, params } = buildListFilters({
          tag: tag ? String(tag) : undefined,
          category: category ? String(category) : undefined,
          actionability:
            actionability !== undefined && actionability !== ''
              ? String(actionability)
              : undefined,
          q: q ? String(q) : undefined,
          status: status ? String(status) : undefined,
        }));
      } catch (err) {
        return res.status(400).json({
          error: err instanceof Error ? err.message : 'invalid filter',
        });
      }

      const db = getPool();
      const countResult = await db.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM feedback_entries ${whereSql}`,
        params,
      );
      const total = countResult.rows[0].total;

      params.push(size);
      params.push(offset);
      const listResult = await db.query<FeedbackRow>(
        `SELECT * FROM feedback_entries
         ${whereSql}
         ORDER BY ${sort} ${sortOrder} NULLS LAST
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return res.json({
        items: listResult.rows.map(mapRow),
        total,
        page: pageNum,
        pageSize: size,
      });
    } catch (err) {
      console.error('GET /api/feedback failed', err);
      return res.status(500).json({ error: 'internal error' });
    }
  });

  return router;
}

export function mapRow(row: FeedbackRow): FeedbackDto {
  return {
    id: row.id,
    formUuid: row.form_uuid,
    feedback: row.feedback,
    tags: row.tags,
    category: row.category,
    actionability: row.actionability,
    status: row.status,
    batchId: row.batch_id,
    customId: row.custom_id,
    createdAt: row.created_at,
    scoredAt: row.scored_at,
  };
}

export interface ListFilterInput {
  tag?: string;
  category?: string;
  actionability?: string | number;
  q?: string;
  status?: string;
}

/** Escape LIKE/ILIKE metacharacters (and backslash) for use with ESCAPE '\\'. */
export function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Build WHERE + params for list filters (exported for tests). */
export function buildListFilters({
  tag,
  category,
  actionability,
  q,
  status,
}: ListFilterInput = {}): { where: string[]; params: unknown[]; whereSql: string } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (tag) {
    params.push(JSON.stringify([String(tag)]));
    where.push(`tags @> $${params.length}::jsonb`);
  }
  if (category) {
    params.push(String(category));
    where.push(`category = $${params.length}`);
  }
  if (actionability !== undefined && actionability !== '') {
    const n = parseInt(String(actionability), 10);
    if (Number.isNaN(n)) {
      throw new Error('invalid actionability');
    }
    params.push(n);
    where.push(`actionability = $${params.length}`);
  }
  if (q !== undefined && String(q).trim() !== '') {
    params.push(`%${escapeIlike(String(q).trim())}%`);
    where.push(`feedback ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (status !== undefined && status !== '') {
    const s = String(status);
    if (!ALLOWED_STATUSES.has(s as FeedbackStatus)) {
      throw new Error('invalid status');
    }
    params.push(s);
    where.push(`status = $${params.length}`);
  }
  return { where, params, whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '' };
}
