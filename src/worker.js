import { getPool } from './db.js';
import { buildModelInput } from './prompt.js';
import {
  buildJsonlLine,
  createBatch,
  downloadText,
  getBatch,
  getBatchResults,
  parseScoreFromResultLine,
  uploadBatchFile,
} from './batches.js';

const BATCH_SIZE = Number(process.env.BATCH_SIZE || 50);
const POLL_MS = Number(process.env.WORKER_POLL_MS || 60_000);
const TERMINAL_FAIL = new Set(['failed', 'cancelled', 'expired']);

let running = false;
let timer = null;

export function startWorker() {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await workerTick();
    } catch (err) {
      console.error('worker tick failed', err);
    } finally {
      running = false;
    }
  };

  tick();
  timer = setInterval(tick, POLL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function workerTick() {
  const apiKey = process.env.MODEL_ACCESS_KEY;
  if (!apiKey) {
    console.warn('MODEL_ACCESS_KEY not set; skipping scoring tick');
    return;
  }

  await resolveSubmittedBatches(apiKey);

  const inFlight = await countInFlight();
  if (inFlight > 0) return;

  await submitPendingBatch(apiKey);
}

async function countInFlight() {
  const db = getPool();
  const result = await db.query(
    `SELECT COUNT(*)::int AS n FROM feedback_entries WHERE status = 'submitted'`,
  );
  return result.rows[0].n;
}

async function resolveSubmittedBatches(apiKey) {
  const db = getPool();
  const batches = await db.query(
    `SELECT DISTINCT batch_id FROM feedback_entries
     WHERE status = 'submitted' AND batch_id IS NOT NULL`,
  );

  for (const { batch_id: batchId } of batches.rows) {
    const batch = await getBatch(apiKey, batchId);
    const status = batch.status;

    if (status === 'completed') {
      await applyCompletedBatch(apiKey, batchId);
    } else if (TERMINAL_FAIL.has(status)) {
      await db.query(
        `UPDATE feedback_entries SET status = 'failed'
         WHERE batch_id = $1 AND status = 'submitted'`,
        [batchId],
      );
      console.error(`batch ${batchId} terminal status=${status}`);
    }
  }
}

async function applyCompletedBatch(apiKey, batchId) {
  const db = getPool();
  const resultsMeta = await getBatchResults(apiKey, batchId);
  if (!resultsMeta.result_available || !resultsMeta.output_file_url) {
    console.warn(`batch ${batchId} completed but results not available yet`);
    return;
  }

  const text = await downloadText(resultsMeta.output_file_url);
  const lines = text.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch (err) {
      console.error('bad result line', err);
      continue;
    }
    const customId = row.custom_id;
    const score = parseScoreFromResultLine(row);
    if (!customId || !score) {
      await db.query(
        `UPDATE feedback_entries
         SET status = 'failed'
         WHERE custom_id = $1 AND batch_id = $2 AND status = 'submitted'`,
        [customId, batchId],
      );
      continue;
    }

    await db.query(
      `UPDATE feedback_entries
       SET category = $1,
           actionability = $2,
           status = 'scored',
           scored_at = now()
       WHERE custom_id = $3 AND batch_id = $4 AND status = 'submitted'`,
      [score.category, score.actionability, customId, batchId],
    );
  }
}

async function submitPendingBatch(apiKey) {
  const db = getPool();
  const model = process.env.MODEL_NAME || 'o3-mini';

  const pending = await db.query(
    `SELECT id, feedback FROM feedback_entries
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT $1`,
    [BATCH_SIZE],
  );
  if (pending.rows.length === 0) return;

  const lines = [];
  for (const row of pending.rows) {
    const customId = String(row.id);
    lines.push(
      buildJsonlLine({
        customId,
        model,
        input: buildModelInput(row.feedback),
      }),
    );
  }
  const jsonl = lines.join('\n') + '\n';

  const fileId = await uploadBatchFile(apiKey, jsonl);
  const batch = await createBatch(apiKey, fileId);
  const batchId = batch.batch_id || batch.id;
  if (!batchId) {
    throw new Error('create batch response missing batch_id');
  }

  const ids = pending.rows.map((r) => r.id);
  await db.query(
    `UPDATE feedback_entries
     SET status = 'submitted',
         batch_id = $1,
         custom_id = id::text
     WHERE id = ANY($2::uuid[])`,
    [batchId, ids],
  );

  console.log(`submitted batch ${batchId} with ${ids.length} entries`);
}
