export function toErrorMessage(error: unknown, fallback = '發生錯誤，請稍後再試。'): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}
