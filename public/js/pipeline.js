// public/js/pipeline.js
import { preprocessDoodle } from './sprite.js';

export const defaultPostJson = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

export async function runPipeline(file, { onStep = () => {}, preprocess = preprocessDoodle, postJson = defaultPostJson } = {}) {
  onStep('preprocess', 'running');
  const prep = await preprocess(file);
  onStep('preprocess', 'done', prep);

  onStep('analyze', 'running');
  const { analysis } = await postJson('/api/analyze', { imageBase64: prep.imageBase64 });
  onStep('analyze', 'done', analysis);

  onStep('design', 'running');
  const { design } = await postJson('/api/design', { analysis });
  onStep('design', 'done', design);

  onStep('generate', 'running');
  const gen = await postJson('/api/generate', { design, spriteBase64: prep.spriteBase64, palette: analysis.palette });
  onStep('generate', 'done', gen);
  return { ...prep, analysis, design, html: gen.html, fileSaved: gen.file };
}

export async function checkAndRepair(html, sandbox, { onStep = () => {}, postJson = defaultPostJson, maxRepair = 2 } = {}) {
  let verdict = await sandbox.load(html);
  if (verdict.ok) return { html, repaired: 0, errors: [] };
  let best = html;
  for (let i = 1; i <= maxRepair; i++) {
    onStep('repair', 'running', { round: i, errors: verdict.errors });
    try {
      const { html: fixed } = await postJson('/api/repair', { html: best, errors: verdict.errors });
      best = fixed;
    } catch (e) {
      onStep('repair', 'error', String(e.message));
      break;
    }
    verdict = await sandbox.load(best);
    onStep('repair', 'done', { round: i, ok: verdict.ok });
    if (verdict.ok) return { html: best, repaired: i, errors: verdict.errors };
  }
  return { html, repaired: -1, errors: verdict.errors }; // 保留原始版，不假装成功
}
