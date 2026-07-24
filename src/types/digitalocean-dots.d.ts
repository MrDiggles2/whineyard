declare module '@digitalocean/dots' {
  import type {
    BatchCreateParams,
    BatchFileCreateResponse,
    BatchJob,
    BatchResultsResponse,
  } from './batches.js';

  export interface InferenceClientOptions {
    apiKey: string;
    baseURL?: string;
  }

  export class InferenceClient {
    constructor(opts: InferenceClientOptions);

    batches: {
      files: {
        create(params: { file_name: string; [key: string]: unknown }): Promise<BatchFileCreateResponse>;
      };
      create(params: BatchCreateParams | Record<string, unknown>): Promise<BatchJob>;
      retrieve(batchId: string, query?: Record<string, unknown>): Promise<BatchJob>;
      results(batchId: string, query?: Record<string, unknown>): Promise<BatchResultsResponse>;
    };

    files: {
      content(batchId: string): Promise<Response>;
    };
  }

  export { InferenceClient as default };
}
