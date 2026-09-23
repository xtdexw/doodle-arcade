// scripts/regress.js
import fs from 'node:fs';
import path from 'node:path';
import { createArk, imageMessage } from '../lib/ark.js';
import { extractJson, extractHtml } from '../lib/extract.js';
import { loadPrompt } from '../lib/prompts.js';
import { substituteSprite } from '../lib/spriteurl.js';
import { loadDotEnv } from '../lib/dotenv.js';

loadDotEnv();

export function listFixtureFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => path.join(dir, f));
  } catch { return []; }
}

export async function runFixtures({ dir = 'fixtures', ark = createArk() } = {}) {
  fs.mkdirSync('games', { recursive: true });
  const files = listFixtureFiles(dir);
  if (!files.length) { console.log(`[regress] ${dir} 无涂鸦素材，跳过（见 fixtures/README.md）`); return []; }
  const results = [];
  for (const file of files) {
    const b64 = fs.readFileSync(file).toString('base64');
    const mime = /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png';
    const entry = { file: path.basename(file), ok: false };
    try {
      const a = extractJson(await ark.chat([imageMessage(loadPrompt('analyze'), b64, mime)]));
      entry.genre = a.suggested_genre;
      const d = extractJson(await ark.chat([{ role: 'user', content: loadPrompt('design', { ANALYZE_JSON: JSON.stringify(a) }) }]));
      const html = extractHtml(await ark.chat([{ role: 'user', content: loadPrompt('generate', {
        PALETTE_JSON: JSON.stringify(a.palette),
        DESIGN_JSON: JSON.stringify(d),
      }) }], { temperature: 0.7, thinking: 'disabled', maxCompletionTokens: 32768 }));
      const finalHtml = substituteSprite(html, `data:image/${/\.jpe?g$/i.test(file) ? 'jpeg' : 'png'};base64,${b64}`);
      fs.writeFileSync(path.join('games', `regress-${path.basename(file, path.extname(file))}.html`), finalHtml);
      entry.ok = true; entry.title = d.title;
    } catch (e) { entry.error = e.message.slice(0, 120); }
    results.push(entry);
  }
  return results;
}

if (process.argv[1] && process.argv[1].endsWith('regress.js')) {
  const results = await runFixtures();
  if (results.length) {
    console.table(results);
    fs.writeFileSync('games/regress-report.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
    process.exit(results.every((r) => r.ok) ? 0 : 1);
  }
}
