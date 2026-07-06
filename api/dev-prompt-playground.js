import { methodNotAllowed, parseJsonBody } from './_http.js';
import { listPlaygroundPrompts, runPlaygroundPromptTest, savePlaygroundPrompt } from './_prompt-playground.js';

export const config = { runtime: 'nodejs' };

function isDevelopment() {
  return process.env.NODE_ENV !== 'production';
}

export default async function handler(req, res) {
  if (!isDevelopment()) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method === 'GET') {
    const prompts = await listPlaygroundPrompts();
    return res.status(200).json({ prompts });
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'GET, POST');
  }

  const body = parseJsonBody(req);

  try {
    if (body.action === 'save') {
      const saved = await savePlaygroundPrompt(body.type, body.prompt);
      return res.status(200).json({ saved });
    }

    if (body.action === 'test') {
      const result = await runPlaygroundPromptTest({
        type: body.type,
        prompt: body.prompt,
        input: body.input,
        model: body.model
      });

      return res.status(200).json(result);
    }

    return res.status(400).json({ error: 'Unsupported action.' });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Playground request failed.' });
  }
}
