// lib/extract.js
export class ExtractError extends Error {}

function balancedJsonSlice(text) {
  const start = text.indexOf('{');
  if (start === -1) throw new ExtractError('no json object found');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new ExtractError('unbalanced json');
}

export function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = fence ? [fence[1], text] : [text];
  for (const c of candidates) {
    try { return JSON.parse(balancedJsonSlice(c)); } catch { /* 试下一个 */ }
  }
  throw new ExtractError('json parse failed');
}

export function extractHtml(text) {
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  const candidates = fence ? [fence[1], text] : [text];
  for (const c of candidates) {
    const start = c.search(/<!doctype html|<html/i);
    const end = c.toLowerCase().lastIndexOf('</html>');
    if (start !== -1 && end !== -1 && end > start) return c.slice(start, end + 7);
  }
  throw new ExtractError('no html document found');
}
