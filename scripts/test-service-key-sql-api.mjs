import { readFile } from 'node:fs/promises';

const content = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const rawLine of content.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;
  if (line.startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx < 0) continue;
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  env[key] = value;
}

const base = env.SUPABASE_URL;
let key = env.SUPABASE_SECRET_KEY;
if (!key) {
  key = env.SUPABASE_SERVICE_ROLE_KEY;
}

if (!base || !key) {
  console.log('Missing SUPABASE_URL or service role key.');
  process.exit(1);
}

const response = await fetch(`${base}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`
  },
  body: JSON.stringify({ sql: 'select 1 as ok' })
});

const body = await response.text();
console.log('status:', response.status);
console.log('body:', body.slice(0, 280));
