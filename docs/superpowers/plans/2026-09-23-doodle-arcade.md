# 涂鸦游戏机 Doodle Arcade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 上传真人手绘涂鸦，经豆包 Seed（方舟 `doubao-seed-evolving`）三步流水线（VLM 看图 → 设计 → 写码）生成可玩的单文件 HTML5 游戏，带沙箱自检修复循环与多轮修改。

**Architecture:** 纯静态前端（vanilla ESM，无构建步骤）+ 无状态 Express 代理（藏 `ARK_API_KEY`，5 个端点）+ 方舟 OpenAI 兼容 API。生成物为单文件 HTML 存档于 `games/`，后端可直接套云函数上线。

**Tech Stack:** Node.js ≥18（内置 fetch / node:test）、Express ^4、vanilla JS (ESM)、Canvas。

**Spec:** `docs/superpowers/specs/2026-09-23-doodle-arcade-design.md`（本计划从 spec 出发，执行者需同时阅读 spec）

## Global Constraints

- Node ≥ 18；`package.json` 设 `"type": "module"`，全部文件 ESM。
- 运行时模型：`doubao-seed-evolving`；API base `https://ark.cn-beijing.volces.com/api/v3/chat/completions`；鉴权 `Authorization: Bearer $ARK_API_KEY`（env 读取）。
- 文章与对外口径使用 **Seed-2.1-pro-0915**（README 与生成物标题注释同此口径）。
- 前端零构建、零框架、零外部 CDN 依赖；生成物单 HTML、800×600 Canvas、零外部依赖、键鼠+触屏。
- 图片 base64 ≤10MB；前端压缩到长边 1280。
- 游戏类型只有两种：`runner` / `flappy`。
- 对外文案（README/游戏内文案）不使用极限词（最/第一/绝对/免费）与导流词。
- 平台：Windows + Git Bash；命令均在仓库根目录执行。
- 提交纪律：每个任务结束即 commit；`games/*.html` 默认 ignore，策展 Demo 用 `git add -f`。
- 开发环境：脚手架/工程在 GLM 会话完成；**prompt 精调（Task 11）必须在豆包后端 Claude Code 会话完成**。

---

### Task 1: 脚手架 + 静态服务器（D1 上午 · GLM 会话）

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `server.js`, `public/index.html`
- Test: `test/server.test.js`

**Interfaces:**
- Produces: `GET /api/health → {"ok":true}`；`express.static` 托管 `public/` 与 `/games`；后续路由挂载点 `app.use('/api', router)`。

- [ ] **Step 1: 写失败测试**

```js
// test/server.test.js
import { test } from 'node:test';
import assert from 'node:assert';

test('server 模块可导入并导出 app（不自动监听）', async () => {
  const { createApp } = await import('../server.js');
  const app = createApp();
  assert.ok(app);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/server.test.js`
Expected: FAIL（找不到 ../server.js）

- [ ] **Step 3: 实现**

```json
// package.json
{
  "name": "doodle-arcade",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/",
    "verify:ark": "node scripts/verify-ark.js",
    "regress": "node scripts/regress.js"
  },
  "dependencies": { "express": "^4.21.2" }
}
```

```gitignore
# .gitignore
node_modules/
.env
games/*.html
```

```bash
# .env.example
ARK_API_KEY=在这里填入火山方舟APIKey
```

```js
// server.js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
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
```

```html
<!-- public/index.html（占位，Task 10 完成完整版） -->
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>涂鸦游戏机 Doodle Arcade</title></head>
<body><h1>涂鸦游戏机 Doodle Arcade</h1><p>建设中…</p></body>
</html>
```

- [ ] **Step 4: 运行测试通过**

Run: `npm i && node --test test/`
Expected: PASS（1 passing）

- [ ] **Step 5: 手动冒烟**

Run: `npm start`，另开终端 `curl http://localhost:3000/api/health`
Expected: `{"ok":true}`；浏览器开 `http://localhost:3000` 见占位页。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 脚手架与静态服务器（health 端点 + public/games 托管）"
```

---

### Task 2: 方舟 API 客户端（含重试）+ 图像输入验证脚本（D1 上午 · GLM 会话）

**Files:**
- Create: `lib/ark.js`, `scripts/verify-ark.js`, `fixtures/README.md`
- Test: `test/ark.test.js`

**Interfaces:**
- Produces: `createArk({ apiKey, model, baseUrl, fetchImpl, maxRetries, timeoutMs })` → `{ chat(messages, opts?) → Promise<string> }`；`imageMessage(text, base64, mime?)` → OpenAI 格式多模态 user message；`class ArkFatalError extends Error`（4xx 不重试）。重试规则：网络错误/超时/429/5xx 重试，指数退避 1s→2s，默认 `maxRetries=2`。

- [ ] **Step 1: 写失败测试**

```js
// test/ark.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { createArk, imageMessage, ArkFatalError } from '../lib/ark.js';

const ok = (text) => ({ status: 200, ok: true, json: async () => ({ choices: [{ message: { content: text } }] }) });

test('chat 返回 content', async () => {
  const ark = createArk({ fetchImpl: async () => ok('你好') });
  assert.equal(await ark.chat([{ role: 'user', content: 'hi' }]), '你好');
});

test('429/5xx/网络错误 按指数退避重试后成功', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls < 3) { const e = new Error('net'); throw e; }
    return ok('第三次成功');
  };
  const ark = createArk({ fetchImpl, sleep: () => Promise.resolve() });
  assert.equal(await ark.chat([{ role: 'user', content: 'hi' }]), '第三次成功');
  assert.equal(calls, 3);
});

test('4xx 抛 ArkFatalError 且不重试', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { status: 401, ok: false, text: async () => 'unauthorized' }; };
  const ark = createArk({ fetchImpl });
  await assert.rejects(() => ark.chat([{ role: 'user', content: 'hi' }]), ArkFatalError);
  assert.equal(calls, 1);
});

