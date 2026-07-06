import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPromptByType } from './_prompt-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptFilePath = path.resolve(__dirname, '../prompts/prompts.json');

export const PLAYGROUND_PROMPT_TYPES = ['chat', 'conversation-title', 'future-summary', 'system'];

function normalizeType(type = '') {
  return String(type || '').trim();
}

function isAllowedType(type) {
  return PLAYGROUND_PROMPT_TYPES.includes(normalizeType(type));
}

async function readPromptFile() {
  const raw = await readFile(promptFilePath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writePromptFile(prompts) {
  await writeFile(promptFilePath, `${JSON.stringify(prompts, null, 2)}\n`, 'utf8');
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

function pickEditablePrompt(prompts, type) {
  const candidates = prompts
    .filter((prompt) => prompt?.type === type && Boolean(prompt?.enabled))
    .sort((a, b) => compareVersion(a.version, b.version));

  return candidates[0] || null;
}

export async function listPlaygroundPrompts() {
  const prompts = await readPromptFile();
  const rows = [];

  for (const type of PLAYGROUND_PROMPT_TYPES) {
    const prompt = pickEditablePrompt(prompts, type);
    rows.push({
      type,
      id: prompt?.id || '',
      name: prompt?.name || type,
      version: prompt?.version || '',
      enabled: Boolean(prompt?.enabled),
      content: String(prompt?.content || '')
    });
  }

  return rows;
}

export async function savePlaygroundPrompt(type, nextContent) {
  const safeType = normalizeType(type);
  if (!isAllowedType(safeType)) {
    throw new Error('Unsupported prompt type.');
  }

  const trimmedContent = String(nextContent || '').trim();
  if (!trimmedContent) {
    throw new Error('Prompt content cannot be empty.');
  }

  const prompts = await readPromptFile();
  const editable = pickEditablePrompt(prompts, safeType);

  if (!editable?.id) {
    throw new Error('No enabled prompt found for this type.');
  }

  const index = prompts.findIndex((item) => item?.id === editable.id);
  if (index === -1) {
    throw new Error('Prompt not found.');
  }

  prompts[index] = {
    ...prompts[index],
    content: trimmedContent
  };

  await writePromptFile(prompts);
  return prompts[index];
}

async function buildMessages(type, promptContent, input) {
  const cleanInput = String(input || '').trim();
  const safeInput = cleanInput || '請用繁體中文回覆，這是一段測試輸入。';

  if (type === 'chat') {
    const systemPrompt = await getPromptByType('system');
    const mergedSystem = [String(systemPrompt?.content || '').trim(), String(promptContent || '').trim()]
      .filter(Boolean)
      .join('\n\n');

    return [
      { role: 'system', content: mergedSystem },
      { role: 'user', content: safeInput }
    ];
  }

  return [
    { role: 'system', content: String(promptContent || '') },
    { role: 'user', content: safeInput }
  ];
}

export async function runPlaygroundPromptTest({ type, prompt, input, model }) {
  const safeType = normalizeType(type);
  if (!isAllowedType(safeType)) {
    throw new Error('Unsupported prompt type.');
  }

  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const promptContent = String(prompt || '').trim();
  if (!promptContent) {
    throw new Error('Prompt content cannot be empty.');
  }

  const requestBody = {
    model: String(model || process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5'),
    messages: await buildMessages(safeType, promptContent, input),
    max_tokens: safeType === 'conversation-title' ? 80 : 400,
    stream: false,
    temperature: safeType === 'conversation-title' ? 0.4 : 0.7
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.APP_URL || process.env.PUBLIC_SITE_URL || 'http://localhost:5173',
      'X-Title': 'Dongni Prompt Playground'
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.error || `OpenRouter request failed (${response.status}).`;
    throw new Error(String(detail));
  }

  const content = String(payload?.choices?.[0]?.message?.content || '');

  return {
    prompt: promptContent,
    request: requestBody,
    response: content,
    usage: payload?.usage || null,
    raw: payload
  };
}
