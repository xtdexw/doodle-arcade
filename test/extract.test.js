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
