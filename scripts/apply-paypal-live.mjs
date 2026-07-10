import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {
    clientId: '',
    clientSecret: '',
    webhookId: '',
    siteUrl: 'https://dongni-web.vercel.app'
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1] || '';
    if (token === '--client-id') {
      args.clientId = next.trim();
      i += 1;
    } else if (token === '--client-secret') {
      args.clientSecret = next.trim();
      i += 1;
    } else if (token === '--webhook-id') {
      args.webhookId = next.trim();
      i += 1;
    } else if (token === '--site-url') {
      args.siteUrl = next.trim() || args.siteUrl;
      i += 1;
    }
  }

  return args;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false
  });

  const output = [result.stdout || '', result.stderr || ''].join('').trim();
  return {
    ok: result.status === 0,
    status: result.status,
    output
  };
}

function runVercel(cwd, vercelArgs, input = '') {
  return runCommand('npm.cmd', ['exec', '--yes', 'vercel', '--', ...vercelArgs], { cwd, input });
}

function ensureOk(step, result) {
  if (!result.ok) {
    throw new Error(`${step} failed.\n${result.output}`);
  }
}

function removeEnv(cwd, key, envName) {
  const result = runVercel(cwd, ['env', 'rm', key, envName, '--yes']);
  if (!result.ok) {
    const text = result.output.toLowerCase();
    if (text.includes('not found') || text.includes('does not exist')) {
      return;
    }
    throw new Error(`Failed to remove ${key} (${envName}).\n${result.output}`);
  }
}

function addEnv(cwd, key, value, envName) {
  const result = runVercel(cwd, ['env', 'add', key, envName], `${value}\n`);
  ensureOk(`Add env ${key} (${envName})`, result);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.clientId || !args.clientSecret || !args.webhookId) {
    throw new Error('Usage: node scripts/apply-paypal-live.mjs --client-id <id> --client-secret <secret> --webhook-id <id> [--site-url <url>]');
  }

  const cwd = process.cwd();

  // Always enforce live mode and site URL in production.
  const updates = [
    ['PAYPAL_CLIENT_ID', args.clientId],
    ['PAYPAL_CLIENT_SECRET', args.clientSecret],
    ['PAYPAL_WEBHOOK_ID', args.webhookId],
    ['PAYPAL_ENV', 'live'],
    ['PUBLIC_SITE_URL', args.siteUrl]
  ];

  for (const [key, value] of updates) {
    removeEnv(cwd, key, 'production');
    addEnv(cwd, key, value, 'production');
  }

  const deploy = runVercel(cwd, ['deploy', '--prod', '--yes']);
  ensureOk('Production deploy', deploy);

  const base = args.siteUrl.replace(/\/$/, '');
  const checks = [
    `${base}/api/debug/runtime-env`,
    `${base}/api/payment-options`,
    `${base}/api/paypal-live-test?action=config`
  ];

  const report = {};
  for (const url of checks) {
    report[url] = await fetchJson(url);
  }

  console.log(JSON.stringify({
    ok: true,
    updated: updates.map(([key]) => key),
    deployOutput: deploy.output,
    report
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
