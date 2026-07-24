/** Build one JSONL request line for DO Batches (/v1/responses). */
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