test('imageMessage 组装 base64 data URL', () => {
  const m = imageMessage('看图', 'QUJD', 'image/png');
  assert.equal(m.role, 'user');
  assert.deepEqual(m.content[0], { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } });
  assert.deepEqual(m.content[1], { type: 'text', text: '看图' });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/ark.test.js`
Expected: FAIL（无法导入 ../lib/ark.js）

- [ ] **Step 3: 实现**

```js
// lib/ark.js
const DEFAULT_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

export class ArkFatalError extends Error {}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createArk({
  apiKey = process.env.ARK_API_KEY,
  model = process.env.ARK_MODEL || 'doubao-seed-evolving',
  baseUrl = process.env.ARK_BASE_URL || DEFAULT_BASE,
  fetchImpl = fetch,
  maxRetries = 2,
  timeoutMs = 180000,
  sleep = defaultSleep,
} = {}) {
  async function chat(messages, { temperature = 0.7, maxTokens } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await sleep(Math.min(1000 * 2 ** (attempt - 1), 4000));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature, ...(maxTokens ? { max_tokens: maxTokens } : {}) }),
        });
        if (res.status === 429 || res.status >= 500) throw new Error(`ark retryable http ${res.status}`);
        if (!res.ok) throw new ArkFatalError(`ark http ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return data.choices[0].message.content;
      } catch (e) {
        if (e instanceof ArkFatalError) throw e;
        lastErr = e; // 网络/超时/429/5xx → 退避后重试
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }
  return { chat };
}

export function imageMessage(text, base64, mime = 'image/png') {
  return {
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
      { type: 'text', text },
    ],
  };
}
```

```js
// scripts/verify-ark.js —— D1 验证开放点①：图像输入格式
// 用一张程序生成的 16x16 红点 PNG 验证 doubao-seed-evolving 接受 image_url base64 输入。
import { createArk, imageMessage } from '../lib/ark.js';
import { redDotPngBase64 } from '../lib/testimg.js';

const ark = createArk({ maxRetries: 1 });
const prompt = '这张图里主要是什么颜色？只回答颜色名。';
try {
  const out = await ark.chat([imageMessage(prompt, redDotPngBase64())], { maxTokens: 50 });
  console.log('[verify:ark] 图像输入OK，模型回复:', out);
  process.exit(0);
} catch (e) {
  console.error('[verify:ark] 失败:', e.message);
  process.exit(1);
}
```

```js
// lib/testimg.js（完整实现，直接使用）
import zlib from 'node:zlib';

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function redDotPngBase64() {
  const W = 16, H = 16;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 4);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < W; x++) {
      const o = rowStart + 1 + x * 4;
      const red = x >= 4 && x < 12 && y >= 4 && y < 12;
      raw[o] = 255; raw[o + 1] = red ? 0 : 255; raw[o + 2] = red ? 0 : 255; raw[o + 3] = 255;
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png.toString('base64');
}
```

（删除上一段带 `require` 的残缺版本，只保留完整版。）

```markdown
<!-- fixtures/README.md -->
# 回归用涂鸦素材

请放入 3 张**真人手绘**涂鸦照片（手机拍摄即可）：

- `stickman.png` —— 简单火柴人（铅笔线稿）
- `kid-color.png` —— 彩色儿童画（蜡笔/马克笔）
- `winged.png` —— 带翅膀的角色（应触发 flappy）

放入后运行 `npm run regress` 做全流水线回归。文件缺失时 regress 会跳过并提示。
```

- [ ] **Step 4: 运行测试通过**

Run: `node --test test/ark.test.js`
Expected: PASS（4 passing）

- [ ] **Step 5: 真机验证（D1 上午第一件事，需要 .env 里已有 ARK_API_KEY）**

Run: `npm run verify:ark`
Expected: `图像输入OK，模型回复: 红色`（或"红"）。若报 4xx 且信息涉及 image 输入不支持的字段，按报错调整 `imageMessage` 的 content 结构（当前为方舟 OpenAI 兼容标准格式）后重试；**此项结论记录进 Task 11 的 prompt 精调会话上下文**。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 方舟客户端（退避重试+超时+多模态消息）与图像输入验证脚本"
```

---

### Task 3: 模型输出提取器（JSON / HTML）（D1 下午 · GLM 会话）

**Files:**
- Create: `lib/extract.js`
- Test: `test/extract.test.js`

**Interfaces:**
- Produces: `extractJson(text) → object`（优先 ```json 围栏 → 平衡花括号扫描，容忍前后杂文字；解析失败抛 `ExtractError`）；`extractHtml(text) → string`（优先 ```html 围栏 → `<!DOCTYPE`/`<html` 到 `</html>`；找不到抛 `ExtractError`）。

- [ ] **Step 1: 写失败测试**

```js
// test/extract.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { extractJson, extractHtml, ExtractError } from '../lib/extract.js';

test('从 ```json 围栏提取', () => {
  const t = '好的，以下是结果：\n```json\n{"a":1}\n```\n希望有帮助';
  assert.deepEqual(extractJson(t), { a: 1 });
});

test('无围栏时平衡花括号提取（容忍字符串内花括号）', () => {
  const t = '前置说明 {"desc":"包含 } 花括号","b":[2]} 尾部';
  assert.deepEqual(extractJson(t), { desc: '包含 } 花括号', b: [2] });
});

test('解析失败抛 ExtractError', () => {
  assert.throws(() => extractJson('完全没有 JSON'), ExtractError);
});

test('从 ```html 围栏提取完整文档', () => {
  const html = '<!DOCTYPE html><html><body><canvas></canvas></body></html>';
  const t = `来了：\n\`\`\`html\n${html}\n\`\`\``;
  assert.equal(extractHtml(t), html);
});

test('无围栏时从 doctype 提取到 </html>', () => {
  const t = `说明文字\n<!DOCTYPE html><html lang="zh"><head></head><body>游戏</body></html>\n以上`;
  assert.equal(extractHtml(t), '<!DOCTYPE html><html lang="zh"><head></head><body>游戏</body></html>');
});

test('无 HTML 抛 ExtractError', () => {
  assert.throws(() => extractHtml('只有文字'), ExtractError);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/extract.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// lib/extract.js
export class ExtractError extends Error {}

function balancedJsonSlice(text) {
  const start = text.indexOf('{');
  if (start === -1) throw new ExtractError('no json object found');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new ExtractError('unbalanced json');
}

export function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = fence ? [fence[1], text] : [text];
  for (const c of candidates) {
    try { return JSON.parse(balancedJsonSlice(c)); } catch { /* 试下一个 */ }
  }
  throw new ExtractError('json parse failed');
}

export function extractHtml(text) {
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  const candidates = fence ? [fence[1], text] : [text];
  for (const c of candidates) {
    const start = c.search(/<!doctype html|<html/i);
    const end = c.toLowerCase().lastIndexOf('</html>');
    if (start !== -1 && end !== -1 && end > start) return c.slice(start, end + 7);
  }
  throw new ExtractError('no html document found');
}
```

- [ ] **Step 4: 运行测试通过**

Run: `node --test test/extract.test.js`
Expected: PASS（6 passing）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 模型输出提取器（JSON 平衡扫描 / HTML 文档截取）"
```

---

### Task 4: prompt 模板加载器（D1 下午 · GLM 会话，prompt 精调见 Task 11）

**Files:**
- Create: `lib/prompts.js`, `prompts/analyze.md`, `prompts/design.md`, `prompts/generate.md`, `prompts/repair.md`, `prompts/revise.md`
- Test: `test/prompts.test.js`

**Interfaces:**
- Produces: `loadPrompt(name, vars) → string`，`name` 为 `prompts/<name>.md` 文件名主干，`vars` 为 `{KEY: value}`，替换模板中 `{{KEY}}`；未替换的 `{{...}}` 抛 `PromptError`（防漏填）。

- [ ] **Step 1: 写失败测试**

```js
// test/prompts.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { loadPrompt, PromptError } from '../lib/prompts.js';

test('渲染变量并保留正文', () => {
  // 先由测试自己写一个临时模板目录？不——直接测真实 analyze.md 的结构
  const out = loadPrompt('analyze');
  assert.ok(out.includes('suggested_genre'));
});

test('变量替换', () => {
  // 用 design.md（需要 ANALYZE_JSON）
  const out = loadPrompt('design', { ANALYZE_JSON: '{"a":1}' });
  assert.ok(!out.includes('{{ANALYZE_JSON}}'));
  assert.ok(out.includes('{"a":1}'));
});

test('缺变量抛 PromptError', () => {
  assert.throws(() => loadPrompt('design'), PromptError);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/prompts.test.js`
Expected: FAIL

- [ ] **Step 3: 实现（prompt 初版全文——Task 11 在豆包会话精调）**

```js
// lib/prompts.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export class PromptError extends Error {}
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

export function loadPrompt(name, vars = {}) {
  const tpl = fs.readFileSync(path.join(DIR, `${name}.md`), 'utf8');
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, String(v));
  }
  if (/\{\{[A-Z_]+\}\}/.test(out)) {
    throw new PromptError(`prompt ${name} 存在未替换变量: ${out.match(/\{\{[A-Z_]+\}\}/g)}`);
  }
  return out;
}
```

```markdown
<!-- prompts/analyze.md -->
你是专业的涂鸦分析师。仔细观察这张手绘涂鸦照片，只输出一个严格 JSON（无任何其他文字、无解释）：

{
  "characters": [
    { "name": "角色中文名", "desc": "外观：姿态/表情/服饰细节", "personality": "3-5字性格", "bbox": [x1, y1, x2, y2] }
  ],
  "palette": ["#RRGGBB"],
  "style": "画风，如：儿童蜡笔画/铅笔线稿/马克笔涂鸦",
  "mood": "画面情绪，2-4字",
  "suggested_genre": "runner",
  "genre_reason": "一句话说明为什么适合该类型"
}

硬性要求：
1. bbox 是角色主体边界框，取 0-1000 归一化坐标（图片左上角为原点，x 向右 y 向下）；
2. suggested_genre 只能是 "runner" 或 "flappy"：角色有翅膀/会飞/悬浮特征 → flappy；站立/奔跑/有腿 → runner；
3. palette 取涂鸦中真实出现的主色 5-8 个，含线稿颜色与纸底色；
4. characters 至少 1 个，最多 3 个（次要元素并入 desc）；
5. 只输出 JSON。
```

```markdown
<!-- prompts/design.md -->
你是游戏设计师。基于以下涂鸦分析 JSON，为这个涂鸦角色设计一个单文件 HTML5 小游戏。只输出严格 JSON：

{
  "title": "游戏标题（中文，含角色名）",
  "genre": "runner 或 flappy（必须沿用分析结论）",
  "mechanics": {
    "move": "主角如何移动与操作",
    "obstacles": "障碍物设计（形状/行为，取材自涂鸦元素）",
    "scoring": "计分规则"
  },
  "difficulty": "难度曲线一句话：从轻松到挑战如何递进",
  "win_lose": "失败与结束条件",
  "easter_egg": "一个与角色性格呼应的小彩蛋",
  "bio": "角色小传，60 字内，展示在游戏开始画面"
}

硬性要求：
1. 机制必须能在 800x600 Canvas、单文件、无外部资源下实现；
2. 障碍物与彩蛋要呼应涂鸦的 mood 与 characters[].personality；
3. 只输出 JSON。

涂鸦分析 JSON：
{{ANALYZE_JSON}}
```

```markdown
<!-- prompts/generate.md -->
你是资深 HTML5 游戏工程师。根据设计稿生成一个完整可玩的单文件 HTML5 游戏。严格遵守《代码契约》：

【代码契约】
1. 只输出一个完整 HTML 文档：从 <!DOCTYPE html> 开始到 </html> 结束；无外部依赖、无网络请求、无 import/script src；
2. 800x600 Canvas 页面居中，requestAnimationFrame 主循环；
3. 主角精灵使用下方注入的 SPRITE_DATA（base64 PNG 的 data URL），等比绘制，不拉伸变形；
4. 场景与 UI 配色只使用 PALETTE 中给出的颜色；
5. 输入：键盘（空格或 ↑）与触屏（touchstart）都触发跳跃/拍翅；
6. 页面加载后立即开始；全局暴露 window.DOODLE_GAME = { start: Function, stop: Function, getScore: Function }；
7. 游戏结束显示得分与"重新开始"按钮（点击或按空格重开）；
8. 开始画面（首个 1.5 秒）显示设计稿中的 title 与 bio。

精灵图（data URL，直接用作 img.src）：
{{SPRITE_DATA}}

配色 PALETTE：
{{PALETTE_JSON}}

设计稿：
{{DESIGN_JSON}}

只输出 HTML 本身，放在一个 ```html 代码块中。
```

```markdown
<!-- prompts/repair.md -->
你之前生成的 HTML5 游戏在沙箱试跑时出现问题。请修复，输出修复后的完整单文件 HTML。

要求：
1. 严格保持《代码契约》（与生成时相同的 8 条）；
2. 优先修复报错指向的问题，其余逻辑尽量不动；
3. 只输出完整 HTML（```html 代码块）。

【沙箱报错信息】
{{ERRORS}}

【当前代码】
{{HTML}}
```

```markdown
<!-- prompts/revise.md -->
根据用户指令修改这个 HTML5 游戏，输出修改后的完整单文件 HTML。

要求：
1. 严格保持《代码契约》（与生成时相同的 8 条）；
2. 只改指令相关的部分，最小化改动；
3. 只输出完整 HTML（```html 代码块）。

【用户指令】{{INSTRUCTION}}

【当前代码】{{HTML}}
```

- [ ] **Step 4: 运行测试通过**

Run: `node --test test/prompts.test.js`
Expected: PASS（3 passing）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: prompt 模板加载器与 5 个初版模板（analyze/design/generate/repair/revise）"
```

---

### Task 5: 五个 API 路由（analyze / design / generate / repair / revise）（D1 下午 · 完成后可用 curl 对一张真涂鸦做 API 级端到端）

**Files:**
- Create: `routes/api.js`
- Modify: `server.js`（挂载 router）
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `createArk().chat`、`imageMessage`、`extractJson/extractHtml`、`loadPrompt`。
- Produces（前端依赖的 HTTP 契约）:
  - `POST /api/analyze {imageBase64, mime?} → {analysis}`（analysis 即结构化 JSON；非法则整体重试 1 次后 422）
  - `POST /api/design {analysis} → {design}`
  - `POST /api/generate {design, spriteBase64} → {html, file}`（file 为存档相对路径 `games/doodle-<ts>.html`）
  - `POST /api/repair {html, errors[]} → {html}`
  - `POST /api/revise {html, instruction} → {html}`
  - 错误统一 `{error: string}` + 4xx/5xx。
- 路由工厂：`createApiRouter({ ark } = {})`，默认用真实 `createArk()`，测试注入 stub。

- [ ] **Step 1: 写失败测试**

```js
// test/api.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { createApiRouter } from '../routes/api.js';

const fakeArk = (fn) => ({ chat: fn });
const jsonOk = (obj) => ({ status: 200, ok: true, json: async () => ({ choices: [{ message: { content: '```json\n' + JSON.stringify(obj) + '\n```' } }] }) });
const htmlOk = (html) => ({ status: 200, ok: true, json: async () => ({ choices: [{ message: { content: '```html\n' + html + '\n```' } }] }) });

async function post(router, path, body) {
  let status, payload;
  const res = { status: (s) => { status = s; return res; }, json: (d) => { payload = d; } };
  await router.handle({ method: 'POST', path, body: body ?? {} }, res, () => {});
  return { status, payload };
}
const HTML = '<!DOCTYPE html><html><body></body></html>';

test('analyze 返回结构化结果', async () => {
  const analysis = { characters: [{ name: '火柴人', bbox: [10, 10, 900, 950] }], palette: ['#333333'], style: '铅笔线稿', mood: '欢快', suggested_genre: 'runner', genre_reason: '有腿' };
  const router = createApiRouter({ ark: fakeArk(async () => jsonOk(analysis)) });
  const r = await post(router, '/analyze', { imageBase64: 'QUJD' });
  assert.equal(r.status, 200); assert.equal(r.payload.analysis.suggested_genre, 'runner');
});

test('analyze 非法 genre 校验失败→422', async () => {
  const bad = { characters: [], palette: [], suggested_genre: 'rpg' };
  const router = createApiRouter({ ark: fakeArk(async () => jsonOk(bad)) });
  const r = await post(router, '/analyze', { imageBase64: 'QUJD' });
  assert.equal(r.status, 422);
});

test('generate 返回 html 且落盘', async (t) => {
  const fs = await import('node:fs');
  const dir = await import('node:fs/promises');
  const tmp = await dir.mkdtemp('doodle-test-');
  const router = createApiRouter({ ark: fakeArk(async () => htmlOk(HTML)), gamesDir: tmp });
  const r = await post(router, '/generate', { design: { title: 'T' }, spriteBase64: 'QUJD' });
  assert.equal(r.status, 200); assert.ok(r.payload.html.includes('<html>')); assert.ok(r.payload.file);
  const saved = fs.readFileSync(`${tmp}/${r.payload.file.split('/').pop()}`, 'utf8');
  assert.ok(saved.includes('<html>'));
});

test('repair / revise 透传 html', async () => {
  const router = createApiRouter({ ark: fakeArk(async (msgs) => htmlOk(HTML)) });
  assert.equal((await post(router, '/repair', { html: HTML, errors: ['x is not defined'] })).status, 200);
  assert.equal((await post(router, '/revise', { html: HTML, instruction: '跳高一点' })).status, 200);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/api.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// routes/api.js
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createArk, imageMessage } from '../lib/ark.js';
import { extractJson, extractHtml } from '../lib/extract.js';
import { loadPrompt } from '../lib/prompts.js';

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
    const out = await ark.chat([{ role: 'user', content: prompt }], { temperature: 0.7 });
    return extractHtml(out);
  }

  router.post('/generate', async (req, res, next) => {
    try {
      const { design, spriteBase64, palette } = req.body ?? {};
      if (!design || !spriteBase64) return res.status(400).json({ error: 'design 与 spriteBase64 必填' });
      const prompt = loadPrompt('generate', {
        SPRITE_DATA: `data:image/png;base64,${spriteBase64}`,
        PALETTE_JSON: JSON.stringify(Array.isArray(palette) && palette.length ? palette : FALLBACK_PALETTE),
        DESIGN_JSON: JSON.stringify(design),
      });
      const html = await chatHtml(ark, prompt);
      const file = `doodle-${Date.now()}.html`;
      fs.writeFileSync(path.join(GAMES, file), html);
      res.json({ html, file: `games/${file}` });
    } catch (e) { next(e); }
  });

  router.post('/repair', async (req, res, next) => {
    try {
      const { html, errors } = req.body ?? {};
      if (!html || !Array.isArray(errors)) return res.status(400).json({ error: 'html 与 errors[] 必填' });
      const prompt = loadPrompt('repair', { ERRORS: errors.join('\n'), HTML: html });
      res.json({ html: await chatHtml(ark, prompt) });
    } catch (e) { next(e); }
  });

  router.post('/revise', async (req, res, next) => {
    try {
      const { html, instruction } = req.body ?? {};
      if (!html || !instruction) return res.status(400).json({ error: 'html 与 instruction 必填' });
      const prompt = loadPrompt('revise', { INSTRUCTION: instruction, HTML: html });
      res.json({ html: await chatHtml(ark, prompt) });
    } catch (e) { next(e); }
  });

  router.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  });
  return router;
}
```

`server.js` 修改（挂载路由，在 health 端点之后）：

```js
// server.js 顶部 import 区加入：
import { createApiRouter } from './routes/api.js';
// createApp() 内 health 之后加入：
app.use('/api', createApiRouter());
```

- [ ] **Step 4: 运行全部测试通过**

Run: `node --test test/`
Expected: PASS（ark/extract/prompts/api/server 全绿）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 五个生成端点（analyze/design/generate/repair/revise）+ 参数校验 + JSON 重试 + 生成物落盘"
```

---

### Task 6: 前端涂鸦预处理 sprite.js（D2 上午）

**Files:**
- Create: `public/js/sprite.js`
- Test: `test/sprite.test.js`

**Interfaces:**
- Produces（纯函数，Node 可测）: `removeWhiteBg(data: Uint8ClampedArray, threshold=235) → Uint8ClampedArray`；`inkBounds(data, width, height) → {x,y,w,h} | null`。
- Produces（浏览器函数，Task 9 用）: `preprocessDoodle(file: File) → Promise<{ imageBase64, spriteBase64, width, height }>`（压缩长边 1280 → 去白底 → inkBounds 裁剪 → PNG base64）。

- [ ] **Step 1: 写失败测试**

```js
// test/sprite.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { removeWhiteBg, inkBounds } from '../public/js/sprite.js';

const px = (...rgba) => new Uint8ClampedArray(rgba);

test('近白像素透明，深色保留', () => {
  const out = removeWhiteBg(px(250, 250, 250, 255, 30, 30, 30, 255));
  assert.equal(out[3], 0);
  assert.equal(out[7], 255);
});

test('inkBounds 找到非白不透明像素包围盒', () => {
  // 2x2：仅 (1,1) 是黑
  const data = px(
    255, 255, 255, 255,
    255, 255, 255, 255,
    255, 255, 255, 255,
      0,   0,   0, 255,
  );
  assert.deepEqual(inkBounds(data, 2, 2), { x: 1, y: 1, w: 1, h: 1 });
});

test('全白返回 null', () => {
  assert.equal(inkBounds(px(255, 255, 255, 255), 1, 1), null);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/sprite.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// public/js/sprite.js
export function removeWhiteBg(data, threshold = 235) {
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i] >= threshold && out[i + 1] >= threshold && out[i + 2] >= threshold) out[i + 3] = 0;
  }
  return out;
}

export function inkBounds(data, width, height) {
  let x1 = width, y1 = height, x2 = -1, y2 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const visible = data[i + 3] > 16 && !(data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235);
      if (visible) {
        if (x < x1) x1 = x; if (x > x2) x2 = x;
        if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
    }
  }
  return x2 < 0 ? null : { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

// —— 浏览器侧（Node 测试不覆盖，靠 Task 12 集成回归） ——
export async function preprocessDoodle(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const W = Math.max(1, Math.round(bitmap.width * scale));
  const H = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, W, H);

  const full = ctx.getImageData(0, 0, W, H);
  const imageBase64 = canvas.toDataURL('image/png').split(',')[1]; // 原图（analyze 用）

  const cleaned = removeWhiteBg(full.data);
  const b = inkBounds(cleaned, W, H) || { x: 0, y: 0, w: W, h: H };
  const pad = Math.round(Math.max(b.w, b.h) * 0.05);
  const bx = Math.max(0, b.x - pad), by = Math.max(0, b.y - pad);
  const bw = Math.min(W - bx, b.w + pad * 2), bh = Math.min(H - by, b.h + pad * 2);
  const sprite = document.createElement('canvas');
  sprite.width = bw; sprite.height = bh;
  const sctx = sprite.getContext('2d');
  // putImageData 不支持偏移裁剪：先用 tmp 画布承载 cleaned，再 drawImage 裁剪出精灵
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(cleaned), W, H), 0, 0);
  sctx.drawImage(tmp, bx, by, bw, bh, 0, 0, bw, bh);
  const spriteBase64 = sprite.toDataURL('image/png').split(',')[1];
  return { imageBase64, spriteBase64, width: W, height: H };
}
```

- [ ] **Step 4: 运行测试通过**

Run: `node --test test/sprite.test.js`
Expected: PASS（3 passing）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 涂鸦预处理（去白底/墨迹包围盒为纯函数+测试，preprocessDoodle 浏览器侧）"
```

