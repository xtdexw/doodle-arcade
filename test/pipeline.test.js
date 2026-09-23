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
