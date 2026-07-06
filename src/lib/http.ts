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

interface HttpError extends Error {
  status?: number;
  responseBody?: unknown;
  responseError?: string | null;
}

async function parseHttpResponseText(response: Response): Promise<{
  data: { error?: string } | null;
  text: string;
}> {
  const text = await response.text();
  const trimmed = String(text || '').trim();

  if (!trimmed) {
    return { data: null, text: '' };
  }

  try {
    return {
      data: JSON.parse(trimmed) as { error?: string },
      text: trimmed
    };
  } catch {
    return {
      data: null,
      text: trimmed
    };
  }
}

export async function requestText(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(resolveApiUrl(path), init);
  if (!response.ok) {
    const parsed = await parseHttpResponseText(response);
    const responseBody = parsed.data ?? parsed.text;
    const responseError = parsed.data?.error ?? null;

    let message = parsed.data?.error || 'API error';
    if (!parsed.text) {
      message = `${path} returned empty response body (status ${response.status}).`;
    } else if (!parsed.data) {
      message = `${path} returned non-JSON response (status ${response.status}): ${parsed.text.slice(0, 300)}`;
    }

    const error = new Error(message) as HttpError;
    error.status = response.status;
    error.responseBody = responseBody;
    error.responseError = responseError;
    throw error;
  }

  return response;
}