---

### Task 7: 沙箱 sandbox.js（健康检测 + 版本管理）（D2 上午）

**Files:**
- Create: `public/js/sandbox.js`
- Test: `test/sandbox.test.js`（只测 srcdoc 注入与 bootstrap 脚本字符串的纯逻辑部分）

**Interfaces:**
- Produces: `buildSrcdoc(html) → string`（在 `</head>` 前注入健康探针脚本）；`createSandbox(container: HTMLElement)` → `{ load(html) → Promise<{ok, errors[]}>， setVersions(list, index) → Promise<...>， current }`。`load` 判定：收到探针 `ok` 消息 → resolve `{ok:true, errors:[]}`；收到错误 → 立即 resolve `{ok:false, errors}`；2.5s 无首帧 → resolve `{ok:false, errors:['TIMEOUT: 2.5s 内无首帧渲染']}`。消息通道 `window.postMessage({source:'doodle-sandbox', ...})`。

- [ ] **Step 1: 写失败测试**

```js
// test/sandbox.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { buildSrcdoc } from '../public/js/sandbox.js';

test('注入健康探针且游戏本体在 </head> 后保留', () => {
  const html = '<!DOCTYPE html><html><head><title>t</title></head><body><canvas></canvas></body></html>';
  const doc = buildSrcdoc(html);
  assert.ok(doc.includes('doodle-sandbox'));
  assert.ok(doc.indexOf('doodle-sandbox') < doc.indexOf('</title>'));
  assert.ok(doc.includes('<canvas></canvas>'));
  assert.ok(doc.endsWith('</html>'));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/sandbox.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// public/js/sandbox.js
export const SANDBOX_TIMEOUT_MS = 2500;

export function buildSrcdoc(html) {
  const probe = `<script>
