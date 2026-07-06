import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';
import { jsonError, methodNotAllowed } from './_http.js';

export const config = { runtime: 'nodejs' };

function resolveAllowedOrigin(req) {
  const requestOrigin = String(req.headers.origin || '').trim();
  const configured = [process.env.PUBLIC_SITE_URL, process.env.APP_URL]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (!requestOrigin) return configured[0] || '';
  if (!configured.length) return requestOrigin;
  return configured.includes(requestOrigin) ? requestOrigin : configured[0];
}

function applyCorsHeaders(req, res) {
  const origin = resolveAllowedOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function createSessionPayload() {
  return {
    active: true,
    canChat: true,
    id: `session-${Date.now()}`,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    credits: null,
    trialDaysRemaining: null,
    subscription: null
  };
}

export default async function handler(req, res) {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return methodNotAllowed(res, 'GET, POST');
  }

  try {
    const supabase = getSupabaseAdmin();
    await getAuthenticatedUser(req, supabase);
    return res.status(200).json(createSessionPayload());
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : '登入狀態已失效，請重新登入。';
    return jsonError(res, 401, message);
  }
}
