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
