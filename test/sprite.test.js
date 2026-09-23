// test/sprite.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { removeWhiteBg, inkBounds } from '../public/js/sprite.js';

const px = (...rgba) => new Uint8ClampedArray(rgba);

test('近白像素透明，深色保留', () => {
  const out = removeWhiteBg(px(250, 250, 250, 255, 30, 30, 30, 255));
  assert.equal(out[3], 0);
  assert.equal(out[7], 255);
});

test('inkBounds 找到非白不透明像素包围盒', () => {
  // 2x2：仅 (1,1) 是黑
  const data = px(
    255, 255, 255, 255,
    255, 255, 255, 255,
    255, 255, 255, 255,
      0,   0,   0, 255,
  );
  assert.deepEqual(inkBounds(data, 2, 2), { x: 1, y: 1, w: 1, h: 1 });
});

test('全白返回 null', () => {
  assert.equal(inkBounds(px(255, 255, 255, 255), 1, 1), null);
});
