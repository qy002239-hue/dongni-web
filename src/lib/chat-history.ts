import type { ChatMessage } from '../types/chat';

const historyPrefix = 'dongni_chat_history_';

type TitleStatus = 'pending' | 'generated' | 'fallback';

interface ConversationRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  aiTitle: string;
  titleStatus: TitleStatus;
  titleAttempts: number;
}

interface UserConversationStore {
  activeConversationId: string;
  conversations: ConversationRecord[];
}

export interface ConversationSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  isActive: boolean;
  title: string;
  titleStatus: TitleStatus;
  titleAttempts: number;
  canGenerateTitle: boolean;
}

export interface ConversationState {
  activeConversationId: string;
  messages: ChatMessage[];
  summaries: ConversationSummary[];
}

function historyKey(userId: string): string {
  return `${historyPrefix}${userId}`;
}

function createConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((item) => typeof item === 'object' && item !== null)
    .map((item) => item as { role?: unknown; content?: unknown })
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({
      role: item.role as ChatMessage['role'],
      content: String(item.content || '')
    }))
    .filter((item) => item.content.trim());
}

function hasEnoughMessagesForTitle(messages: ChatMessage[]): boolean {
  let userCount = 0;
  let assistantCount = 0;
  for (const message of messages) {
    if (message.role === 'user' && message.content.trim()) userCount += 1;
    if (message.role === 'assistant' && message.content.trim()) assistantCount += 1;
  }
  return userCount >= 1 && assistantCount >= 1;
}

function normalizeTitleStatus(input: unknown): TitleStatus {
  return input === 'generated' || input === 'fallback' ? input : 'pending';
}

function normalizeTitle(input: unknown): string {
  return String(input || '').trim();
}

function defaultTitle(): string {
  return '新的對話';
}

function displayTitle(conversation: ConversationRecord): string {
  if (conversation.titleStatus === 'generated' && conversation.aiTitle.trim()) {
    return conversation.aiTitle.trim();
  }
  return defaultTitle();
}

function canGenerateTitle(conversation: ConversationRecord): boolean {
  if (!hasEnoughMessagesForTitle(conversation.messages)) return false;
  if (conversation.titleStatus === 'generated') return false;
  return conversation.titleAttempts < 2;
}

function createConversation(seedMessages: ChatMessage[]): ConversationRecord {
  const now = Date.now();
  return {
    id: createConversationId(),
    createdAt: now,
    updatedAt: now,
    messages: sanitizeMessages(seedMessages),
    aiTitle: '',
    titleStatus: 'pending',
    titleAttempts: 0
  };
}

function sortByUpdatedTime(conversations: ConversationRecord[]): ConversationRecord[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

function sanitizeConversation(input: unknown): ConversationRecord | null {
  if (typeof input !== 'object' || input === null) return null;

  const item = input as {
    id?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    messages?: unknown;
    aiTitle?: unknown;
    titleStatus?: unknown;
    titleAttempts?: unknown;
  };

  const id = String(item.id || '').trim();
  if (!id) return null;

  const now = Date.now();
  const createdAt = Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : now;
  const updatedAt = Number.isFinite(Number(item.updatedAt)) ? Number(item.updatedAt) : createdAt;
  const messages = sanitizeMessages(item.messages);

  return {
    id,
    createdAt,
    updatedAt,
    messages,
    aiTitle: normalizeTitle(item.aiTitle),
    titleStatus: normalizeTitleStatus(item.titleStatus),
    titleAttempts: Math.max(0, Number.isFinite(Number(item.titleAttempts)) ? Number(item.titleAttempts) : 0)
  };
}

function ensureStore(raw: unknown, seedMessages: ChatMessage[]): { store: UserConversationStore; changed: boolean } {
  let changed = false;

  if (Array.isArray(raw)) {
    const migratedMessages = sanitizeMessages(raw);
    const migratedConversation = createConversation(migratedMessages.length ? migratedMessages : seedMessages);
    return {
      store: {
        activeConversationId: migratedConversation.id,
        conversations: [migratedConversation]
      },
      changed: true
    };
  }

  if (typeof raw !== 'object' || raw === null) {
    const conversation = createConversation(seedMessages);
    return {
      store: {
        activeConversationId: conversation.id,
        conversations: [conversation]
      },
      changed: true
    };
  }

  const parsed = raw as { activeConversationId?: unknown; conversations?: unknown[] };
  const map = new Map<string, ConversationRecord>();

  for (const item of Array.isArray(parsed.conversations) ? parsed.conversations : []) {
    const conversation = sanitizeConversation(item);
    if (!conversation) {
      changed = true;
      continue;
    }

    const existing = map.get(conversation.id);
    if (!existing || conversation.updatedAt >= existing.updatedAt) {
      map.set(conversation.id, conversation);
      if (existing) changed = true;
    } else {
      changed = true;
    }
  }

  let conversations = sortByUpdatedTime([...map.values()]);
  if (!conversations.length) {
    conversations = [createConversation(seedMessages)];
    changed = true;
  }

  const activeId = String(parsed.activeConversationId || '').trim();
  const hasActive = conversations.some((conversation) => conversation.id === activeId);
  const activeConversationId = hasActive ? activeId : conversations[0].id;
  if (!hasActive) changed = true;

  return {
    store: {
      activeConversationId,
      conversations
    },
    changed
  };
}

function readStore(userId: string, seedMessages: ChatMessage[]): { store: UserConversationStore; changed: boolean } {
  const key = historyKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return ensureStore(null, seedMessages);
    return ensureStore(JSON.parse(raw), seedMessages);
  } catch {
    return ensureStore(null, seedMessages);
  }
}

