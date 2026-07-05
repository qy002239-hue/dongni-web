import { ROUTES } from './routes';
import type { AuthSession } from '../types/chat';

const localTestSessionKey = 'dongni_local_test_session';
export const localE2EToken = 'local-e2e-token';

export function isLocalHost(): boolean {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

export function isLocalE2E(): boolean {
  if (!isLocalHost()) return false;
  return new URLSearchParams(window.location.search).get('e2e') === '1';
}

export function withE2E(path: string): string {
  return isLocalE2E() ? `${path}${path.includes('?') ? '&' : '?'}e2e=1` : path;
}

export function createLocalTestSession(): AuthSession {
  return {
    user: {
      id: 'local-test-user',
      email: 'test@dongni.local',
      user_metadata: {
        name: '測試使用者',
        full_name: '測試使用者'
      }
    },
    accessToken: localE2EToken
  };
}

export function readLocalTestSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(localTestSessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.user?.id || !parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalTestSession(session: AuthSession): void {
  sessionStorage.setItem(localTestSessionKey, JSON.stringify(session));
}

export function clearLocalTestSession(): void {
  sessionStorage.removeItem(localTestSessionKey);
}

export function isAuthCallbackPath(pathname: string): boolean {
  return pathname === ROUTES.authCallback;
}
