const BASE = 'https://inference.do-ai.run/v1';

function authHeaders(apiKey, contentType) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

async function readJson(res) {
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Batches API ${res.status}: ${text}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/** Create upload slot, PUT JSONL, return file_id. */
export async function uploadBatchFile(apiKey, jsonl, fileName = 'batch_requests.jsonl') {
  const createRes = await fetch(`${BASE}/batches/files`, {
    method: 'POST',
    headers: authHeaders(apiKey, 'application/json'),
    body: JSON.stringify({ file_name: fileName }),
  });
  const created = await readJson(createRes);
  const uploadUrl = created.upload_url;
  const fileId = created.file_id;
  if (!uploadUrl || !fileId) {
    throw new Error('batches/files response missing upload_url or file_id');
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/jsonl' },
    body: jsonl,
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`JSONL upload failed ${putRes.status}: ${text}`);
  }

  return fileId;
}

export async function createBatch(apiKey, fileId, { endpoint = '/v1/responses' } = {}) {
  const res = await fetch(`${BASE}/batches`, {
    method: 'POST',
    headers: authHeaders(apiKey, 'application/json'),
    body: JSON.stringify({
      file_id: fileId,
      provider: 'openai',
      completion_window: '24h',
      request_id: fileId,
      endpoint,
    }),
  });
  return readJson(res);
}

export async function getBatch(apiKey, batchId) {
  const res = await fetch(`${BASE}/batches/${batchId}`, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });
  return readJson(res);
}

export async function getBatchResults(apiKey, batchId) {
  const res = await fetch(`${BASE}/batches/${batchId}/results`, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });
  return readJson(res);
}

export async function downloadText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`download failed ${res.status}: ${text}`);
  }
  return res.text();
}

export function buildJsonlLine({ customId, model, input, maxOutputTokens = 1024 }) {
  return JSON.stringify({
    custom_id: customId,
    method: 'POST',
    url: '/v1/responses',
    body: {
      model,
      input,
      max_output_tokens: maxOutputTokens,
    },
  });
}

/** Extract category + actionability from a batch output JSONL line object. */
export function parseScoreFromResultLine(row) {
  const responseBody = row?.response?.body;
  if (!responseBody) return null;
  const outputList = responseBody.output || [];
  for (const item of outputList) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type !== 'output_text') continue;
      const text = content.text || '';
      try {
        const parsed = JSON.parse(text);
        if (parsed.category != null && parsed.actionability != null) {
          return {
            category: String(parsed.category),
            actionability: Number(parsed.actionability),
          };
        }
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.category != null && parsed.actionability != null) {
              return {
                category: String(parsed.category),
                actionability: Number(parsed.actionability),
              };
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
  return null;
}
