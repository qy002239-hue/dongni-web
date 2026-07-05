import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { loadLocalEnv } from './load-env.mjs';

await loadLocalEnv();

const serverPort = 3010;
const checks = [];

const requiredEnv = [
  'OPENROUTER_API_KEY',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY'
];

function addCheck(name, pass, reason) {
  checks.push({ name, pass, reason });
}

function missingEnvNames() {
  const missing = requiredEnv.filter((name) => !String(process.env[name] || '').trim());
  const hasSupabaseAdminKey =
    String(process.env.SUPABASE_SECRET_KEY || '').trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!hasSupabaseAdminKey) {
    missing.push('SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)');
  }

  return missing;
}

function formatMissing(missing) {
  return missing.length ? missing.map((name) => `- ${name}`).join('\n') : 'none';
}

async function waitForOutput(child, matcher, timeoutMs = 15000) {
  return await new Promise((resolve, reject) => {
    const start = Date.now();
    let buffer = '';
    let timer = null;

    const onData = (chunk) => {
      buffer += chunk.toString();
      if (matcher(buffer)) {
        cleanup();
        resolve(buffer);
      }
    };

    const onExit = (code) => {
      cleanup();
      reject(new Error(`Process exited before ready (code ${code ?? 'unknown'}).\n${buffer}`));
    };

    const cleanup = () => {
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onData);
      child.off('exit', onExit);
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', onExit);

    timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        cleanup();
        reject(new Error(`Timed out waiting for process output.\n${buffer}`));
      }
    }, 200);
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function runBuild() {
  const build = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { stdio: 'inherit' })
    : spawn('npm', ['run', 'build'], { stdio: 'inherit' });
  const code = await new Promise((resolve) => build.on('close', resolve));
  return code === 0;
}

async function checkRoutes() {
  try {
    const [mainSource, appSource, vercelSource] = await Promise.all([
      readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../vercel.json', import.meta.url), 'utf8')
    ]);

    const routeChecks = [
      { label: 'BrowserRouter', ok: mainSource.includes('BrowserRouter') },
      { label: '/chat route', ok: appSource.includes('ROUTES.chat') && appSource.includes('navigate(withE2E(ROUTES.chat)') },
      { label: '/auth/callback route', ok: appSource.includes('ROUTES.authCallback') && appSource.includes('isAuthCallbackPath') },
      { label: 'login gate exists', ok: appSource.includes("if (!user)") && appSource.includes('使用 Google 登入') },
      { label: 'chat form exists', ok: appSource.includes('dongni-chat-form') && appSource.includes('onKeyDown={onInputKeyDown}') },
      { label: 'Vercel rewrite to index.html', ok: vercelSource.includes('"/(.*)"') && vercelSource.includes('"/index.html"') }
    ];

    const failures = routeChecks.filter((item) => !item.ok).map((item) => item.label);
    if (failures.length) {
      addCheck('Route', false, `Missing route wiring: ${failures.join(', ')}`);
    } else {
      addCheck('Route', true, 'Route wiring is present in the source and Vercel config.');
    }
  } catch (error) {
    addCheck('Route', false, error.message || 'Unable to validate route wiring.');
  }
}

async function checkSupabaseInit() {
  const frontendUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
  const frontendKey = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  const backendUrl = String(process.env.SUPABASE_URL || '').trim();
  const backendKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!frontendUrl || !frontendKey || !backendUrl || !backendKey) {
    addCheck('Supabase', false, `Missing env:\n${formatMissing([
      !frontendUrl ? 'VITE_SUPABASE_URL' : null,
      !frontendKey ? 'VITE_SUPABASE_PUBLISHABLE_KEY' : null,
      !backendUrl ? 'SUPABASE_URL' : null,
      !backendKey ? 'SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)' : null
    ].filter(Boolean))}`);
    return;
  }

  try {
    const frontendClient = createClient(frontendUrl, frontendKey);
    const backendClient = createClient(backendUrl, backendKey);

    await Promise.all([
      frontendClient.auth.getSession(),
      backendClient.auth.getSession()
    ]);

    addCheck('Supabase', true, 'Frontend and admin Supabase clients initialized.');
  } catch (error) {
    addCheck('Supabase', false, error.message || 'Supabase client initialization failed.');
  }
}

async function checkOpenRouterConnectivity() {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    addCheck('OpenRouter', false, 'OPENROUTER_API_KEY is missing.');
    return;
  }

  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5',
        messages: [
          { role: 'system', content: 'Reply with one short word.' },
          { role: 'user', content: 'ping' }
        ],
        max_tokens: 16,
        stream: false
      })
    }, 20000);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter returned ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = await response.json();
    if (!data.choices?.length) {
      throw new Error('OpenRouter returned no choices.');
    }

    addCheck('OpenRouter', true, 'Connected successfully with the configured API key.');
  } catch (error) {
    addCheck('OpenRouter', false, error.message || 'OpenRouter connectivity check failed.');
  }
}

async function checkChatApi() {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    addCheck('Chat API', false, 'Skipped because OPENROUTER_API_KEY is missing.');
    return;
  }

  const frontendPort = 5173;

  const server = spawn('node', ['src/server/index.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(serverPort),
      ALLOWED_ORIGIN: `http://127.0.0.1:${frontendPort},http://localhost:${frontendPort}`
    }
  });

  try {
    await waitForOutput(server, (text) => text.includes('懂妳服務器已啟動'), 20000);

    const response = await fetchWithTimeout(`http://127.0.0.1:${serverPort}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: '請回我一句簡短測試。' }
        ]
      })
    }, 30000);

    const text = await response.text();
    if (!response.ok || !text.trim()) {
      throw new Error(`Chat API returned ${response.status} with empty or invalid output.`);
    }

    addCheck('Chat API', true, 'Local chat endpoint responded with streamed text.');
  } catch (error) {
    addCheck('Chat API', false, error.message || 'Chat API call failed.');
  } finally {
    server.kill('SIGTERM');
  }
}

async function main() {
  const missing = missingEnvNames();
  addCheck('Env', missing.length === 0, missing.length ? `Missing env:\n${formatMissing(missing)}` : 'All required env variables are present.');

  await checkSupabaseInit();
  await checkOpenRouterConnectivity();
  await checkChatApi();

  const buildPassed = await runBuild();
  addCheck('Build', buildPassed, buildPassed ? 'npm run build succeeded.' : 'npm run build failed.');

  await checkRoutes();

  console.log('\nSmoke Test Report');
  let failed = false;
  for (const check of checks) {
    const status = check.pass ? 'PASS' : 'FAIL';
    if (!check.pass) failed = true;
    console.log(`\n[${status}] ${check.name}`);
    console.log(check.reason);
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  console.log('\nFAIL');
  process.exitCode = 1;
});