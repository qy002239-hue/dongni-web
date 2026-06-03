import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('尚未設定 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function getAuthenticatedUser(req, supabase = getSupabaseAdmin()) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    throw new Error('請先登入');
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    throw new Error('登入狀態已失效，請重新登入');
  }

  return data.user;
}
