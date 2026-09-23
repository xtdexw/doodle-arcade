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
