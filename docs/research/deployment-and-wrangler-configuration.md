# Research: Deployment and wrangler configuration changes

Wayfinder ticket: [Research deployment and wrangler configuration changes](https://github.com/chiubaca/roshi/issues/8)
Map: [Roshi general-purpose AI assistant MVP](https://github.com/chiubaca/roshi/issues/1)
Verified against the installed `wrangler@4.110.0` config schema and Cloudflare docs on 2026-07-18.

## Recommendation (TL;DR)

Four additive changes to `wrangler.jsonc` — a **Browser Run binding**, a **D1 binding** for the conversation index, a **new DO migration tag** for the conversation agent class, and a **compatibility-date bump** — plus **two secrets** (`ROSHI_PASSWORD`, `TAVILY_API_KEY`) set via `wrangler secret put`. No new environment variables. The existing `pnpm deploy` script stays the deploy command; the only new steps are one-time setup (create D1, apply its SQL migrations, set secrets). Nothing is renamed or deleted.

## The ticket's questions, answered

1. **Which Browser Rendering binding** → `"browser": { "binding": "BROWSER", "remote": true }`, per [Research Cloudflare Browser Rendering integration](https://github.com/chiubaca/roshi/issues/6). `remote: true` is required for local dev (Quick Actions can't run locally); it has no effect in production. Requires `compatibility_date` ≥ `2026-03-24`, so bump from `2025-07-01` to the current date.
2. **DO migrations for conversation persistence** → yes, exactly one: append `{ "tag": "v2", "new_sqlite_classes": ["ConversationAgent"] }` and a matching `durable_objects.bindings` entry. The existing `v1` migration for `VoiceAgent` stays untouched — never edit old migrations, always add a new tag.
3. **New secrets or environment variables** → two secrets, zero vars. `ROSHI_PASSWORD` for the shared-password gate ([Choose access control for deployed personal use](https://github.com/chiubaca/roshi/issues/7)) and `TAVILY_API_KEY` for web search ([Research web search as a tool](https://github.com/chiubaca/roshi/issues/5)). Both go in `.dev.vars` locally (already gitignored). No `vars` needed — the model id and other config are fixed by prior decisions and can live in code.
4. **Deployment command and gotchas** → `pnpm deploy` (`vp run build && wrangler deploy`) unchanged. DO migrations auto-apply on deploy; **D1 SQL migrations do not** — they're applied separately with `wrangler d1 migrations apply`. Full sequence and gotchas below.

## Target `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "roshi-voice-to-text",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-18", // CHANGED — was "2025-07-01"; Browser Run Quick Actions need ≥ 2026-03-24
  "compatibility_flags": ["nodejs_compat"], // unchanged — required by the Agents SDK

  "ai": { "binding": "AI" }, // unchanged — GLM-4.7-Flash chat + Nova-3 STT

  // NEW — Browser Run Quick Actions for the browser_* tools (#6)
  "browser": { "binding": "BROWSER", "remote": true },

  // NEW — D1 conversation index for the `/` list view (#3)
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "roshi",
      "database_id": "<paste from `wrangler d1 create` output>",
      "migrations_dir": "./migrations",
    },
  ],

  "durable_objects": {
    "bindings": [
      { "name": "VoiceAgent", "class_name": "VoiceAgent" }, // unchanged
      { "name": "ConversationAgent", "class_name": "ConversationAgent" }, // NEW — one instance per conversation ULID (#3)
    ],
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["VoiceAgent"] }, // unchanged — never edit old migrations
    { "tag": "v2", "new_sqlite_classes": ["ConversationAgent"] }, // NEW — auto-applies on next deploy
  ],

  // NEW (optional but recommended) — Workers Logs with full sampling; trivial cost at personal-use scale
  "observability": { "enabled": true, "head_sampling_rate": 1 },
}
```

Notes on the shape:

- **`ConversationAgent` is a placeholder class name.** Whatever the chat agent class ends up being called (per [Research Workers AI tool-calling model and pattern](https://github.com/chiubaca/roshi/issues/2) it extends `AIChatAgent`), the same name must appear in three places: the `export class` in `src/index.ts`, `class_name` in the binding, and `new_sqlite_classes` in the `v2` migration. The existing convention (binding name == class name) is followed above.
- **Binding shapes verified** against `node_modules/wrangler/config-schema.json` (wrangler 4.110.0): `browser` takes `{ binding, remote }`; `d1_databases` items take `{ binding, database_name, database_id, migrations_dir, ... }` with `database_id` marked "(not required)".
- **Optional rename:** the worker is still named `roshi-voice-to-text` from the voice-first prototype. Renaming to `roshi` is cosmetic and **not required** — but if it's ever done, do it now while the only deployed DO is a throwaway demo: a rename deploys a brand-new worker, and the old one (plus its DO storage) must be deleted separately with `wrangler delete roshi-voice-to-text`. DO storage never transfers between scripts.

## Bindings, one by one

### AI — already present, no change

`{ "binding": "AI" }` covers both the chat model (`@cf/zai-org/glm-4.7-flash`, #2) and Nova-3 STT for voice. Workers AI always runs remotely, including in local dev.

### Browser Run — new (#6)

```jsonc
"browser": { "binding": "BROWSER", "remote": true }
```

One binding feeds `createQuickActionTools({ browser: this.env.BROWSER })` from `agents/browser/ai`, giving the model `browser_markdown` / `browser_extract` / `browser_links` / `browser_scrape` (full detail in [the Browser Run research](./browser-rendering-integration.md)). No new npm dependency — `agents@0.17.3` already ships it. Billing is browser-hours; personal use fits comfortably in even the free tier's 10 min/day.

### D1 — new (#3)

The conversation index (the `/` list view) lives in D1; messages stay in each conversation DO's SQLite.

```bash
# one-time
wrangler d1 create roshi
# → paste the returned database_id into wrangler.jsonc
```

Schema as decided in #3 (`id`, `name`, `created_at`, `updated_at`, `model`, `tags`):

```sql
-- migrations/0001_create_conversations.sql
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,            -- conversation ULID; also the DO instance name
  name TEXT NOT NULL DEFAULT 'New conversation',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  model TEXT,
  tags TEXT                       -- JSON array
);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations(updated_at DESC); -- the `/` list sorts by recent activity
```

Apply with `wrangler d1 migrations apply roshi --local` (dev) and `--remote` (prod). D1 free tier (5 GB, 5 M rows read/day) is vastly more than a personal conversation index needs.

### Durable Objects — one new class, one new migration tag

The conversation model (#3) is one DO instance per conversation ULID, so the new chat agent class needs its own binding + migration entry (Agents SDK rule: every agent class needs both). Appending `v2` with `new_sqlite_classes` gives the class SQLite-backed storage and auto-applies on the next deploy. `VoiceAgent` and its `v1` migration stay exactly as they are — the existing voice UI is being built upon, per the map's standing preferences.

If a later ticket ever folds voice into the conversation agent and retires `VoiceAgent`, that's a further migration (`deleted_classes`) — out of scope here.

## Secrets and the access-control mechanism (#7)

### The mechanism

Per [Choose access control for deployed personal use](https://github.com/chiubaca/roshi/issues/7): a single shared password, entered via a small login form, sets a long-lived signed cookie (~30 days). The cookie check runs as the **very first step in the Worker's `fetch` handler, before `routeAgentRequest`**, so one gate covers both HTTP routes and WebSocket upgrades (upgrade requests carry cookies). Cloudflare Access was rejected because roshi stays on the default `workers.dev` subdomain; IP allowlists were rejected because of roaming devices.

Deployment implications:

- **One secret:** `ROSHI_PASSWORD`, set with `wrangler secret put ROSHI_PASSWORD` (interactive prompt — never pass the value as an argument). The signed cookie is derived from this secret (HMAC via Web Crypto), so no second signing secret is needed.
- **No wrangler config** — the gate is pure Worker code. The only config touchpoint is the secret.
- **Implementation notes for the gate** (from workers-best-practices security rules): compare the submitted password with a timing-safe comparison, sign/verify the cookie with `crypto.subtle` HMAC, and set the cookie `HttpOnly; Secure; SameSite=Lax` with a ~30-day `Max-Age`. The login route itself (and any assets it needs) must be exempted from the check or the gate locks itself out.
- **Local dev:** put `ROSHI_PASSWORD` (and `TAVILY_API_KEY`) in `.dev.vars` — already in `.gitignore`.

### Web search secret (#5)

`TAVILY_API_KEY`, set with `wrangler secret put TAVILY_API_KEY`. Called via plain `fetch` from inside the conversation DO; no binding involved. Tavily's free tier (1,000 credits/month) covers personal use.

## Deployment sequence

### One-time setup (in order)

```bash
# 1. Create the D1 database; paste database_id into wrangler.jsonc
wrangler d1 create roshi

