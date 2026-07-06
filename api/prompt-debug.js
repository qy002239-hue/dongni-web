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

  if (req.method === 'POST') {
    parseJsonBody(req);
  }

  const promptBuild = await buildChatSystemPrompt();

  return res.status(200).json({
    loadedPrompt: {
      promptFilePath: promptBuild.promptFilePath
    },
    openRouterSystemPrompt: {
      length: promptBuild.finalSystemPromptLength,
      first500: promptBuild.finalSystemPromptPreview,
      full: promptBuild.finalSystemPrompt
    },
    hashProof: {
      sourcePromptSha256: promptBuild.sourcePromptSha256,
      sentSystemPromptSha256: promptBuild.finalSystemPromptSha256,
      exactMatch: promptBuild.exactMatch
    }
  });
}
