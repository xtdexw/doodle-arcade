// routes/api.js
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createArk, imageMessage } from '../lib/ark.js';
import { extractJson, extractHtml } from '../lib/extract.js';
import { loadPrompt } from '../lib/prompts.js';
import { SPRITE_PLACEHOLDER, substituteSprite, extractSpriteUrl } from '../lib/spriteurl.js';

const GENRES = new Set(['runner', 'flappy']);
const FALLBACK_PALETTE = ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429'];

function validateAnalysis(a) {
  if (!a || typeof a !== 'object') return 'analysis 不是对象';
  if (!Array.isArray(a.characters) || a.characters.length < 1) return 'characters 为空';
  for (const c of a.characters) {
    if (!Array.isArray(c.bbox) || c.bbox.length !== 4 || c.bbox.some(Number.isNaN)) return `bbox 非法: ${c.name}`;
  }
  if (!Array.isArray(a.palette) || !a.palette.every((p) => /^#[0-9a-fA-F]{6}$/.test(p))) return 'palette 非法';
  if (!GENRES.has(a.suggested_genre)) return `suggested_genre 必须是 runner/flappy`;
  return null;
}
function validateDesign(d) {
  if (!d || !d.title || !GENRES.has(d.genre) || !d.bio) return 'design 缺字段或 genre 非法';
  return null;
}

async function chatJson(ark, messages, validate, label) {
  let lastErr;
  for (let i = 0; i < 2; i++) { // 解析失败重试 ×1
    try {
      const obj = extractJson(await ark.chat(messages, { temperature: 0.4 }));
      const err = validate(obj);
      if (!err) return obj;
      lastErr = new Error(`${label} 校验失败: ${err}`);
    } catch (e) { lastErr = e; }
  }
  const e = new Error(lastErr.message); e.status = 422; throw e;
}

export function createApiRouter({ ark = createArk(), gamesDir } = {}) {
  const router = express.Router();
  const GAMES = gamesDir || path.resolve('games');
  fs.mkdirSync(GAMES, { recursive: true });

  router.post('/analyze', async (req, res, next) => {
    try {
      const { imageBase64, mime = 'image/png' } = req.body ?? {};
      if (!imageBase64) return res.status(400).json({ error: 'imageBase64 必填' });
      const prompt = loadPrompt('analyze');
      const analysis = await chatJson(ark, [imageMessage(prompt, imageBase64, mime)], validateAnalysis, 'analyze');
      res.json({ analysis });
    } catch (e) { next(e); }
  });

  router.post('/design', async (req, res, next) => {
    try {
      const { analysis } = req.body ?? {};
      if (!analysis) return res.status(400).json({ error: 'analysis 必填' });
      const prompt = loadPrompt('design', { ANALYZE_JSON: JSON.stringify(analysis) });
      const design = await chatJson(ark, [{ role: 'user', content: prompt }], validateDesign, 'design');
      res.json({ design });
    } catch (e) { next(e); }
  });

  async function chatHtml(ark, prompt) {
    // 代码任务关思考+放宽输出上限：ark max_tokens 默认 4k 且含思维链，思考会先耗尽预算致生成卡死
    const out = await ark.chat([{ role: 'user', content: prompt }], {
      temperature: 0.7,
      thinking: 'disabled',
      maxCompletionTokens: 32768,
    });
    return extractHtml(out);
  }

  router.post('/generate', async (req, res, next) => {
    try {
      const { design, spriteBase64, palette } = req.body ?? {};
      if (!design || !spriteBase64) return res.status(400).json({ error: 'design 与 spriteBase64 必填' });
      const prompt = loadPrompt('generate', {
        PALETTE_JSON: JSON.stringify(Array.isArray(palette) && palette.length ? palette : FALLBACK_PALETTE),
        DESIGN_JSON: JSON.stringify(design),
      });
      const html = await chatHtml(ark, prompt);
      // 模型只写占位符，服务端替换为真实精灵 data URL；模型没写占位符也照常返回（交由沙箱体检暴露）
      const spriteMissing = !html.includes(SPRITE_PLACEHOLDER); // 必须在替换前的原始输出上判断
      const spriteUrl = `data:image/png;base64,${spriteBase64}`;
      const finalHtml = substituteSprite(html, spriteUrl);
      const file = `doodle-${Date.now()}.html`;
      fs.writeFileSync(path.join(GAMES, file), finalHtml);
      res.json({ html: finalHtml, file: `games/${file}`, ...(spriteMissing ? { spriteMissing: true } : {}) });
    } catch (e) { next(e); }
  });

  router.post('/repair', async (req, res, next) => {
    try {
      const { html, errors } = req.body ?? {};
      if (!html || !Array.isArray(errors)) return res.status(400).json({ error: 'html 与 errors[] 必填' });
      // 模型不见 base64：先抽取 data URL 换成占位符，输出后再回填
      const spriteUrl = extractSpriteUrl(html);
      const modelHtml = spriteUrl ? html.replaceAll(spriteUrl, SPRITE_PLACEHOLDER) : html;
      const prompt = loadPrompt('repair', { ERRORS: errors.join('\n'), HTML: modelHtml });
      const out = spriteUrl ? substituteSprite(await chatHtml(ark, prompt), spriteUrl) : await chatHtml(ark, prompt);
      res.json({ html: out });
    } catch (e) { next(e); }
  });

  router.post('/revise', async (req, res, next) => {
    try {
      const { html, instruction } = req.body ?? {};
      if (!html || !instruction) return res.status(400).json({ error: 'html 与 instruction 必填' });
      const spriteUrl = extractSpriteUrl(html);
      const modelHtml = spriteUrl ? html.replaceAll(spriteUrl, SPRITE_PLACEHOLDER) : html;
      const prompt = loadPrompt('revise', { INSTRUCTION: instruction, HTML: modelHtml });
      const out = spriteUrl ? substituteSprite(await chatHtml(ark, prompt), spriteUrl) : await chatHtml(ark, prompt);
      res.json({ html: out });
    } catch (e) { next(e); }
  });

  router.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  });
  return router;
}
