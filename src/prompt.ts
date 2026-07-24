import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, '..', 'prompt.md');

let cachedInstructions: string | undefined;

/** Instructions from prompt.md (everything before the empty feedback delimiters). */
export function loadPromptInstructions(): string {
  if (cachedInstructions) return cachedInstructions;
  const raw = readFileSync(PROMPT_PATH, 'utf8');
  const marker = '<START USER FEEDBACK>';
  const idx = raw.indexOf(marker);
  cachedInstructions = (idx === -1 ? raw : raw.slice(0, idx)).trimEnd() + '\n';
  return cachedInstructions;
}

export function buildModelInput(feedback: string): string {
  return (
    loadPromptInstructions() +
    '\n<START USER FEEDBACK>\n' +
    feedback +
    '\n<END USER FEEDBACK>'
  );
}
