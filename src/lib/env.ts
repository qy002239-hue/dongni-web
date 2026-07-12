type RequiredClientEnv = {
  label: string;
  key: string;
};

const REQUIRED_CLIENT_ENV: RequiredClientEnv[] = [
  { label: 'Supabase URL', key: 'VITE_SUPABASE_URL' },
  { label: 'Supabase Publishable Key', key: 'VITE_SUPABASE_PUBLISHABLE_KEY' }
];

function hasValue(key: string): boolean {
  return String(import.meta.env[key] || '').trim().length > 0;
}

export function getSupportContactEmail(): string {
  const configuredEmail = String(import.meta.env.VITE_SUPPORT_EMAIL || '').trim();
  return configuredEmail || 'support@your-domain.com';
}

export function validateClientEnv() {
  const missing = REQUIRED_CLIENT_ENV.filter((item) => !hasValue(item.key));

  if (!missing.length) {
    return {
      ok: true,
      missing,
      message: ''
    };
  }

  const details = missing
    .map((item) => `${item.label} (${item.key})`)
    .join(', ');

  return {
    ok: false,
    missing,
    message: `Login is temporarily unavailable due to missing environment variables: ${details}`
  };
}
