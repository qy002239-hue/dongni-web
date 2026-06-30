import { sendMessageToServerForTestReception } from './api';
import './TestReception.css';
import { useMemo, useState } from 'react';

const QUICK_LINES = [
  '我今天真的很累……',
  '我不知道努力到底有什麼意義。',
  '我只是希望有人懂我。',
  '我覺得自己很失敗。',
  '我不知道還能撐多久。',
  '今天工作完真的好想哭。',
  '我不知道是不是我太脆弱。'
];

const DEFAULT_TEST_PROMPT = `妳是「懂妳」接住能力測試助手。\n\n目標：\n1. 先接住情緒，再回應內容。\n2. 不說教、不急著解決、不過度分析。\n3. 使用繁體中文，語氣溫柔、真誠、貼近。\n4. 讓使用者感受到被理解、可以繼續說。`;

const EVAL_ITEMS = [
  '有接住情緒',
  '沒有說教',
  '沒有急著解決問題',
  '沒有分析過多',
  '沒有否定使用者',
  '符合懂妳語氣',
  '我願意繼續聊下去'
];

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toTimestamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
}

export default function TestReception() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_TEST_PROMPT);
  const [promptMode, setPromptMode] = useState('official');
  const [evaluation, setEvaluation] = useState(() => EVAL_ITEMS.reduce((acc, item) => ({ ...acc, [item]: false }), {}));
  const [note, setNote] = useState('');

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const handleQuickLine = (line) => setInput(line);

  const toggleEvaluation = (item) => {
    setEvaluation((prev) => ({ ...prev, [item]: !prev[item] }));
  };

  const handleClearConversation = () => {
    setMessages([]);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSend) return;

    const userMessage = { role: 'user', content: input.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setError('');
    setLoading(true);

    const assistantIndex = nextMessages.length;
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '',
        meta: {
          durationMs: null,
          usage: null,
          raw: null
        }
      }
    ]);

    try {
      const result = await sendMessageToServerForTestReception({
        messages: nextMessages,
        memory: '',
        accessToken: '',
        systemPrompt,
        useTestPrompt: promptMode === 'test',
        onChunk: (chunk) => {
          setMessages((prev) => {
            const copy = [...prev];
            copy[assistantIndex] = {
              ...copy[assistantIndex],
              content: (copy[assistantIndex].content || '') + chunk
            };
            return copy;
          });
        }
      });

      setMessages((prev) => {
        const copy = [...prev];
        copy[assistantIndex] = {
          ...copy[assistantIndex],
          content: result.fullReply,
          meta: {
            durationMs: result.durationMs,
            usage: result.usage,
            raw: result.raw
          }
        };
        return copy;
      });
    } catch (err) {
      setError(err.message || '送出失敗');
      setMessages((prev) => prev.filter((_, idx) => idx !== assistantIndex));
    } finally {
      setLoading(false);
    }
  };

  const exportMarkdown = () => {
    const lines = [
      '# 懂妳接住能力測試紀錄',
      '',
      `- 匯出時間: ${new Date().toISOString()}`,
      `- Prompt 模式: ${promptMode === 'official' ? '使用目前正式 Prompt' : '使用測試 Prompt'}`,
      ''
    ];

    if (promptMode === 'test') {
      lines.push('## 測試 Prompt', '```', systemPrompt, '```', '');
    }

    lines.push('## 對話內容', '');
    messages.forEach((m) => {
      lines.push(`### ${m.role === 'user' ? 'User' : 'Assistant'}`);
      lines.push(m.content || '');
      lines.push('');
      if (m.role === 'assistant' && m.meta) {
        lines.push(`- Response Time: ${m.meta.durationMs ?? 'N/A'} ms`);
        lines.push(`- Token Usage: ${m.meta.usage ? JSON.stringify(m.meta.usage) : 'N/A'}`);
        lines.push('');
      }
    });

    lines.push('## 人工評分', '');
    EVAL_ITEMS.forEach((item) => lines.push(`- [${evaluation[item] ? 'x' : ' '}] ${item}`));
    lines.push('', '## 備註', note || '(無)');

    downloadFile(`test-reception-${toTimestamp()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  };

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      promptMode,
      systemPrompt: promptMode === 'test' ? systemPrompt : null,
      evaluation,
      note,
      messages
    };

    downloadFile(`test-reception-${toTimestamp()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  };

  const copyConversation = async () => {
    const text = messages
      .map((m, idx) => {
        const header = `${idx + 1}. ${m.role.toUpperCase()}`;
        const body = m.content || '';
        const meta =
          m.role === 'assistant'
            ? `\nResponse Time: ${m.meta?.durationMs ?? 'N/A'} ms\nToken Usage: ${m.meta?.usage ? JSON.stringify(m.meta.usage) : 'N/A'}`
            : '';
        return `${header}\n${body}${meta}`;
      })
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(text || '(目前沒有對話)');
      alert('已複製整段對話');
    } catch {
      alert('複製失敗，請手動複製');
    }
  };

  return (
    <div className="test-reception-page">
      <h1>懂妳接住能力測試頁</h1>
      <p>此頁僅用於快速測 Prompt 與接住能力，不含登入、付款、扣點、Session、記憶。</p>

      <section className="panel">
        <h2>Prompt 測試設定</h2>
        <label className="inline">
          <input
            type="radio"
            name="promptMode"
            checked={promptMode === 'official'}
            onChange={() => setPromptMode('official')}
          />
          使用目前正式 Prompt
        </label>
        <label className="inline">
          <input
            type="radio"
            name="promptMode"
            checked={promptMode === 'test'}
            onChange={() => setPromptMode('test')}
          />
          使用測試 Prompt
        </label>

        <label htmlFor="systemPrompt">System Prompt（可即時編輯）</label>
        <textarea
          id="systemPrompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={8}
        />
      </section>

      <section className="panel">
        <h2>快速測試句</h2>
        <div className="quick-lines">
          {QUICK_LINES.map((line) => (
            <button type="button" key={line} onClick={() => handleQuickLine(line)}>
              {line}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>對話測試</h2>
        <form onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={5}
            placeholder="輸入要測試的訊息..."
          />
          <div className="actions">
            <button type="submit" disabled={!canSend}>
              {loading ? '回應中...' : '送出'}
            </button>
            <button type="button" onClick={handleClearConversation}>
              清除對話
            </button>
            <button type="button" onClick={exportMarkdown}>
              匯出 Markdown
            </button>
            <button type="button" onClick={exportJson}>
              匯出 JSON
            </button>
            <button type="button" onClick={copyConversation}>
              一鍵複製整段對話
            </button>
          </div>
        </form>

        {error ? <p className="error">{error}</p> : null}

        <div className="messages">
          {messages.map((m, idx) => (
            <article key={idx} className={`message ${m.role}`}>
              <h3>{m.role === 'user' ? '你' : 'AI'}</h3>
              <pre>{m.content}</pre>

              {m.role === 'assistant' ? (
                <div className="meta">
                  <p>Response Time: {m.meta?.durationMs ?? 'N/A'} ms</p>
                  <p>Token Usage: {m.meta?.usage ? JSON.stringify(m.meta.usage) : 'N/A'}</p>
                  <details>
                    <summary>Raw JSON</summary>
                    <pre>{JSON.stringify(m.meta?.raw || null, null, 2)}</pre>
                  </details>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>人工評分</h2>
        <div className="checks">
          {EVAL_ITEMS.map((item) => (
            <label key={item}>
              <input type="checkbox" checked={evaluation[item]} onChange={() => toggleEvaluation(item)} />
              {item}
            </label>
          ))}
        </div>

        <label htmlFor="note">備註</label>
        <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
      </section>
    </div>
  );
}
