import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptFilePath = path.resolve(__dirname, '../prompts/prompts.json');

let cache = {
  mtimeMs: 0,
  prompts: []
};

function isDevMode() {
  return process.env.NODE_ENV !== 'production';
}

function compareVersion(a = '0', b = '0') {
  const aParts = String(a).split('.').map((part) => Number(part) || 0);
  const bParts = String(b).split('.').map((part) => Number(part) || 0);
  const length = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < length; index += 1) {
    const left = aParts[index] || 0;
    const right = bParts[index] || 0;
    if (left > right) return -1;
    if (left < right) return 1;
  }

  return 0;
}

function sanitizePrompt(input) {
  if (!input || typeof input !== 'object') return null;

  const prompt = {
    id: String(input.id || '').trim(),
    type: String(input.type || '').trim(),
    name: String(input.name || '').trim(),
    version: String(input.version || '0.0.0').trim(),
    content: String(input.content || '').trim(),
    enabled: Boolean(input.enabled)
  };

  if (!prompt.id || !prompt.type || !prompt.name || !prompt.content) return null;
  return prompt;
}

async function loadPromptsFromFile() {
  const fileStat = await stat(promptFilePath);
  const shouldReload = isDevMode() || cache.prompts.length === 0 || fileStat.mtimeMs > cache.mtimeMs;

  if (!shouldReload) {
    return cache.prompts;
  }

  const raw = await readFile(promptFilePath, 'utf8');
  const parsed = JSON.parse(raw);
  const prompts = (Array.isArray(parsed) ? parsed : [])
    .map(sanitizePrompt)
    .filter(Boolean);

  cache = {
    mtimeMs: fileStat.mtimeMs,
    prompts
  };

  return prompts;
}

export async function listPrompts() {
  const prompts = await loadPromptsFromFile();
  return [...prompts].sort((a, b) => compareVersion(a.version, b.version));
}

export async function getPromptById(promptId) {
  const prompts = await loadPromptsFromFile();
  return prompts.find((prompt) => prompt.id === promptId) || null;
}

export async function getPromptByType(type, options = {}) {
  const prompts = await loadPromptsFromFile();
  const preferredId = String(options.preferredId || '').trim();

  if (preferredId) {
    const byId = prompts.find((prompt) => prompt.id === preferredId && prompt.type === type && prompt.enabled);
    if (byId) return byId;
  }

  const candidates = prompts
    .filter((prompt) => prompt.type === type && prompt.enabled)
    .sort((a, b) => compareVersion(a.version, b.version));

  return candidates[0] || null;
}

export async function getPromptContentByType(type, options = {}) {
  const prompt = await getPromptByType(type, options);
  return {
    prompt,
    content: prompt?.content || ''
  };
}
