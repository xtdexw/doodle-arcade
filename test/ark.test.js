// test/ark.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { createArk, imageMessage, ArkFatalError } from '../lib/ark.js';

const enc = new TextEncoder();
// 把若干 SSE 事件（已序列化的 data 负载）编码成 ReadableStream
const sseEvents = (events) => new ReadableStream({
  start(c) {
    for (const ev of events) c.enqueue(enc.encode(`data: ${ev}\n\n`));
    c.close();
  },
});
const sse = (deltas) =>
  sseEvents([...deltas.map((d) => JSON.stringify({ choices: [{ delta: { content: d } }] })), '[DONE]']);
const streamOk = (deltas) => ({ status: 200, ok: true, body: sse(deltas) });
const streamOkEvents = (events) => ({ status: 200, ok: true, body: sseEvents(events) });
// 先吐一块增量再断流的坏流
const sseThenDie = (d) => new ReadableStream({
  start(c) {
    c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`));
    c.error(new Error('net'));
  },
});

test('chat 返回 content', async () => {
  const ark = createArk({ fetchImpl: async () => streamOk(['你好']) });
  assert.equal(await ark.chat([{ role: 'user', content: 'hi' }]), '你好');
});

test('429/5xx/网络错误 按指数退避重试后成功', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls < 3) { const e = new Error('net'); throw e; }
    return streamOk(['第三次成功']);
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

test('多块 SSE 增量按顺序拼接为完整字符串', async () => {
  const ark = createArk({ fetchImpl: async () => streamOk(['你好', '，', '世', '界！']) });
  assert.equal(await ark.chat([{ role: 'user', content: 'hi' }]), '你好，世界！');
});

test('忽略 reasoning_content 增量与空 choices 保活块', async () => {
  const fetchImpl = async () =>
    streamOkEvents([
      JSON.stringify({ choices: [{ delta: { reasoning_content: '让我想想……' } }] }),
      JSON.stringify({ choices: [] }),
      JSON.stringify({ choices: [{ delta: { content: '答案是' } }] }),
      JSON.stringify({ choices: [{ delta: { reasoning_content: '复核中' }, content: '' }] }),
      JSON.stringify({ choices: [{ delta: { content: '42' } }] }),
      '[DONE]',
    ]);
  const ark = createArk({ fetchImpl });
  assert.equal(await ark.chat([{ role: 'user', content: 'hi' }]), '答案是42');
});

test('流中途断开 触发重试并成功', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return { status: 200, ok: true, body: sseThenDie('半截') };
    return streamOk(['完整', '回复']);
  };
  const ark = createArk({ fetchImpl, sleep: () => Promise.resolve() });
  assert.equal(await ark.chat([{ role: 'user', content: 'hi' }]), '完整回复');
  assert.equal(calls, 2);
});

test('onChunk 对每个内容增量回调一次', async () => {
  const seen = [];
  const ark = createArk({ fetchImpl: async () => streamOk(['a', 'bc', 'd']) });
  const out = await ark.chat([{ role: 'user', content: 'hi' }], { onChunk: (d) => seen.push(d) });
  assert.deepEqual(seen, ['a', 'bc', 'd']);
  assert.equal(out, 'abcd');
});
