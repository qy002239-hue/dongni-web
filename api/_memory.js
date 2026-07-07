const MEMORY_TABLE = 'dongni_user_memory';
const MEMORY_EVENTS_TABLE = 'dongni_memory_events';

function normalizeText(input, max = 3200) {
  return String(input || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeFacts(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => normalizeText(item, 160))
      .filter(Boolean);
  }

  if (typeof input === 'string') {
    return input
      .split(/\n|；|;|。/g)
      .map((item) => normalizeText(item, 160))
      .filter(Boolean);
  }

  return [];
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[。！？!?])|\n/g)
    .map((item) => normalizeText(item, 200))
    .filter(Boolean);
}

function selectImportantSentences(messages) {
  const keywords = [
    '我', '喜歡', '討厭', '害怕', '焦慮', '壓力', '工作', '家庭', '關係', '睡',
    '目標', '計畫', '習慣', '希望', '擔心', '在意', '需要', '不想'
  ];

  const userTexts = messages
    .filter((message) => message?.role === 'user')
    .map((message) => normalizeText(message?.content, 600))
    .filter(Boolean)
    .slice(-6);

  const candidates = [];
  for (const text of userTexts) {
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
      if (sentence.length < 8) continue;
      if (sentence.length > 120) continue;
      if (!keywords.some((keyword) => sentence.includes(keyword))) continue;
      candidates.push(sentence);
      if (candidates.length >= 12) break;
    }
    if (candidates.length >= 12) break;
  }

  return candidates;
}

function mergeFacts(existingFacts, newFacts) {
  const merged = [];
  const seen = new Set();

  for (const fact of [...existingFacts, ...newFacts]) {
    const normalized = normalizeText(fact, 160);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
    if (merged.length >= 20) break;
  }

  return merged;
}

function buildSummary(existingSummary, importantFacts) {
  const normalizedExisting = normalizeText(existingSummary, 900);
  const highlights = importantFacts.slice(-5).join('；');

  if (!normalizedExisting && !highlights) {
    return '';
  }

  if (!normalizedExisting) {
    return normalizeText(`使用者近況重點：${highlights}`, 900);
  }

  if (!highlights) {
    return normalizedExisting;
  }

  if (normalizedExisting.includes(highlights)) {
    return normalizedExisting;
  }

  return normalizeText(`${normalizedExisting} 最新補充：${highlights}`, 900);
}

function buildMemoryContext(memoryRow) {
  if (!memoryRow) return '';

  const summary = normalizeText(memoryRow.summary, 1200);
  const facts = normalizeFacts(memoryRow.important_facts).slice(0, 12);
  if (!summary && !facts.length) return '';

  const lines = [
    '以下是同一位使用者的長期記憶摘要，僅供你理解脈絡並保持一致：'
  ];

  if (summary) {
    lines.push(`- 記憶摘要：${summary}`);
  }

  if (facts.length) {
    lines.push('- 重要資訊：');
    for (const fact of facts) {
      lines.push(`  - ${fact}`);
    }
  }

  lines.push('請用於理解上下文，不要逐字重複，也不要捏造未提供的資訊。');
  return lines.join('\n');
}

export async function getUserMemoryContext(supabase, userId) {
  const { data, error } = await supabase
    .from(MEMORY_TABLE)
    .select('summary, important_facts, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[memory] failed to load memory:', error.message || error);
    return '';
  }

  return buildMemoryContext(data || null);
}

export async function updateUserMemoryFromConversation(supabase, userId, messages, assistantReply) {
  const sanitizedMessages = Array.isArray(messages)
    ? messages
      .filter((message) => ['user', 'assistant'].includes(message?.role))
      .map((message) => ({
        role: message.role,
        content: normalizeText(message.content, 1200)
      }))
      .filter((message) => message.content)
      .slice(-20)
    : [];

  const normalizedReply = normalizeText(assistantReply, 2400);

  if (!sanitizedMessages.length && !normalizedReply) {
    return;
  }

  const { data: current, error: readError } = await supabase
    .from(MEMORY_TABLE)
    .select('summary, important_facts')
    .eq('user_id', userId)
    .maybeSingle();

  if (readError) {
    console.error('[memory] failed to read current memory:', readError.message || readError);
    return;
  }

  const existingFacts = normalizeFacts(current?.important_facts);
  const newFacts = selectImportantSentences(sanitizedMessages);
  const importantFacts = mergeFacts(existingFacts, newFacts);
  const summary = buildSummary(current?.summary, importantFacts);
  const now = new Date().toISOString();

  const { error: upsertError } = await supabase
    .from(MEMORY_TABLE)
    .upsert({
      user_id: userId,
      summary,
      important_facts: importantFacts,
      updated_at: now
    }, { onConflict: 'user_id' });

  if (upsertError) {
    console.error('[memory] failed to upsert memory:', upsertError.message || upsertError);
    return;
  }

  const { error: eventError } = await supabase
    .from(MEMORY_EVENTS_TABLE)
    .insert({
      user_id: userId,
      conversation_messages: sanitizedMessages,
      assistant_reply: normalizedReply,
      memory_snapshot: {
        summary,
        important_facts: importantFacts
      },
      created_at: now
    });

  if (eventError) {
    console.error('[memory] failed to append memory event:', eventError.message || eventError);
  }
}
