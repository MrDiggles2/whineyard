import { Router } from 'express';
import { getPool } from '../db.js';
import { isUuid } from '../uuid.js';

const SORT_COLUMNS = new Set(['created_at', 'actionability', 'category']);

export function createFeedbackRouter() {
  const router = Router();

  router.post('/feedback/:formUuid', async (req, res) => {
    try {
      const { formUuid } = req.params;
      if (!isUuid(formUuid)) {
        return res.status(400).json({ error: 'formUuid must be a valid UUID' });
      }

      const feedback = req.body?.feedback;
      if (typeof feedback !== 'string' || feedback.trim() === '') {
        return res.status(400).json({ error: 'feedback is required' });
      }

      let tags = req.body?.tags ?? [];
      if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
        return res.status(400).json({ error: 'tags must be an array of strings' });
      }

      const db = getPool();
      const result = await db.query(
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

  router.get('/api/feedback', async (req, res) => {
    try {
      const {
        tag,
        category,
        actionability,
        sort = 'created_at',
        order = 'desc',
        page = '1',
        pageSize = '20',
      } = req.query;

      if (!SORT_COLUMNS.has(sort)) {
        return res.status(400).json({ error: 'invalid sort' });
      }
      const sortOrder = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const size = Math.min(100, Math.max(1, parseInt(String(pageSize), 10) || 20));
      const offset = (pageNum - 1) * size;

      const where = [];
      const params = [];

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
          return res.status(400).json({ error: 'invalid actionability' });
        }
        params.push(n);
        where.push(`actionability = $${params.length}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const db = getPool();
      const countResult = await db.query(
        `SELECT COUNT(*)::int AS total FROM feedback_entries ${whereSql}`,
        params,
      );
      const total = countResult.rows[0].total;

      params.push(size);
      params.push(offset);
      const listResult = await db.query(
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

export function mapRow(row) {
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

/** Build WHERE + params for list filters (exported for tests). */
export function buildListFilters({ tag, category, actionability } = {}) {
  const where = [];
  const params = [];
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
  return { where, params, whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '' };
}
