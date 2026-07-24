import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureSchema } from './db.js';
import { createFeedbackRouter } from './routes/feedback.js';
import { startWorker } from './worker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(createFeedbackRouter());
  app.use(express.static(join(__dirname, '..', 'public')));
  return app;
}

async function main() {
  await ensureSchema();
  const app = createApp();
  startWorker();
  app.listen(PORT, () => {
    console.log(`listening on :${PORT}`);
  });
}

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
