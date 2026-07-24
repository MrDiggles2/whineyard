export interface JsonlLineInput {
  customId: string;
  model: string;
  input: string;
  maxOutputTokens?: number;
}

export interface ScoreResult {
  category: string;
  actionability: number;
}

/** Build one JSONL request line for DO Batches (/v1/responses). */
export function buildJsonlLine({
  customId,
  model,
  input,
  maxOutputTokens = 1024,
}: JsonlLineInput): string {
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

export interface BatchResultLine {
  custom_id?: string;
  response?: {
    body?: {
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };
  };
}

/** Extract category + actionability from a batch output JSONL line object. */
export function parseScoreFromResultLine(row: BatchResultLine): ScoreResult | null {
  const responseBody = row?.response?.body;
  if (!responseBody) return null;
  const outputList = responseBody.output || [];
  for (const item of outputList) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type !== 'output_text') continue;
      const text = content.text || '';
      try {
        const parsed = JSON.parse(text) as { category?: unknown; actionability?: unknown };
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
            const parsed = JSON.parse(match[0]) as {
              category?: unknown;
              actionability?: unknown;
            };
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