(function () {
  var sent = false;
  function report(ok, errors) {
    if (sent) return; sent = true;
    try { parent.postMessage({ source: 'doodle-sandbox', ok: ok, errors: errors || [] }, '*'); } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    report(false, [String(e.message || 'unknown error') + (e.lineno ? ' @line' + e.lineno : '')]);
  });
  window.addEventListener('unhandledrejection', function (e) {
    report(false, ['unhandledrejection: ' + String(e.reason)]);
  });
  var origDraw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function () {
    origDraw.apply(this, arguments);
    setTimeout(function () { report(true, []); }, 0);
  };
  ['fillRect', 'clearRect'].forEach(function (name) {
    var orig = CanvasRenderingContext2D.prototype[name];
    CanvasRenderingContext2D.prototype[name] = function () {
      orig.apply(this, arguments);
      if (name === 'fillRect') setTimeout(function () { report(true, []); }, 0);
    };
  });
})();
</script>`;
  if (</head>/i.test(html)) return html.replace(/<\/head>/i, probe + '</head>');
  return probe + html; // 无 head 的兜底
}

export function createSandbox(container) {
  let iframe = null;
  let versions = [];      // [{label, html}]
  let current = -1;

  function freshIframe() {
    if (iframe) iframe.remove();
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;aspect-ratio:4/3;border:0;border-radius:12px;background:#111;';
    iframe.setAttribute('sandbox', 'allow-scripts');
    container.appendChild(iframe);
    return iframe;
  }

  function load(html) {
    return new Promise((resolve) => {
      const f = freshIframe();
      const timer = setTimeout(
        () => resolve({ ok: false, errors: [`TIMEOUT: ${SANDBOX_TIMEOUT_MS}ms 内无首帧渲染`] }),
        SANDBOX_TIMEOUT_MS,
      );
      const onMsg = (ev) => {
        const d = ev.data;
        if (!d || d.source !== 'doodle-sandbox') return;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve({ ok: !!d.ok, errors: d.errors || [] });
      };
      window.addEventListener('message', onMsg);
      f.srcdoc = buildSrcdoc(html);
    });
  }

  async function show(i) {
    current = i;
    await load(versions[i].html);
  }

  function pushVersion(label, html) {
    versions.push({ label, html });
    return versions.length - 1;
  }

  return {
    load,
    pushVersion,
    show,
    get versions() { return versions; },
    get current() { return current; },
  };
}
```

