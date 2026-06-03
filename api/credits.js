import { getAuthenticatedUser, getSupabaseAdmin } from './_supabase.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const user = await getAuthenticatedUser(req, supabase);
    const { data, error } = await supabase.rpc('ensure_dongni_user', {
      p_user_id: user.id,
      p_email: user.email || null
    });

    if (error) throw error;

    const status = data?.[0] || {};

    return res.status(200).json({
      credits: status.credits ?? 0,
      trialStartedAt: status.trial_started_at || null,
      trialEndsAt: status.trial_ends_at || null,
      trialActive: Boolean(status.trial_active)
    });
  } catch (error) {
    console.error('credits error:', error);
    return res.status(error.message?.includes('登入') ? 401 : 500).json({ error: error.message || '無法取得剩餘次數' });
  }
}
