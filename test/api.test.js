// test/api.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { createApiRouter } from '../routes/api.js';

const fakeArk = (fn) => ({ chat: fn });
// ark.chat 的契约是返回模型 content 字符串（见 lib/ark.js），stub 直接给字符串
const jsonOk = (obj) => '```json\n' + JSON.stringify(obj) + '\n```';
const htmlOk = (html) => '```html\n' + html + '\n```';

async function post(router, path, body) {
  let status, payload, settle;
  const settled = new Promise((r) => { settle = r; });
  const res = {
    status: (s) => { status = s; return res; },
    json: (d) => { payload = d; if (status === undefined) status = 200; settle(); }, // express 默认 200
  };
  // Express 4 不会 await 异步 handler：等 res.json 写回或路由栈走完再返回
  router.handle({ method: 'POST', url: path, body: body ?? {} }, res, () => settle());
  await settled;
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
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true })); // 不留垃圾目录
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
