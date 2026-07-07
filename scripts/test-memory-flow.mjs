import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { getUserMemoryContext, updateUserMemoryFromConversation } from '../api/_memory.js';
import { loadLocalEnv } from './load-env.mjs';

await loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
  throw new Error('Missing SUPABASE_URL / service role key / VITE_SUPABASE_PUBLISHABLE_KEY');
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const authClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const email = `memory-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@dongni.local`;
const password = `${randomUUID()}Aa1!`;

console.log('Step 1: Create test account');
const createResult = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { provider: 'google-simulated' }
});
if (createResult.error || !createResult.data?.user) {
  throw new Error(`createUser failed: ${createResult.error?.message || 'unknown'}`);
}
const userId = createResult.data.user.id;
console.log('  user_id:', userId);

console.log('Step 2: Sign in as test account (simulated Google-bound account)');
const signInResult = await authClient.auth.signInWithPassword({ email, password });
if (signInResult.error || !signInResult.data?.session) {
  throw new Error(`signIn failed: ${signInResult.error?.message || 'unknown'}`);
}
console.log('  access token acquired:', Boolean(signInResult.data.session.access_token));

console.log('Step 3: Read memory before message');
const beforeContext = await getUserMemoryContext(admin, userId);
console.log('  memory context length before:', beforeContext.length);

console.log('Step 4: Simulate one conversation turn and write memory');
const sampleMessages = [
  { role: 'user', content: '我最近睡不好，工作壓力很大，也很怕自己撐不住。' },
  { role: 'assistant', content: '我聽見妳很累，也很擔心。' }
];
await updateUserMemoryFromConversation(
  admin,
  userId,
  sampleMessages,
  '謝謝妳告訴我這些，我們可以先從今晚最小的一件事開始。'
);

console.log('Step 5: Start a new chat and load memory again');
const afterContext = await getUserMemoryContext(admin, userId);
console.log('  memory context length after:', afterContext.length);

console.log('Step 6: Direct table checks');
const memoryRow = await admin
  .from('dongni_user_memory')
  .select('user_id, summary, important_facts, updated_at')
  .eq('user_id', userId)
  .maybeSingle();

const eventRow = await admin
  .from('dongni_memory_events')
  .select('id, user_id, created_at')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(1);

console.log('  memory row error:', memoryRow.error?.message || 'none');
console.log('  memory row exists:', Boolean(memoryRow.data));
console.log('  memory event error:', eventRow.error?.message || 'none');
console.log('  memory event exists:', Boolean(eventRow.data?.length));

console.log('Done');
