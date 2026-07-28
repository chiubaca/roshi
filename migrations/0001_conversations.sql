CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'New conversation',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  model TEXT,
  tags TEXT
);

CREATE INDEX conversations_updated_at ON conversations(updated_at DESC);
