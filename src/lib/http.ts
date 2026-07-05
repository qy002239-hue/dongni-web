export function resolveApiUrl(path: string): string {
  const configuredBase = String(import.meta.env.VITE_CHAT_API_BASE_URL || '').trim();
  if (configuredBase) {
    return `${configuredBase.replace(/\/$/, '')}${path}`;
  }

  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return `http://127.0.0.1:3001${path}`;
  }

  return path;
}

export async function requestText(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(resolveApiUrl(path), init);
  if (!response.ok) {
    let message = 'API error';
    try {
      const data = await response.json() as { error?: string };
      message = data.error || message;
    } catch {
      message = 'API error';
    }
    throw new Error(message);
  }

  return response;
}
