import type { ChatMessage } from '../types/chat';

const historyPrefix = 'dongni_chat_history_';

interface ConversationRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
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
}

function historyKey(userId: string): string {
  return `${historyPrefix}${userId}`;
}

function createConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createConversation(seedMessages: ChatMessage[]): ConversationRecord {
  const now = Date.now();
  return {
    id: createConversationId(),
    createdAt: now,
    updatedAt: now,
    messages: sanitizeMessages(seedMessages)
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
  };

  const id = String(item.id || '').trim();
  if (!id) return null;

  const now = Date.now();
  const createdAt = Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : now;
  const updatedAt = Number.isFinite(Number(item.updatedAt)) ? Number(item.updatedAt) : createdAt;

  return {
    id,
    createdAt,
    updatedAt,
    messages: sanitizeMessages(item.messages)
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
  const sanitizedMap = new Map<string, ConversationRecord>();

  for (const item of Array.isArray(parsed.conversations) ? parsed.conversations : []) {
    const conversation = sanitizeConversation(item);
    if (!conversation) {
      changed = true;
      continue;
    }

    const existing = sanitizedMap.get(conversation.id);
    if (!existing || conversation.updatedAt >= existing.updatedAt) {
      sanitizedMap.set(conversation.id, conversation);
      if (existing) {
        changed = true;
      }
    } else {
      changed = true;
    }
  }

  let conversations = sortByUpdatedTime([...sanitizedMap.values()]);

  if (!conversations.length) {
    conversations = [createConversation(seedMessages)];
    changed = true;
  }

  const activeId = String(parsed.activeConversationId || '').trim();
  const hasActive = conversations.some((conversation) => conversation.id === activeId);
  const activeConversationId = hasActive ? activeId : conversations[0].id;

  if (!hasActive) {
    changed = true;
  }

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
    if (!raw) {
      return ensureStore(null, seedMessages);
    }
    return ensureStore(JSON.parse(raw), seedMessages);
  } catch {
    return ensureStore(null, seedMessages);
  }
}

function writeStore(userId: string, store: UserConversationStore): void {
  localStorage.setItem(historyKey(userId), JSON.stringify(store));
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

export function readOrCreateActiveConversation(userId: string, seedMessages: ChatMessage[]): ChatMessage[] {
  const { store, changed } = readStore(userId, seedMessages);
  if (changed) {
    writeStore(userId, store);
  }

  const active = store.conversations.find((conversation) => conversation.id === store.activeConversationId);
  if (!active) {
    const fallback = createConversation(seedMessages);
    const repairedStore: UserConversationStore = {
      activeConversationId: fallback.id,
      conversations: [fallback, ...store.conversations]
    };
    writeStore(userId, repairedStore);
    return fallback.messages;
  }

  if (!active.messages.length) {
    active.messages = sanitizeMessages(seedMessages);
    active.updatedAt = Date.now();
    writeStore(userId, {
      ...store,
      conversations: sortByUpdatedTime(store.conversations)
    });
  }

  return active.messages.length ? active.messages : sanitizeMessages(seedMessages);
}

export function saveActiveConversation(userId: string, messages: ChatMessage[], seedMessages: ChatMessage[]): void {
  const { store } = readStore(userId, seedMessages);
  const now = Date.now();
  const sanitized = sanitizeMessages(messages);

  const nextConversations = store.conversations.map((conversation) => {
    if (conversation.id !== store.activeConversationId) {
      return conversation;
    }
    return {
      ...conversation,
      updatedAt: now,
      messages: sanitized
    };
  });

  if (!nextConversations.some((conversation) => conversation.id === store.activeConversationId)) {
    nextConversations.push({
      ...createConversation(seedMessages),
      id: store.activeConversationId,
      updatedAt: now,
      messages: sanitized
    });
  }

  writeStore(userId, {
    activeConversationId: store.activeConversationId,
    conversations: sortByUpdatedTime(nextConversations)
  });
}

export function listConversationSummaries(userId: string, seedMessages: ChatMessage[]): ConversationSummary[] {
  const { store, changed } = readStore(userId, seedMessages);
  if (changed) {
    writeStore(userId, store);
  }

  return sortByUpdatedTime(store.conversations).map((conversation) => ({
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    isActive: conversation.id === store.activeConversationId
  }));
}
