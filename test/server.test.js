// test/server.test.js
import { test } from 'node:test';
import assert from 'node:assert';

test('server 模块可导入并导出 app（不自动监听）', async () => {
  const { createApp } = await import('../server.js');
  const app = createApp();
  assert.ok(app);
});
