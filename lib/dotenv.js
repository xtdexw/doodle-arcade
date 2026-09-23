// lib/dotenv.js —— 无依赖 .env 加载（KEY=VALUE，忽略注释/空行，不覆盖已有环境变量）
import fs from 'node:fs';

export function loadDotEnv(file = '.env') {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.trim().startsWith('#')) continue;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch { /* .env 不存在则跳过 */ }
}
