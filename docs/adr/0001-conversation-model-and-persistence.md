# Conversation model and persistence

Each conversation is identified by a ULID and backed by its own Durable Object instance. The Durable Object's SQLite stores the full message history and conversation metadata, while a shared D1 table acts as a lightweight conversation index for the root list view. This keeps the hot path (reading and writing messages during a chat) inside the DO that owns the conversation, and uses D1 only for the cross-conversation list.

We chose this over a single DO for all conversations because one-DO-per-conversation gives natural isolation, easy deletion, and a clear source of truth. We chose D1 over a separate index DO because D1 is queryable and scales better for listing, while still being simple enough for a personal MVP.
