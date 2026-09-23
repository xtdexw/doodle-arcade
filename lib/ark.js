// lib/ark.js
const DEFAULT_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

export class ArkFatalError extends Error {}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 读取 SSE 响应体：累积 choices[0].delta.content；[DONE] 结束。
// 忽略 reasoning_content（思考型模型增量）与空 choices 保活块。
async function readSse(res, onChunk) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  // 处理一行：返回 true 表示收到 [DONE]
  const handleLine = (line) => {
    if (!line.startsWith('data: ')) return false;
    const payload = line.slice(6);
    if (payload === '[DONE]') return true;
    const chunk = JSON.parse(payload);
    // 流中途的 error 块（如 RequestBurstTooFast 429）→ 抛错走既有重试路径
    if (chunk.error) throw new Error(String(chunk.error.code || chunk.error.message || 'in-stream error'));
    const { choices } = chunk;
    const delta = choices && choices[0] && choices[0].delta;
    if (delta && typeof delta.content === 'string' && delta.content) {
      text += delta.content;
      if (onChunk) onChunk(delta.content);
    }
    return false;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (handleLine(line)) {
        await reader.cancel().catch(() => {}); // 收到 [DONE]，主动释放连接
        return text;
      }
    }
  }
  return text;
}

export function createArk({
  apiKey = process.env.ARK_API_KEY,
  model = process.env.ARK_MODEL || 'doubao-seed-evolving',
  baseUrl = process.env.ARK_BASE_URL || DEFAULT_BASE,
  fetchImpl = fetch,
  maxRetries = 2,
  timeoutMs = Number(process.env.ARK_TIMEOUT_MS) || 420000,
  sleep = defaultSleep,
} = {}) {
  async function chat(messages, { temperature = 0.7, maxTokens, maxCompletionTokens, thinking, onChunk } = {}) {
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
          // stream:true 保持链路上持续有字节流动，避免长生成被中间层掐断空闲连接
          body: JSON.stringify({
            model, messages, temperature, stream: true,
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
            ...(maxCompletionTokens ? { max_completion_tokens: maxCompletionTokens } : {}),
            ...(thinking ? { thinking: { type: thinking } } : {}),
          }),
        });
        if (res.status === 429 || res.status >= 500) throw new Error(`ark retryable http ${res.status}`);
        if (!res.ok) throw new ArkFatalError(`ark http ${res.status}: ${await res.text()}`);
        return await readSse(res, onChunk);
      } catch (e) {
        if (e instanceof ArkFatalError) throw e;
        lastErr = e; // 网络/超时/流中断/429/5xx → 退避后重试
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
