import type { ChatMessage } from '../types/chat';
import { requestText } from '../lib/http';
import { localE2EToken } from '../lib/auth';

function isLocalE2E(accessToken = ''): boolean {
  return (
    accessToken === localE2EToken
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('e2e') === '1'
  );
}

interface SendMessageOptions {
  accessToken?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface GenerateTitleOptions {
  accessToken?: string;
  signal?: AbortSignal;
}

function normalizeTitle(rawTitle: unknown): string {
  const cleaned = String(rawTitle || '')
    .replace(/["'「」『』]/g, '')
    .replace(/[。！？!?]/g, '')
    .replace(/^\d+[).、\s]*/g, '')
    .replace(/聊天|對話/g, '')
    .trim();

  const chars = [...cleaned];
  if (chars.length < 8) return '';
  if (chars.length > 20) return chars.slice(0, 20).join('');
  return cleaned;
}

export async function generateConversationTitle(
  messages: ChatMessage[],
  options: GenerateTitleOptions = {}
): Promise<string> {
  const { accessToken = '', signal } = options;

  if (isLocalE2E(accessToken)) {
    return '心裡疲憊與自我懷疑';
  }

  const response = await requestText('/api/chat-title', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ messages }),
    signal
  });

  try {
    const data = await response.json() as { title?: string };
    return normalizeTitle(data?.title || '');
  } catch {
    return '';
  }
}

export async function sendMessageToServer(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options: SendMessageOptions = {}
): Promise<string> {
  const { accessToken = '', signal, timeoutMs = 30_000 } = options;

  if (isLocalE2E(accessToken)) {
    const reply = '嗯……我有聽見。妳不用急著把它說清楚。';
    for (const chunk of reply.match(/.{1,8}/gu) || []) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
      onChunk(chunk);
    }
    return reply;
  }

  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId = window.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  const clearStreamTimeout = () => {
    window.clearTimeout(timeoutId);
  };

  const refreshStreamTimeout = () => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  };

  const abortByCaller = () => {
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      clearStreamTimeout();
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    signal.addEventListener('abort', abortByCaller, { once: true });
  }

  try {
    const response = await requestText('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ messages }),
      signal: controller.signal
    });

    if (!response.body) {
      throw new Error('No response stream was returned.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const isSse = contentType.includes('text/event-stream');
    let fullReply = '';

    if (!isSse) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullReply += chunk;
        refreshStreamTimeout();
        onChunk(chunk);
      }

      return fullReply;
    }

    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6).trim();
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload) as { text?: string };
          const text = String(parsed?.text || '');
          if (!text) continue;
          fullReply += text;
          refreshStreamTimeout();
          onChunk(text);
        } catch {
          // Ignore malformed SSE chunks.
        }
      }
    }

    return fullReply;
  } catch (error) {
    if (didTimeout) {
      throw new Error('30 秒內沒有收到回覆，請重新送出。', { cause: error });
    }
    throw error;
  } finally {
    clearStreamTimeout();
    if (signal) {
      signal.removeEventListener('abort', abortByCaller);
    }
  }
}
