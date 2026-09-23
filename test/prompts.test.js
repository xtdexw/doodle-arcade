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