- [ ] **Step 4: 运行测试通过**

Run: `node --test test/sandbox.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: iframe 沙箱（健康探针注入/错误捕获/首帧检测/版本栈）"
```

---

### Task 8: 流水线编排 pipeline.js（含自检修复循环）（D2 上午）

**Files:**
- Create: `public/js/pipeline.js`
- Test: `test/pipeline.test.js`（用注入的 fetch 与假沙箱测编排与修复循环）

**Interfaces:**
- Consumes: `preprocessDoodle`（可注入）、`createSandbox().load`（可注入）。
- Produces: `runPipeline(file, { onStep, preprocess, postJson }) → Promise<{imageBase64, spriteBase64, analysis, design, html, fileSaved}>`；`checkAndRepair(html, sandbox, { onStep, postJson, maxRepair = 2 }) → Promise<{html, repaired, errors}>`（`repaired: 0=一次通过，1/2=修复轮数，-1=修不好保留原版`）。`postJson(url, body)` 默认用 `fetch`。

- [ ] **Step 1: 写失败测试**

```js
// test/pipeline.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { runPipeline, checkAndRepair } from '../public/js/pipeline.js';

const HTML = '<!DOCTYPE html><html><body></body></html>';

test('runPipeline 依次调用 analyze/design/generate 并回调步骤', async () => {
  const steps = [];
  const calls = [];
  const postJson = async (url, body) => {
    calls.push(url);
    if (url.endsWith('/analyze')) return { analysis: { suggested_genre: 'runner', palette: ['#111111'] } };
    if (url.endsWith('/design')) return { design: { title: '火柴人快跑' } };
    if (url.endsWith('/generate')) return { html: HTML, file: 'games/x.html' };
  };
  const out = await runPipeline({}, {
    onStep: (name, state, data) => steps.push([name, state]),
    preprocess: async () => ({ imageBase64: 'A', spriteBase64: 'B', width: 100, height: 100 }),
    postJson,
  });
  assert.deepEqual(calls.map((c) => c.split('/').pop()), ['analyze', 'design', 'generate']);
  assert.equal(out.design.title, '火柴人快跑');
  assert.ok(steps.some(([n, s]) => n === 'analyze' && s === 'done'));
});

test('checkAndRepair：一次通过', async () => {
  const sandbox = { load: async () => ({ ok: true, errors: [] }) };
  const r = await checkAndRepair(HTML, sandbox, {});
  assert.equal(r.repaired, 0);
});

test('checkAndRepair：失败→修复一轮通过', async () => {
  let n = 0;
  const sandbox = { load: async () => (n++ === 0 ? { ok: false, errors: ['x'] } : { ok: true, errors: [] }) };
  const postJson = async () => ({ html: HTML + '<!--fixed-->' });
  const r = await checkAndRepair(HTML, sandbox, { postJson });
  assert.equal(r.repaired, 1);
  assert.ok(r.html.includes('fixed'));
});

test('checkAndRepair：两轮修不好→保留原版并标记 -1', async () => {
  const sandbox = { load: async () => ({ ok: false, errors: ['x'] }) };
  const postJson = async () => ({ html: HTML + '<!--f-->' });
  const r = await checkAndRepair(HTML, sandbox, { postJson });
  assert.equal(r.repaired, -1);
  assert.equal(r.html, HTML);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/pipeline.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
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
```

