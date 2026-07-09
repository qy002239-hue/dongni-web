import { useCallback, useEffect, useMemo, useState } from 'react';
import './PromptPlaygroundPage.css';

type PromptType = 'chat' | 'conversation-title' | 'future-summary' | 'system';

type PromptRow = {
  type: PromptType;
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  content: string;
};

type TestResult = {
  prompt: string;
  request: unknown;
  response: string;
  usage: unknown;
};

const TYPE_OPTIONS: Array<{ label: string; value: PromptType }> = [
  { label: 'Chat', value: 'chat' },
  { label: 'Conversation Title', value: 'conversation-title' },
  { label: 'Future Summary', value: 'future-summary' },
  { label: 'System', value: 'system' }
];

function resolveApiUrl(path: string): string {
  const configuredBase = String(import.meta.env.VITE_CHAT_API_BASE_URL || '').trim();
  if (configuredBase) {
    return `${configuredBase.replace(/\/$/, '')}${path}`;
  }

  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return `http://127.0.0.1:3001${path}`;
  }

  return path;
}

export default function PromptPlaygroundPage() {
  const [selectedType, setSelectedType] = useState<PromptType>('chat');
  const [prompts, setPrompts] = useState<Record<string, PromptRow>>({});
  const [promptInput, setPromptInput] = useState('');
  const [testInput, setTestInput] = useState('請以繁體中文回覆，這是 Prompt Playground 測試。');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState('Loading prompts...');
  const [error, setError] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const selectedPrompt = prompts[selectedType];

  const metadataText = useMemo(() => {
    if (!selectedPrompt) return 'No prompt loaded.';
    return `Type: ${selectedPrompt.type}\nId: ${selectedPrompt.id}\nName: ${selectedPrompt.name}\nVersion: ${selectedPrompt.version}\nEnabled: ${selectedPrompt.enabled}`;
  }, [selectedPrompt]);

  const loadPrompts = useCallback(async () => {
    setError('');
    const response = await fetch(resolveApiUrl('/api/dev-prompt-playground'));
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Unable to load prompts.');
    }

    const nextMap: Record<string, PromptRow> = {};
    for (const row of data.prompts || []) {
      nextMap[row.type] = row;
    }

    setPrompts(nextMap);
    setStatus('Prompt data synced.');

  }, []);

  useEffect(() => {
    loadPrompts().catch((nextError) => {
      setError(nextError.message || 'Unable to load prompts.');
      setStatus('Prompt load failed.');
    });
  }, [loadPrompts]);

  useEffect(() => {
    if (selectedPrompt) {
      setPromptInput(String(selectedPrompt.content || ''));
    }
  }, [selectedPrompt]);

  const savePrompt = async () => {
    setIsSaving(true);
    setError('');
    setStatus('Saving prompt...');

    try {
      const response = await fetch(resolveApiUrl('/api/dev-prompt-playground'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          type: selectedType,
          prompt: promptInput
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save prompt.');
      }

      setStatus('Prompt saved. Changes are now active in development.');
      await loadPrompts();
    } catch (nextError) {
      const message = nextError instanceof Error && nextError.message
        ? nextError.message
        : 'Unable to save prompt.';
      setError(message);
      setStatus('Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const runTest = async () => {
    setIsTesting(true);
    setError('');
    setStatus('Running OpenRouter test...');

    try {
      const response = await fetch(resolveApiUrl('/api/dev-prompt-playground'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          type: selectedType,
          prompt: promptInput,
          input: testInput,
          model
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Prompt test failed.');
      }

      setResult(data);
      setStatus('Test complete.');
    } catch (nextError) {
      const message = nextError instanceof Error && nextError.message
        ? nextError.message
        : 'Prompt test failed.';
      setError(message);
      setStatus('Test failed.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <main className="prompt-playground">
      <h1>Prompt Playground (Development Only)</h1>
      <p>{status}</p>

      <div className="prompt-grid">
        <section className="prompt-panel">
          <label htmlFor="prompt-type">Prompt Type</label>
          <select
            id="prompt-type"
            value={selectedType}
            onChange={(event) => setSelectedType(event.target.value as PromptType)}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <label htmlFor="prompt-editor">Prompt</label>
          <textarea
            id="prompt-editor"
            value={promptInput}
            onChange={(event) => setPromptInput(event.target.value)}
          />

          <div className="prompt-actions">
            <button className="secondary" type="button" onClick={loadPrompts}>
              Reload
            </button>
            <button className="primary" type="button" disabled={isSaving} onClick={savePrompt}>
              {isSaving ? 'Saving...' : 'Save Prompt'}
            </button>
          </div>

          <div className="prompt-meta">{metadataText}</div>
        </section>

        <section className="prompt-panel">
          <label htmlFor="test-input">Test Input</label>
          <textarea
            id="test-input"
            value={testInput}
            onChange={(event) => setTestInput(event.target.value)}
          />

          <label htmlFor="test-model">Model (Optional)</label>
          <input
            id="test-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="anthropic/claude-sonnet-4-5"
          />

          <div className="prompt-actions">
            <button className="primary" type="button" disabled={isTesting} onClick={runTest}>
              {isTesting ? 'Testing...' : 'Run OpenRouter Test'}
            </button>
          </div>

          {error ? <div className="prompt-error">{error}</div> : null}

          <div className="prompt-output">Prompt:\n{result?.prompt || '(no test result yet)'}</div>
          <div className="prompt-output">Request:\n{JSON.stringify(result?.request || {}, null, 2)}</div>
          <div className="prompt-output">Response:\n{result?.response || '(no response yet)'}</div>
          <div className="prompt-output">Token Usage:\n{JSON.stringify(result?.usage || {}, null, 2)}</div>
        </section>
      </div>
    </main>
  );
}
