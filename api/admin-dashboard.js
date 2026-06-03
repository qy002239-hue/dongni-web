import { getSupabaseAdmin } from './_supabase.js';

export const config = { runtime: 'nodejs' };

function verifyAdmin(req) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const providedPassword = req.headers['x-admin-password'];

  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD is not configured.');
  }

  if (!providedPassword || providedPassword !== adminPassword) {
    const error = new Error('Invalid admin password.');
    error.status = 401;
    throw error;
  }
}

function sumAmount(payments) {
  return payments.reduce((total, payment) => total + (payment.amount_total || 0), 0);
}

function isToday(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    verifyAdmin(req);

    const supabase = getSupabaseAdmin();

    const [
      usersResult,
      paymentsResult,
      eventsResult,
      sessionsResult
    ] = await Promise.all([
      supabase
        .from('dongni_user_credits')
        .select('user_id,email,credits,trial_started_at,trial_ends_at,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('dongni_payments')
        .select('user_id,stripe_session_id,plan,credits,amount_total,currency,customer_email,status,created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('dongni_credit_events')
        .select('user_id,delta,reason,stripe_session_id,created_at')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('dongni_conversation_sessions')
        .select('user_id,started_at,last_message_at,expires_at,created_at')
        .order('created_at', { ascending: false })
        .limit(200)
    ]);

    for (const result of [usersResult, paymentsResult, eventsResult, sessionsResult]) {
      if (result.error) throw result.error;
    }

    const users = usersResult.data || [];
    const payments = paymentsResult.data || [];
    const events = eventsResult.data || [];
    const sessions = sessionsResult.data || [];
    const now = Date.now();

    const todayPayments = payments.filter((payment) => isToday(payment.created_at));
    const todaySessions = sessions.filter((session) => isToday(session.created_at));
    const activeTrials = users.filter((user) => user.trial_ends_at && new Date(user.trial_ends_at).getTime() > now);
    const activeSessions = sessions.filter((session) => session.expires_at && new Date(session.expires_at).getTime() > now);

    return res.status(200).json({
      metrics: {
        users: users.length,
        activeTrials: activeTrials.length,
        activeSessions: activeSessions.length,
        unusedCredits: users.reduce((total, user) => total + (user.credits || 0), 0),
        paymentsToday: todayPayments.length,
        revenueToday: sumAmount(todayPayments),
        paymentsTotal: payments.length,
        revenueTotal: sumAmount(payments),
        sessionsToday: todaySessions.length
      },
      users,
      payments,
      events,
      sessions
    });
  } catch (error) {
    console.error('admin-dashboard error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Dashboard data failed to load.' });
  }
}
