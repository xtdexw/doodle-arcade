// lib/prompts.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export class PromptError extends Error {}
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

export function loadPrompt(name, vars = {}) {
  const tpl = fs.readFileSync(path.join(DIR, `${name}.md`), 'utf8');
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, String(v));
  }
  if (/\{\{[A-Z_]+\}\}/.test(out)) {
    throw new PromptError(`prompt ${name} 存在未替换变量: ${out.match(/\{\{[A-Z_]+\}\}/g)}`);
  }
  return out;
}
