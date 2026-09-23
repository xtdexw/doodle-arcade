// lib/ark.js
const DEFAULT_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

export class ArkFatalError extends Error {}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createArk({
  apiKey = process.env.ARK_API_KEY,
  model = process.env.ARK_MODEL || 'doubao-seed-evolving',
  baseUrl = process.env.ARK_BASE_URL || DEFAULT_BASE,
  fetchImpl = fetch,
  maxRetries = 2,
  timeoutMs = Number(process.env.ARK_TIMEOUT_MS) || 420000,
  sleep = defaultSleep,
} = {}) {
  async function chat(messages, { temperature = 0.7, maxTokens } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await sleep(Math.min(1000 * 2 ** (attempt - 1), 4000));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature, ...(maxTokens ? { max_tokens: maxTokens } : {}) }),
        });
        if (res.status === 429 || res.status >= 500) throw new Error(`ark retryable http ${res.status}`);
        if (!res.ok) throw new ArkFatalError(`ark http ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return data.choices[0].message.content;
      } catch (e) {
        if (e instanceof ArkFatalError) throw e;
        lastErr = e; // 网络/超时/429/5xx → 退避后重试
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }
  return { chat };
}

export function imageMessage(text, base64, mime = 'image/png') {
  return {
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
      { type: 'text', text },
    ],
  };
}