- [ ] **Step 4: 运行测试通过**

Run: `node --test test/pipeline.test.js`
Expected: PASS（4 passing）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 前端流水线编排与自检修复循环（≤2 轮，修不好明示）"
```

---

### Task 9: 完整 UI（index.html / style.css / app.js）（D2 下午）

**Files:**
- Modify: `public/index.html`（替换占位）
- Create: `public/style.css`, `public/js/app.js`

**Interfaces:**
- Consumes: `runPipeline`、`checkAndRepair`、`createSandbox`、`/api/revise`。
- Produces: 完整单页应用。DOM id 契约（app.js 与 index.html 一致）：`#upload`（file input）、`#preview`（涂鸦预览 img）、`#timeline`（步骤列表）、`#panel`（理解面板）、`#stage`（沙箱容器）、`#versions`（版本切换按钮组）、`#revise-form`/`#revise-input`（修改框）。

- [ ] **Step 1: 实现 index.html**

```html
<!-- public/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>涂鸦游戏机 Doodle Arcade</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <h1>🎨 涂鸦游戏机 <span class="en">Doodle Arcade</span></h1>
    <p class="sub">拍一张手绘涂鸦 → 豆包 Seed-2.1-pro-0915 看图、设计、写码 → 还你一个能玩的游戏</p>
  </header>

  <main>
    <section id="left">
      <label class="upload" for="upload">📷 上传涂鸦照片
        <input type="file" id="upload" accept="image/*">
      </label>
      <img id="preview" alt="涂鸦预览" hidden>
      <ol id="timeline" aria-label="生成时间线"></ol>
      <div id="panel" hidden>
        <h2>🧠 AI 看到了什么</h2>
        <div id="panel-body"></div>
      </div>
    </section>

    <section id="right">
      <div id="stage"><p class="hint">生成的游戏会出现在这里</p></div>
      <div id="versions" role="tablist"></div>
      <form id="revise-form" hidden>
        <input id="revise-input" type="text" placeholder="试试：跳得再高一点 / 加金币 / 换成夜晚配色" autocomplete="off">
        <button type="submit">改一下</button>
      </form>
    </section>
  </main>

  <footer>
    <p>Doodle Arcade · 由 Seed-2.1-pro-0915（doubao-seed-evolving）驱动 · 仅用于创作征集演示</p>
  </footer>

  <script type="module" src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 实现 style.css（街机暗色风，克制即可）**

```css
/* public/style.css */
:root {
  --bg: #14161f; --card: #1e2130; --line: #2c3042;
  --text: #e8eaf2; --dim: #9aa0b5; --accent: #ffd166; --ok: #6ee7a0; --bad: #ff6b6b;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, 'Microsoft YaHei', sans-serif; background: var(--bg); color: var(--text); }
header { padding: 20px 24px 8px; }
h1 { margin: 0; font-size: 1.5rem; }
h1 .en { color: var(--accent); font-size: 1rem; }
.sub { color: var(--dim); margin: 6px 0 0; }
main { display: grid; grid-template-columns: minmax(300px, 420px) 1fr; gap: 16px; padding: 16px 24px; }
@media (max-width: 860px) { main { grid-template-columns: 1fr; } }
#left, #right { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
.upload { display: block; border: 2px dashed var(--line); border-radius: 12px; padding: 28px; text-align: center; cursor: pointer; color: var(--dim); }
.upload:hover { border-color: var(--accent); color: var(--text); }
.upload input { display: none; }
#preview { width: 100%; border-radius: 10px; margin-top: 12px; background: #fff; }
#timeline { list-style: none; padding: 0; margin: 14px 0 0; display: grid; gap: 8px; }
#timeline li { display: flex; gap: 8px; align-items: baseline; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; font-size: 0.9rem; }
#timeline li.running { border-color: var(--accent); }
#timeline li.done { border-color: var(--ok); }
#timeline li.error { border-color: var(--bad); }
#timeline .state { font-size: 0.75rem; color: var(--dim); margin-left: auto; }
#panel h2 { font-size: 1rem; margin: 16px 0 8px; }
.chip { display: inline-block; background: var(--bg); border: 1px solid var(--line); padding: 2px 10px; border-radius: 999px; font-size: 0.8rem; margin: 2px; }
.swatches { display: flex; gap: 6px; margin: 8px 0; }
.swatch { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); }
.card { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; margin: 6px 0; font-size: 0.88rem; }
.card b { color: var(--accent); }
#stage { min-height: 320px; display: grid; place-items: center; }
#stage .hint { color: var(--dim); }
#versions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
#versions button { background: var(--bg); color: var(--text); border: 1px solid var(--line); padding: 6px 14px; border-radius: 999px; cursor: pointer; }
#versions button.active { border-color: var(--accent); color: var(--accent); }
#revise-form { display: flex; gap: 8px; margin-top: 12px; }
#revise-input { flex: 1; background: var(--bg); border: 1px solid var(--line); color: var(--text); border-radius: 10px; padding: 10px 12px; }
#revise-form button, #revise-input { font-size: 0.9rem; }
#revise-form button { background: var(--accent); color: #1a1a1a; border: 0; border-radius: 10px; padding: 0 18px; cursor: pointer; }
footer { color: var(--dim); font-size: 0.8rem; padding: 8px 24px 20px; }
```

- [ ] **Step 3: 实现 app.js**

```js
// public/js/app.js
import { runPipeline, checkAndRepair, defaultPostJson } from './pipeline.js';
import { createSandbox } from './sandbox.js';

const $ = (id) => document.getElementById(id);
const upload = $('upload'), preview = $('preview'), timeline = $('timeline');
const panel = $('panel'), panelBody = $('panel-body'), stage = $('stage');
const versionsEl = $('versions'), reviseForm = $('revise-form'), reviseInput = $('revise-input');

const sandbox = createSandbox(stage);
let currentHtml = null;
const STEP_LABELS = { preprocess: '🖼️ 预处理', analyze: '👀 看图', design: '📋 设计', generate: '💻 写码', repair: '🔧 自检修复', revise: '✏️ 修改' };

function renderStep(name, state, data) {
  let li = timeline.querySelector(`[data-step="${name}"]`);
  if (!li) {
    li = document.createElement('li');
    li.dataset.step = name;
    li.innerHTML = `<span>${STEP_LABELS[name] || name}</span><span class="state"></span>`;
    timeline.appendChild(li);
  }
  li.className = state;
  const st = li.querySelector('.state');
  st.textContent = state === 'running' ? '进行中…' : state === 'done' ? '完成' : state === 'error' ? '失败' : '';
  if (name === 'repair' && state === 'running' && data) {
    st.textContent = `第${data.round}轮：${(data.errors || []).slice(0, 2).join('；').slice(0, 60)}`;
  }
}

