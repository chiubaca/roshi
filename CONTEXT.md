# Roshi

A personal Cloudflare-based AI assistant that supports voice and text input, persists multiple conversation threads, and uses Workers AI with tool calling.

## Language

**Conversation**:
A single threaded exchange between the user and the assistant. Identified by a ULID and backed by one Durable Object instance.
_Avoid_: Chat, thread, session

**Conversation ID**:
The ULID that uniquely identifies a conversation and addresses its Durable Object instance.
_Avoid_: DO name, room id

**Message**:
One turn in a conversation, stored in the conversation's Durable Object SQLite. Has a role (user, assistant, or tool), content, optional tool calls/results, and a creation timestamp.
_Avoid_: Turn, exchange

**Conversation index**:
The D1 table that lists every conversation for the root view, holding only lightweight metadata.
_Avoid_: Directory, registry
