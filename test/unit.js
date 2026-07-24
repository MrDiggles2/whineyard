import test from 'node:test';
import assert from 'node:assert/strict';
import { isUuid } from '../src/uuid.js';
import { buildListFilters } from '../src/routes/feedback.js';
import { buildJsonlLine, parseScoreFromResultLine } from '../src/batchFormat.js';
import { buildModelInput } from '../src/prompt.js';

test('isUuid accepts valid UUIDs', () => {
  assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
});

test('isUuid rejects invalid values', () => {
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(null), false);
});

test('buildListFilters builds tag category actionability clauses', () => {
  const { whereSql, params } = buildListFilters({
    tag: 'churn',
    category: 'PRICING',
    actionability: '3',
  });
  assert.match(whereSql, /tags @>/);
  assert.match(whereSql, /category =/);
  assert.match(whereSql, /actionability =/);
  assert.deepEqual(params, [JSON.stringify(['churn']), 'PRICING', 3]);
});

test('buildJsonlLine uses custom_id and model input', () => {
  const line = buildJsonlLine({
    customId: 'req-1',
    model: 'o3-mini',
    input: 'hello',
  });
  const parsed = JSON.parse(line);
  assert.equal(parsed.custom_id, 'req-1');
  assert.equal(parsed.body.model, 'o3-mini');
  assert.equal(parsed.body.input, 'hello');
});

test('parseScoreFromResultLine extracts category and actionability', () => {
  const row = {
    custom_id: 'abc',
    response: {
      body: {
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: '{\n    "category": "PRICING",\n    "actionability": 4\n}',
              },
            ],
          },
        ],
      },
    },
  };
  assert.deepEqual(parseScoreFromResultLine(row), {
    category: 'PRICING',
    actionability: 4,
  });
});

test('buildModelInput wraps feedback with prompt delimiters', () => {
  const input = buildModelInput('too expensive');
  assert.match(input, /COMPETITOR_CHURN/);
  assert.match(input, /actionability from 1 to 5/);
  assert.match(input, /<START USER FEEDBACK>\ntoo expensive\n<END USER FEEDBACK>/);
});
