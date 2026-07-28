const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type Conversation = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  model: string | null;
  tags: string[] | null;
};

type ConversationRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  model: string | null;
  tags: string | null;
};

export async function createConversation(db: D1Database): Promise<Conversation> {
  const now = new Date().toISOString();
  const conversation = {
    id: createUlid(),
    name: "New conversation",
    createdAt: now,
    updatedAt: now,
    model: null,
    tags: null,
  };

  await db
    .prepare("INSERT INTO conversations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .bind(conversation.id, conversation.name, now, now)
    .run();

  return conversation;
}

export async function listConversations(db: D1Database): Promise<Conversation[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, created_at, updated_at, model, tags FROM conversations ORDER BY updated_at DESC",
    )
    .all<ConversationRow>();

  return results.map(toConversation);
}

export async function recordConversationActivity(
  db: D1Database,
  id: string,
  firstUserMessage: string | undefined,
): Promise<void> {
  const title = firstUserMessage ? conversationTitle(firstUserMessage) : undefined;
  await db
    .prepare(
      `UPDATE conversations
       SET name = CASE WHEN name = 'New conversation' AND ? IS NOT NULL THEN ? ELSE name END,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(title ?? null, title ?? null, new Date().toISOString(), id)
    .run();
}

export function conversationTitle(message: string): string | undefined {
  const title = message
    .trim()
    .slice(0, 40)
    .replace(/[\s.,!?;:]+$/, "");
  return title.length >= 3 ? title : undefined;
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    model: row.model,
    tags: row.tags ? JSON.parse(row.tags) : null,
  };
}

function createUlid(): string {
  let timestamp = Date.now();
  let ulid = "";
  for (let index = 0; index < 10; index += 1) {
    ulid = CROCKFORD_BASE32[timestamp % 32] + ulid;
    timestamp = Math.floor(timestamp / 32);
  }

  const random = crypto.getRandomValues(new Uint8Array(16));
  for (const byte of random) ulid += CROCKFORD_BASE32[byte & 31];

  return ulid;
}