function renderPanel(analysis) {
  panel.hidden = false;
  const chars = analysis.characters.map((c) =>
    `<div class="card"><b>${c.name}</b>（${c.personality || ''}）<br>${c.desc || ''}</div>`).join('');
  const sw = analysis.palette.map((p) => `<span class="swatch" style="background:${p}" title="${p}"></span>`).join('');
  panelBody.innerHTML = `
    <div>${sw}</div>
    <span class="chip">画风：${analysis.style || '—'}</span>
    <span class="chip">情绪：${analysis.mood || '—'}</span>
    <span class="chip">类型决策：${analysis.suggested_genre}（${analysis.genre_reason || ''}）</span>
    ${chars}`;
}

function renderVersions() {
  versionsEl.innerHTML = '';
  sandbox.versions.forEach((v, i) => {
    const b = document.createElement('button');
    b.textContent = v.label;
    b.className = i === sandbox.current ? 'active' : '';
    b.onclick = () => sandbox.show(i);
    versionsEl.appendChild(b);
  });
}

upload.addEventListener('change', async () => {
  const file = upload.files[0];
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  timeline.innerHTML = '';
  try {
    const result = await runPipeline(file, { onStep: renderStep });
    renderPanel(result.analysis);
    sandbox.pushVersion('v1 初版', result.html);
    const verdict = await checkAndRepair(result.html, sandbox, { onStep: renderStep });
    currentHtml = verdict.html;
    if (verdict.repaired > 0) sandbox.pushVersion(`v1 修复版（第${verdict.repaired}轮）`, verdict.html);
    if (verdict.repaired === -1) renderStep('repair', 'error', {});
    await sandbox.show(sandbox.versions.length - 1);
    renderVersions();
    reviseForm.hidden = false;
  } catch (e) {
    renderStep('generate', 'error', {});
    timeline.insertAdjacentHTML('beforeend', `<li class="error">出错了：${e.message}</li>`);
  }
});

reviseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const instruction = reviseInput.value.trim();
  if (!instruction || !currentHtml) return;
  renderStep('revise', 'running');
  try {
    const { html } = await defaultPostJson('/api/revise', { html: currentHtml, instruction });
    currentHtml = html;
    sandbox.pushVersion(`v${sandbox.versions.length + 1}：${instruction.slice(0, 8)}`, html);
    const v = await checkAndRepair(html, sandbox, { onStep: renderStep });
    currentHtml = v.html;
    await sandbox.show(sandbox.versions.length - 1);
    renderVersions();
    renderStep('revise', 'done');
    reviseInput.value = '';
  } catch (err) {
    renderStep('revise', 'error', {});
  }
});
```

- [ ] **Step 4: 手动冒烟（无 key 也能看 UI）**

Run: `npm start` → 浏览器 `http://localhost:3000`
Expected: 页面完整显示上传框/时间线占位/舞台区；控制台无报错。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 完整 UI（上传/时间线/理解面板/沙箱舞台/版本切换/多轮修改）"
```

---

### Task 10: 真机端到端（D2 下午 · UI 就绪后的整体里程碑）

**Files:** 无新文件（验证任务）

**Interfaces:**
- Consumes: 全部前序任务成果 + `.env` 真实 `ARK_API_KEY` + 一张真人涂鸦照片。

- [ ] **Step 1: 配置环境**

复制 `.env.example` 为 `.env` 填入真实 Key。Windows 下 `npm start` 前先在当前终端 `export ARK_API_KEY=...`（或用 `set -a; source .env; set +a`）。

- [ ] **Step 2: 端到端跑一张真人涂鸦**

浏览器上传涂鸦 → 观察时间线四步推进 → 理解面板出结果 → 沙箱出可玩游戏。
Expected: 游戏可玩（键盘+鼠标点击页面后触屏逻辑用手机浏览器验证，可推迟到 D2）；至少记录一次控制台/网络面板的完整过程截图（文章素材）。
若 `analyze` 返回 422：多为 prompt 约束不够硬，把真实坏输出贴进 Task 11 的精调清单。

- [ ] **Step 3: Commit（若期间有修补）**

```bash
git add -A
git commit -m "fix: 首次真机端到端的修补"
```

---

### Task 11: Prompt 精调（D1 启动、贯穿 D2 · 必须在豆包后端 Claude Code 会话执行）

> 这是文章叙事的关键：核心 prompt 的开发过程真实发生在豆包模型上。GLM 会话只做脚手架（Task 1-10）。

**Files:**
- Modify: `prompts/*.md`（精调）
- Create: `docs/prompt-tuning-log.md`（记录每次调整与效果，文章素材）

**Interfaces:**
- Consumes: Task 2 的验证结论、Task 10 遇到的真实坏输出。
- Produces: 精调后的 5 个 prompt + 调参日志。

- [ ] **Step 1: 启动豆包后端会话（新终端，Git Bash）**

```bash
cd "C:\Users\xiaotao\Desktop\CSDN相关\豆包\三期投稿\doodle-arcade"
export ANTHROPIC_BASE_URL=https://ark.cn-beijing.volces.com/api/plan
export ANTHROPIC_AUTH_TOKEN=<你的方舟APIKey>   # 需已订阅 Agent Plan（沿用二期配置）
claude
```

若 plan 端点报错（开放点②），退回验证：`curl` 直接 POST `https://ark.cn-beijing.volces.com/api/v3/chat/completions` 确认 key 有效，并检查二期文档中的开通状态；仍不行则在 GLM 会话完成精调并在文章中如实只写运行链路（豆包 API 驱动全部生成能力）。

- [ ] **Step 2: 在豆包会话里逐个精调（每轮都用 fixtures 真涂鸦验证）**

对每个 prompt 做"改一版 → `npm run regress`（Task 12 完成后）或手动上传 → 看结果"循环：
1. `analyze`：bbox 是否套住主角（看理解面板/裁出的精灵图）；genre 决策是否合理；JSON 是否总一次通过；
2. `generate`：游戏是否可玩、精灵是否未变形、配色是否来自 palette、契约 8 条是否全守住（尤其 `window.DOODLE_GAME` 与自动开始）；
3. `repair`：故意制造一个坏 HTML（如删掉一个函数）验证修复轮真的能修；
4. `revise`：三条标准指令（跳更高/加金币/夜晚配色）验证改动最小化；
5. `design`：title 是否含角色名、bio 是否 60 字内。

每次调整在 `docs/prompt-tuning-log.md` 追加一行：日期 | prompt | 改动 | 之前效果 | 之后效果。

- [ ] **Step 3: Commit**

```bash
git add prompts/ docs/prompt-tuning-log.md
git commit -m "feat: prompt 精调（豆包后端会话完成）+ 调参日志"
```

---

### Task 12: fixtures 回归脚本（D2 下午）

**Files:**
- Create: `scripts/regress.js`
- Test: `test/regress.test.js`（只测参数拼装与跳过逻辑，不发真请求）

**Interfaces:**
- Consumes: `createArk`、`loadPrompt`、`extractJson/extractHtml`、`fixtures/*.png|jpg`。
- Produces: `runFixtures({ dir, ark }) → Promise<Array<{file, ok, genre, repaired?, error?}>>`（供脚本与测试共用）；CLI 输出汇总表并写 `games/regress-report.json`。

- [ ] **Step 1: 写失败测试**

```js
// test/regress.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { listFixtureFiles } from '../scripts/regress.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('列出目录下的图片 fixture，缺失目录返回空数组', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-'));
  assert.deepEqual(listFixtureFiles(tmp), []);
  fs.writeFileSync(path.join(tmp, 'stickman.png'), 'x');
  fs.writeFileSync(path.join(tmp, 'notes.txt'), 'x');
  const files = listFixtureFiles(tmp);
  assert.equal(files.length, 1);
  assert.ok(files[0].endsWith('stickman.png'));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/regress.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// scripts/regress.js
import fs from 'node:fs';
import path from 'node:path';
import { createArk, imageMessage } from '../lib/ark.js';
import { extractJson, extractHtml } from '../lib/extract.js';
import { loadPrompt } from '../lib/prompts.js';

export function listFixtureFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => path.join(dir, f));
  } catch { return []; }
}

export async function runFixtures({ dir = 'fixtures', ark = createArk() } = {}) {
  const files = listFixtureFiles(dir);
  if (!files.length) { console.log(`[regress] ${dir} 无涂鸦素材，跳过（见 fixtures/README.md）`); return []; }
  const results = [];
  for (const file of files) {
    const b64 = fs.readFileSync(file).toString('base64');
    const entry = { file: path.basename(file), ok: false };
    try {
      const a = extractJson(await ark.chat([imageMessage(loadPrompt('analyze'), b64, 'image/png')]));
      entry.genre = a.suggested_genre;
      const d = extractJson(await ark.chat([{ role: 'user', content: loadPrompt('design', { ANALYZE_JSON: JSON.stringify(a) }) }]));
      const html = extractHtml(await ark.chat([{ role: 'user', content: loadPrompt('generate', {
        SPRITE_DATA: `data:image/png;base64,${b64}`,
        PALETTE_JSON: JSON.stringify(a.palette),
        DESIGN_JSON: JSON.stringify(d),
      }) }]));
      fs.writeFileSync(path.join('games', `regress-${path.basename(file, path.extname(file))}.html`), html);
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
    fs.mkdirSync('games', { recursive: true });
    fs.writeFileSync('games/regress-report.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
    process.exit(results.every((r) => r.ok) ? 0 : 1);
  }
}
```

- [ ] **Step 4: 测试通过**

Run: `node --test test/regress.test.js`
Expected: PASS

- [ ] **Step 5: 投入真涂鸦回归（用户已放 3 张真人涂鸦进 fixtures/）**

Run: `npm run regress`
Expected: 3 行 ok=true；`games/regress-*.html` 手动双击均可玩。失败项回 Task 11 精调对应 prompt。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: fixtures 回归脚本（CLI 汇总 + 报告落盘）"
```

---

### Task 13: README 与策展 Demo（D2）

**Files:**
- Create: `README.md`
- Modify: `.gitignore`（保持，不改）

**Interfaces:**
- Consumes: 已完成的全部功能 + D2 录制的 1-2 个代表性 `games/*.html`。

- [ ] **Step 1: 写 README**

```markdown
# 涂鸦游戏机 Doodle Arcade

> 把一张真人手绘涂鸦，变成一个能玩的 HTML5 游戏。
> 由豆包 Seed-2.1-pro-0915（API：doubao-seed-evolving）驱动 —— 它看图、它设计、它写码、它跑不通还会自己修。

## 它是怎么工作的

```
涂鸦照片 ──► ① 看图（VLM）：识别角色/配色/画风，决定游戏类型
        ──► ② 设计：出游戏设计稿（标题/机制/难度/彩蛋）
        ──► ③ 写码：生成单文件 HTML5 Canvas 游戏，涂鸦原样作主角
        ──► ④ 自检：沙箱试跑，报错自动回喂修复（≤2 轮）
        ──► ⑤ 多轮修改："跳得再高一点" → v2/v3…
```

## 快速开始

```bash
npm install
cp .env.example .env   # 填入火山方舟 ARK_API_KEY
export ARK_API_KEY=... # Windows Git Bash
npm start              # http://localhost:3000
```

- 回归测试（可选）：把涂鸦照片放进 `fixtures/` 后 `npm run regress`
- 图像输入连通性验证：`npm run verify:ark`

## 目录

`server.js` 无状态 Express 代理（5 个生成端点）· `public/` 前端（上传/时间线/理解面板/沙箱）· `prompts/` 5 个 prompt 模板 · `games/` 生成物存档 · `docs/` 设计文档与 prompt 调参日志

## 说明

- 仅用于豆包 Seed 创作征集演示；游戏由模型逐次生成，效果随涂鸦而变。
- 生成物为零依赖单 HTML，双击即玩，也可在手机浏览器运行。
```

- [ ] **Step 2: 策展 Demo 入库**

```bash
git add -f games/regress-stickman.html games/regress-winged.html   # 选 1-2 个代表作用 -f 强制加入
git add README.md
git commit -m "docs: README 与策展 Demo 游戏入库"
```

---

### Task 14: 豆包工作简单 Case（加分项，手工任务）（D2 晚）

**Files:**
- Create: `docs/doubao-work-case.md`（截图与操作记录，文章素材）

**Interfaces:** 无代码。产出 = 文章可用的截图 2-3 张。

- [ ] **Step 1: 在豆包工作中用同款模型完成相关小任务**

打开豆包工作（桌面端），上传同一张主打涂鸦，依次让它：
1. 写一份 200 字的《游戏设计说明书》（对应我们流水线的 design 步）；
2. 生成一张游戏宣传海报图或角色小传卡片。
每步截图（含模型名/界面）。

- [ ] **Step 2: 记录进 `docs/doubao-work-case.md`**

时间、操作、模型回复摘要、截图文件名；一句话结论（同一模型在通用办公场景的表现对照）。
（可选进阶：若豆包工作支持自定义 Skills，尝试把步骤 1 固化为技能包并记录；不开放则跳过，不影响主线。）

- [ ] **Step 3: Commit**

```bash
git add docs/doubao-work-case.md docs/screenshots/ 2>/dev/null || git add docs/doubao-work-case.md
git commit -m "docs: 豆包工作简单 Case 记录（加分项素材）"
```

---

## 收尾核对（对应 spec 成功标准）

- [ ] `node --test test/` 全绿；`npm start` 一条命令可跑
- [ ] 3 张 fixtures 回归 ok，至少 1 次真实自检修复被记录（时间线/截图）
- [ ] 手机浏览器实测：生成物触屏可玩（touchstart 跳跃/拍翅生效）
- [ ] README 完整、无极限词/导流词（对外文案自查）
- [ ] 文章素材清单齐备：涂鸦原图、理解面板截图、自检修复时间线截图、多轮修改对比、豆包工作 Case 截图、成品录屏 GIF
- [ ] 有余力：部署（Vercel：`api/*` 套 serverless 函数 + 静态托管 public/，`.env` 配 `ARK_API_KEY`）+ GitHub 仓库公开

## 后续阶段（不在本计划内）

- **D3 文章**：用 `/khazix-writer` 写公众号博文，标题《把我妹画的涂鸦丢给豆包Seed-2.1-pro，火柴人当场学会二段跳》，署名 Xxtaoaooo，文末挂 CSDN 主页；正文首段补 Seed-2.1-pro-0915 口径；按 spec 第 10 节结构成文并做禁忌词自查。
