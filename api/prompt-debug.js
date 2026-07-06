import { methodNotAllowed, parseJsonBody } from './_http.js';
import { validateChatEnv, getPublicEnvError, logEnvValidation } from './_env.js';
import { buildChatSystemPrompt } from './_chat-prompt.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return methodNotAllowed(res, 'GET, POST');
  }

  const envValidation = validateChatEnv();
  if (!envValidation.ok) {
    logEnvValidation(envValidation, '[prompt-debug]');
    const envError = getPublicEnvError(envValidation);
    return res.status(envError.status).json({ error: envError.message });
  }

  const body = req.method === 'POST' ? parseJsonBody(req) : {};
  const memory = String(body.memory || '').trim();

  const promptBuild = await buildChatSystemPrompt(memory);

  return res.status(200).json({
    loadedPrompt: {
      promptFilePath: promptBuild.promptFilePath,
      system: {
        type: promptBuild.system.type,
        preferredId: promptBuild.system.preferredId,
        selectedPromptId: promptBuild.system.selectedPromptId,
        selectedPromptName: promptBuild.system.selectedPromptName,
        selectedPromptVersion: promptBuild.system.selectedPromptVersion,
        usedFallback: promptBuild.system.usedFallback,
        isMissing: promptBuild.system.isMissing
      },
      chat: {
        type: promptBuild.chat.type,
        preferredId: promptBuild.chat.preferredId,
        selectedPromptId: promptBuild.chat.selectedPromptId,
        selectedPromptName: promptBuild.chat.selectedPromptName,
        selectedPromptVersion: promptBuild.chat.selectedPromptVersion,
        usedFallback: promptBuild.chat.usedFallback,
        isMissing: promptBuild.chat.isMissing
      }
    },
    openRouterSystemPrompt: {
      length: promptBuild.finalSystemPromptLength,
      first500: promptBuild.finalSystemPromptPreview,
      full: promptBuild.finalSystemPrompt
    }
  });
}
