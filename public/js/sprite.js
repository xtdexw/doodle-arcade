// public/js/sprite.js
export function removeWhiteBg(data, threshold = 235) {
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i] >= threshold && out[i + 1] >= threshold && out[i + 2] >= threshold) out[i + 3] = 0;
  }
  return out;
}

export function inkBounds(data, width, height) {
  let x1 = width, y1 = height, x2 = -1, y2 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const visible = data[i + 3] > 16 && !(data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235);
      if (visible) {
        if (x < x1) x1 = x; if (x > x2) x2 = x;
        if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
    }
  }
  return x2 < 0 ? null : { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

// —— 浏览器侧（Node 测试不覆盖，靠 Task 12 集成回归） ——
export async function preprocessDoodle(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const W = Math.max(1, Math.round(bitmap.width * scale));
  const H = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, W, H);

  const full = ctx.getImageData(0, 0, W, H);
  const imageBase64 = canvas.toDataURL('image/png').split(',')[1]; // 原图（analyze 用）

  const cleaned = removeWhiteBg(full.data);
  const b = inkBounds(cleaned, W, H) || { x: 0, y: 0, w: W, h: H };
  const pad = Math.round(Math.max(b.w, b.h) * 0.05);
  const bx = Math.max(0, b.x - pad), by = Math.max(0, b.y - pad);
  const bw = Math.min(W - bx, b.w + pad * 2), bh = Math.min(H - by, b.h + pad * 2);
  const sprite = document.createElement('canvas');
  sprite.width = bw; sprite.height = bh;
  const sctx = sprite.getContext('2d');
  // putImageData 不支持偏移裁剪：先用 tmp 画布承载 cleaned，再 drawImage 裁剪出精灵
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(cleaned), W, H), 0, 0);
  sctx.drawImage(tmp, bx, by, bw, bh, 0, 0, bw, bh);
  const spriteBase64 = sprite.toDataURL('image/png').split(',')[1];
  return { imageBase64, spriteBase64, width: W, height: H };
}
