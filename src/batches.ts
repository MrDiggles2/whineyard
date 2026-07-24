import { InferenceClient } from '@digitalocean/dots';
import type { BatchEndpoint, BatchJob, BatchResultsResponse } from './types/batches.js';

export { buildJsonlLine, parseScoreFromResultLine } from './batchFormat.js';

const clients = new Map<string, InferenceClient>();

export function getInferenceClient(apiKey: string): InferenceClient {
  let client = clients.get(apiKey);
  if (!client) {
    client = new InferenceClient({ apiKey });
    clients.set(apiKey, client);
  }
  return client;
}

/** Create upload slot, PUT JSONL, return file_id. */
export async function uploadBatchFile(
  apiKey: string,
  jsonl: string,
  fileName = 'batch_requests.jsonl',
): Promise<string> {
  const client = getInferenceClient(apiKey);
  const created = await client.batches.files.create({ file_name: fileName });
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

export async function createBatch(
  apiKey: string,
  fileId: string,
  { endpoint = '/v1/responses' }: { endpoint?: BatchEndpoint } = {},
): Promise<BatchJob> {
  const client = getInferenceClient(apiKey);
  return client.batches.create({
    file_id: fileId,
    provider: 'openai',
    completion_window: '24h',
    request_id: fileId,
    endpoint,
  });
}

export async function getBatch(apiKey: string, batchId: string): Promise<BatchJob> {
  const client = getInferenceClient(apiKey);
  return client.batches.retrieve(batchId);
}

export async function getBatchResults(
  apiKey: string,
  batchId: string,
): Promise<BatchResultsResponse> {
  const client = getInferenceClient(apiKey);
  return client.batches.results(batchId);
}

/** Download completed batch output JSONL via dots `files.content` helper. */
export async function downloadBatchOutput(apiKey: string, batchId: string): Promise<string> {
  const client = getInferenceClient(apiKey);
  const res = await client.files.content(batchId);
  return res.text();
}