# 2. Create + apply the conversations-table migration (local and remote)
wrangler d1 migrations create roshi create_conversations
#    ...edit the generated migrations/0001_create_conversations.sql...
wrangler d1 migrations apply roshi --local
wrangler d1 migrations apply roshi --remote

# 3. Set secrets (interactive prompts)
wrangler secret put ROSHI_PASSWORD
wrangler secret put TAVILY_API_KEY

# 4. Regenerate Env types so DB and BROWSER are typed
pnpm types   # = wrangler types
```

### Every deploy

```bash
pnpm deploy   # = vp run build && wrangler deploy
```

DO migrations (`v2`) apply automatically as part of `wrangler deploy`. Validate first with `wrangler deploy --dry-run` if you want to preview the migration plan without deploying.

## Gotchas

- **Two different things are both called "migrations".** The top-level `migrations` array is for **Durable Object classes** and auto-applies on deploy. `migrations_dir` under `d1_databases` is for **D1 SQL schema** and is only applied by an explicit `wrangler d1 migrations apply`. Deploying the worker does **not** apply D1 migrations — forgetting the remote `--remote` apply leaves the production index table missing while the app expects it.
- **Compatibility-date bump is required, not optional.** The Browser Run Quick Actions binding needs `compatibility_date` ≥ `2026-03-24`. Bumping from `2025-07-01` also opts into every runtime change through the new date, so smoke-test the existing voice flow after the bump (docs guidance: set it to the current date, test, deploy).
- **`remote: true` on the browser binding is for local dev only.** Without it, `wrangler dev` fails with `The RPC receiver does not implement the method "quickAction"`. It has no effect in production.
- **Regenerate types after any config change.** `pnpm types` (`wrangler types`) updates `worker-configuration.d.ts` (gitignored, regenerated on demand). Note `src/index.ts` currently **hand-writes** `export type Env` — workers-best-practices flags hand-written `Env` interfaces as an anti-pattern that drifts from config; switching to the generated type is a small, worthwhile accompanying change.
- **Durable Objects require the Workers Paid plan.** The account already deploys `VoiceAgent`, so this is already satisfied — but it's why `wrangler deploy` would fail on a free account. Browser Run, D1, and Workers AI all have free tiers that cover personal use.
- **Secrets never go in `wrangler.jsonc`.** Use `wrangler secret put` (interactive) for production and `.dev.vars` for local. Both secrets are set per-worker; if the worker is ever renamed, re-set them on the new script.
- **`nodejs_compat` stays.** The Agents SDK requires it; it's already set.

## What this does NOT include

Ruled out by prior decisions, so nothing to configure: no Cloudflare Access (workers.dev hostname), no custom domain, no KV/R2/Queues/Vectorize bindings, no `worker_loaders` (that's the Browser Sessions upgrade path, not MVP), no multi-environment `env.*` blocks (single personal deployment), no D1 read replicas.

## Sources

- Decisions driving this config: [#2 model + calling pattern](https://github.com/chiubaca/roshi/issues/2), [#3 conversation model and persistence](https://github.com/chiubaca/roshi/issues/3), [#5 web search tool](https://github.com/chiubaca/roshi/issues/5), [#6 Browser Run integration](https://github.com/chiubaca/roshi/issues/6), [#7 access control](https://github.com/chiubaca/roshi/issues/7)
- [Browser Run research (this repo)](./browser-rendering-integration.md) — binding shape, compat-date requirement, `remote: true` rationale, pricing
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) and installed `wrangler@4.110.0` `config-schema.json` — verified `browser`, `d1_databases`, `durable_objects`, `migrations`, `observability` field shapes
- [Durable Objects configuration](https://developers.cloudflare.com/durable-objects/reference/wrangler-configuration/) — migration tags, `new_sqlite_classes`, never edit old migrations, auto-apply on deploy
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) — `migrations create/apply`, `migrations_dir`, separate from deploy
- [Compatibility dates](https://developers.cloudflare.com/workers/configuration/compatibility-dates/) — set to current date, test after bumping
- [Agents SDK configuration](https://developers.cloudflare.com/agents/api-reference/configuration/) — every agent class needs a DO binding + `new_sqlite_classes` entry; `nodejs_compat` required
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — `wrangler secret put`, `.dev.vars` for local
