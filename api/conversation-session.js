import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';

export const config = { runtime: 'nodejs' };

async function getActiveSession(supabase, userId) {
  const { data, error } = await supabase
    .from('dongni_conversation_sessions')
    .select('expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getCredits(supabase, userId) {
  const { data, error } = await supabase
    .from('dongni_user_credits')
    .select('credits')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.credits ?? 0;
}

async function ensureUser(supabase, user) {
  const { data, error } = await supabase.rpc('ensure_dongni_user', {
    p_user_id: user.id,
    p_email: user.email || null
  });

  if (error) throw error;
  return data?.[0] || {};
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const user = await getAuthenticatedUser(req, supabase);

    if (req.method === 'GET') {
      const [session, userStatus] = await Promise.all([
        getActiveSession(supabase, user.id),
        ensureUser(supabase, user)
      ]);

      return res.status(200).json({
        active: Boolean(session?.expires_at),
        expiresAt: session?.expires_at || null,
        credits: userStatus.credits ?? 0,
        trialStartedAt: userStatus.trial_started_at || null,
        trialEndsAt: userStatus.trial_ends_at || null,
        trialActive: Boolean(userStatus.trial_active)
      });
    }

    await ensureUser(supabase, user);

    const { data: expiresAt, error } = await supabase.rpc('start_dongni_conversation_session', {
      p_user_id: user.id
    });

    if (error) throw error;

    if (!expiresAt) {
      return res.status(402).json({ error: '妳的 Plus 次數已用完，請先購買次數。' });
    }

    const credits = await getCredits(supabase, user.id);
    const userStatus = await ensureUser(supabase, user);

    return res.status(200).json({
      active: true,
      expiresAt,
      credits,
      trialStartedAt: userStatus.trial_started_at || null,
      trialEndsAt: userStatus.trial_ends_at || null,
      trialActive: Boolean(userStatus.trial_active)
    });
  } catch (error) {
    console.error('conversation-session error:', error);
    const status = error.message?.includes('登入') || error.message?.includes('login') ? 401 : 500;
    return res.status(status).json({ error: error.message || '無法取得對話 session。' });
  }
}
