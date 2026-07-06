const REQUIRED_SERVER_ENV_GROUPS = [
  {
    label: 'OpenRouter API Key',
    keys: ['OPENROUTER_API_KEY']
  },
  {
    label: 'Google OAuth Client ID',
    keys: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_CLIENT_ID']
  },
  {
    label: 'Google OAuth Client Secret',
    keys: ['GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET']
  },
  {
    label: 'Redirect URL',
    keys: ['GOOGLE_OAUTH_REDIRECT_URL', 'GOOGLE_REDIRECT_URL']
  },
  {
    label: 'App URL',
    keys: ['APP_URL', 'PUBLIC_SITE_URL']
  }
];

const REQUIRED_CHAT_ENV_GROUPS = [
  {
    label: 'OpenRouter API Key',
    keys: ['OPENROUTER_API_KEY']
  },
  {
    label: 'Supabase URL',
    keys: ['SUPABASE_URL']
  },
  {
    label: 'Supabase Admin Key',
    keys: ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
  }
];

function hasValue(key) {
  return String(process.env[key] || '').trim().length > 0;
}

export function validateServerEnv() {
  const missing = [];

  for (const group of REQUIRED_SERVER_ENV_GROUPS) {
    const matched = group.keys.some(hasValue);
    if (!matched) {
      missing.push(group);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    isProduction: process.env.NODE_ENV === 'production'
  };
}

export function validateChatEnv() {
  const missing = [];

  for (const group of REQUIRED_CHAT_ENV_GROUPS) {
    const matched = group.keys.some(hasValue);
    if (!matched) {
      missing.push(group);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    isProduction: process.env.NODE_ENV === 'production'
  };
}

export function getPublicEnvError(validation = validateServerEnv()) {
  if (validation.ok) {
    return { status: 200, message: '' };
  }

  if (validation.isProduction) {
    return {
      status: 503,
      message: 'Service configuration error. Please contact support.'
    };
  }

  const detail = validation.missing
    .map((group) => `${group.label} (${group.keys.join(' | ')})`)
    .join(', ');

  return {
    status: 503,
    message: `Missing required environment variables: ${detail}`
  };
}

export function logEnvValidation(validation = validateServerEnv(), prefix = '[env]') {
  if (validation.ok) return;

  if (validation.isProduction) {
    console.error(`${prefix} Required environment variables are missing.`);
    return;
  }

  const detail = validation.missing
    .map((group) => `${group.label} (${group.keys.join(' | ')})`)
    .join(', ');

  console.error(`${prefix} Missing required environment variables: ${detail}`);
}
