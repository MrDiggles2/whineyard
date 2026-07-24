/** Snake_case shapes from DigitalOcean Inference Batches. */

export interface BatchFileCreateResponse {
  file_id: string;
  upload_url: string;
  [key: string]: unknown;
}

export interface BatchJob {
  batch_id?: string;
  id?: string;
  status: string;
  provider?: string;
  endpoint?: string;
  input_file_id?: string;
  output_file_id?: string;
  [key: string]: unknown;
}

export interface BatchResultsResponse {
  batch_id?: string;
  result_available?: boolean;
  output_file_url?: string;
  error_file_url?: string;
  download?: { presigned_url?: string };
  output_url?: string;
  [key: string]: unknown;
}

export type BatchEndpoint = '/v1/responses' | '/v1/chat/completions';

export interface BatchCreateParams {
  file_id: string;
  provider: 'openai' | 'anthropic';
  completion_window: '24h';
  request_id: string;
  endpoint?: BatchEndpoint;
}
