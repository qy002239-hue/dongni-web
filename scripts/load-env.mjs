import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function parseEnvContent(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    if (!key) continue;

    values[key] = value;
  }

  return values;
}

export async function loadLocalEnv() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(currentDir, '..');
  const envFiles = ['.env', '.env.local'];

  for (const fileName of envFiles) {
    const filePath = path.join(rootDir, fileName);
    try {
      const content = await readFile(filePath, 'utf8');
      const parsed = parseEnvContent(content);

      for (const [key, value] of Object.entries(parsed)) {
        process.env[key] = value;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}