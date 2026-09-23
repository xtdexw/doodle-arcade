// scripts/verify-ark-stream.js —— 真机验证：方舟流式调用（SSE 增量累积）
// 用一个稍长的问题确认 stream:true 链路可用，并展示增量块的到达节奏。
import { createArk } from '../lib/ark.js';

const ark = createArk({ maxRetries: 1 });
const t0 = Date.now();
const stamps = [];
try {
  const out = await ark.chat([{ role: 'user', content: '用三句话介绍你自己' }], {
    onChunk: () => stamps.push(Date.now()),
  });
  const elapsed = Date.now() - t0;
  console.log(`[verify:ark-stream] SSE 块数: ${stamps.length}`);
  console.log(`[verify:ark-stream] 总字符数: ${out.length}`);
  console.log(`[verify:ark-stream] 耗时: ${elapsed}ms`);
  if (stamps.length >= 2) {
    console.log(`[verify:ark-stream] 首块延迟: ${stamps[0] - t0}ms，平均块间隔: ${Math.round((stamps[stamps.length - 1] - stamps[0]) / (stamps.length - 1))}ms`);
  }
  console.log(`[verify:ark-stream] 组装结果: ${out}`);
  process.exit(0);
} catch (e) {
  console.error('[verify:ark-stream] 失败:', e.message);
  process.exit(1);
}