function writeStore(userId: string, store: UserConversationStore): void {
  localStorage.setItem(historyKey(userId), JSON.stringify(store));
}

function toSummary(conversation: ConversationRecord, activeConversationId: string): ConversationSummary {
  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    isActive: conversation.id === activeConversationId,
    title: displayTitle(conversation),
    titleStatus: conversation.titleStatus,
    titleAttempts: conversation.titleAttempts,
    canGenerateTitle: canGenerateTitle(conversation)
  };
}

function toState(store: UserConversationStore): ConversationState {
  const sorted = sortByUpdatedTime(store.conversations);
  const active = sorted.find((conversation) => conversation.id === store.activeConversationId) || sorted[0];

  return {
    activeConversationId: active.id,
    messages: active.messages,
    summaries: sorted.map((conversation) => toSummary(conversation, active.id))
  };
}

export function readConversationState(userId: string, seedMessages: ChatMessage[]): ConversationState {
  const { store, changed } = readStore(userId, seedMessages);
  if (changed) writeStore(userId, store);
  return toState(store);
}

export function setActiveConversation(userId: string, conversationId: string, seedMessages: ChatMessage[]): ConversationState {
  const { store } = readStore(userId, seedMessages);
  const sorted = sortByUpdatedTime(store.conversations);
  const exists = sorted.some((conversation) => conversation.id === conversationId);
  const nextActive = exists ? conversationId : sorted[0].id;

  const next: UserConversationStore = {
    activeConversationId: nextActive,
    conversations: sorted
  };

  writeStore(userId, next);
  return toState(next);
}

export function createConversationForUser(userId: string, seedMessages: ChatMessage[]): ConversationState {
  const { store } = readStore(userId, seedMessages);
  const created = createConversation(seedMessages);

  const next: UserConversationStore = {
    activeConversationId: created.id,
    conversations: sortByUpdatedTime([created, ...store.conversations])
  };

  writeStore(userId, next);
  return toState(next);
}

export function saveConversationMessages(
  userId: string,
  conversationId: string,
  messages: ChatMessage[],
  seedMessages: ChatMessage[]
): ConversationState {
  const { store } = readStore(userId, seedMessages);
  const now = Date.now();
  const sanitized = sanitizeMessages(messages);

  const hasTarget = store.conversations.some((conversation) => conversation.id === conversationId);
  const conversations = hasTarget
    ? store.conversations.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      return {
        ...conversation,
        updatedAt: now,
        messages: sanitized
      };
    })
    : [
      {
        ...createConversation(seedMessages),
        id: conversationId,
        updatedAt: now,
        messages: sanitized
      },
      ...store.conversations
    ];

  const next: UserConversationStore = {
    activeConversationId: conversationId,
    conversations: sortByUpdatedTime(conversations)
  };

  writeStore(userId, next);
  return toState(next);
}

export function deleteConversationForUser(
  userId: string,
  conversationId: string,
  seedMessages: ChatMessage[]
): ConversationState {
  const { store } = readStore(userId, seedMessages);
  let conversations = store.conversations.filter((conversation) => conversation.id !== conversationId);

  if (!conversations.length) {
    conversations = [createConversation(seedMessages)];
  }

  const sorted = sortByUpdatedTime(conversations);
  const nextActive = sorted.some((conversation) => conversation.id === store.activeConversationId)
    ? store.activeConversationId
    : sorted[0].id;

  const next: UserConversationStore = {
    activeConversationId: nextActive,
    conversations: sorted
  };

  writeStore(userId, next);
  return toState(next);
}

export interface TitleGenerationPayload {
  conversationId: string;
  messages: ChatMessage[];
  attempts: number;
}

export function getTitleGenerationPayload(
  userId: string,
  conversationId: string,
  seedMessages: ChatMessage[]
): TitleGenerationPayload | null {
  const { store } = readStore(userId, seedMessages);
  const conversation = store.conversations.find((item) => item.id === conversationId);
  if (!conversation) return null;
  if (!canGenerateTitle(conversation)) return null;

  return {
    conversationId,
    messages: conversation.messages,
    attempts: conversation.titleAttempts
  };
}

export function setConversationGeneratedTitle(
  userId: string,
  conversationId: string,
  title: string,
  seedMessages: ChatMessage[]
): ConversationState {
  const { store } = readStore(userId, seedMessages);

  const trimmedTitle = title.trim();
  const conversations = store.conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    return {
      ...conversation,
      aiTitle: trimmedTitle,
      titleStatus: (trimmedTitle ? 'generated' : 'fallback') as TitleStatus,
      titleAttempts: Math.max(conversation.titleAttempts, 1)
    };
  });

  const next: UserConversationStore = {
    ...store,
    conversations: sortByUpdatedTime(conversations)
  };

  writeStore(userId, next);
  return toState(next);
}

export function markConversationTitleFailure(
  userId: string,
  conversationId: string,
  seedMessages: ChatMessage[]
): ConversationState {
  const { store } = readStore(userId, seedMessages);

  const conversations = store.conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    return {
      ...conversation,
      titleStatus: 'fallback' as TitleStatus,
      titleAttempts: conversation.titleAttempts + 1
    };
  });

  const next: UserConversationStore = {
    ...store,
    conversations: sortByUpdatedTime(conversations)
  };

  writeStore(userId, next);
  return toState(next);
}
