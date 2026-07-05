import { loadLocalEnv } from './load-env.mjs';

await loadLocalEnv();

await import('../src/server/index.mjs');