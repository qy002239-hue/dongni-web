import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORE_SYSTEM_PROMPT_FILE_PATH = path.resolve(__dirname, '../prompts/伊格利特_system_prompt_v1.md');

function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export async function buildChatSystemPrompt() {
  const sourcePrompt = await readFile(CORE_SYSTEM_PROMPT_FILE_PATH, 'utf8');
  if (!sourcePrompt) {
    throw new Error('Core system prompt file is empty.');
  }

  const finalSystemPrompt = sourcePrompt;
  const sourcePromptSha256 = sha256(sourcePrompt);
  const finalSystemPromptSha256 = sha256(finalSystemPrompt);
  const exactMatch = sourcePrompt === finalSystemPrompt;

  return {
    promptFilePath: CORE_SYSTEM_PROMPT_FILE_PATH,
    sourcePrompt,
    sourcePromptSha256,
    finalSystemPrompt,
    finalSystemPromptSha256,
    exactMatch,
    finalSystemPromptPreview: finalSystemPrompt.slice(0, 500),
    finalSystemPromptLength: finalSystemPrompt.length
  };
}
