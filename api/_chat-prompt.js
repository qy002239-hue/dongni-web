import {
  PROMPT_FILE_PATH,
  getPromptDiagnosticsByType
} from './_prompt-manager.js';

export async function buildChatSystemPrompt(memory) {
  const [system, chat] = await Promise.all([
    getPromptDiagnosticsByType('system', { preferredId: process.env.OPENROUTER_SYSTEM_PROMPT_ID }),
    getPromptDiagnosticsByType('chat', { preferredId: process.env.OPENROUTER_CHAT_PROMPT_ID })
  ]);

  const basePrompt = [system.content, chat.content].filter(Boolean).join('\n\n').trim();
  const trimmedMemory = String(memory || '').trim();
  const finalSystemPrompt = trimmedMemory
    ? `${basePrompt}\n\n使用者留下的長期記憶：\n${trimmedMemory.slice(0, 3000)}\n`
    : basePrompt;

  return {
    promptFilePath: PROMPT_FILE_PATH,
    system,
    chat,
    basePrompt,
    finalSystemPrompt,
    finalSystemPromptPreview: finalSystemPrompt.slice(0, 500),
    finalSystemPromptLength: finalSystemPrompt.length
  };
}
