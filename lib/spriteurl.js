// lib/spriteurl.js —— 精灵占位符契约的共享替换助手
export const SPRITE_PLACEHOLDER = '__DOODLE_SPRITE__';
export const DATA_URL_RE = /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{100,}/g;

export function substituteSprite(html, dataUrl) {
  return html.replaceAll(SPRITE_PLACEHOLDER, dataUrl);
}

export function extractSpriteUrl(html) {
  const m = html.match(DATA_URL_RE);
  return m ? m[0] : null;
}
