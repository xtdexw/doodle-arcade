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
