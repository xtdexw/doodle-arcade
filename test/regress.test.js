// test/regress.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { listFixtureFiles } from '../scripts/regress.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('列出目录下的图片 fixture，缺失目录返回空数组', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-'));
  assert.deepEqual(listFixtureFiles(tmp), []);
  fs.writeFileSync(path.join(tmp, 'stickman.png'), 'x');
  fs.writeFileSync(path.join(tmp, 'notes.txt'), 'x');
  const files = listFixtureFiles(tmp);
  assert.equal(files.length, 1);
  assert.ok(files[0].endsWith('stickman.png'));
});
