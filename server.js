// server.js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './routes/api.js';
import { loadDotEnv } from './lib/dotenv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadDotEnv();

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', createApiRouter());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/games', express.static(path.join(__dirname, 'games')));
  return app;
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  if (!process.env.ARK_API_KEY) {
    console.warn('[warn] ARK_API_KEY 未设置，仅静态页面可用，生成接口会报错。复制 .env.example 为 .env 并填入。');
  }
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Doodle Arcade → http://localhost:${port}`));
}
