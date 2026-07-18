# Research: Cloudflare Browser Rendering (Browser Run) integration

Wayfinder ticket: [Research Cloudflare Browser Rendering integration](https://github.com/chiubaca/roshi/issues/6)
Map: [Roshi general-purpose AI assistant MVP](https://github.com/chiubaca/roshi/issues/1)
Verified against Cloudflare docs and `agents@0.17.3` on 2026-07-18.

> Note: Cloudflare has **renamed Browser Rendering to "Browser Run"** — docs now live under `/browser-run/`. The REST API paths still use `browser-rendering`. This doc uses "Browser Run".

## Recommendation (TL;DR)

**Use the Workers `browser` binding, never the REST API, from inside the Worker.** Add `createQuickActionTools()` from `agents/browser/ai` to the `streamText` tools map in the conversation agent — four model-friendly tools with one binding and zero new dependencies. Upgrade to the full CDP tool (`createBrowserTools`) only if multi-step interactive automation becomes a requirement.

## The ticket's questions, answered

1. **What API/bindings to use** → the `browser` binding (`env.BROWSER`) with `agents/browser/ai`'s `createQuickActionTools`. Binding over REST per Workers best practice: no API token, no extra network hop, usage just shows up on the account.
2. **How to launch/navigate/extract** → don't launch anything for the MVP; Quick Actions are one-shot and stateless. The model supplies a URL (plus selectors or a prompt), the tool returns Markdown / structured JSON / links / scraped elements.
3. **Sessions, errors, timeouts** → none to manage for one-shot actions (each request gets a fresh browser, torn down after). Errors surface as `429` (rate limit, respect `Retry-After`) or navigation timeouts; the tool wrapper should catch and return error text so the model can relay it. Long-lived sessions (Puppeteer, `keep_alive` ≤ 10 min, 60 s default idle timeout) are the upgrade path, not MVP.
4. **Tool interface for the LLM** → a ready-made AI SDK `ToolSet`: `{ browser_markdown, browser_extract, browser_links, browser_scrape }`, merged straight into `streamText({ tools })`. Results are auto-bounded to `maxChars` (default 50,000) to protect the context window.

## Integration options considered

| Option                                                                               | What it is                                                                                                                                                                | Verdict                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REST API** (`api.cloudflare.com/.../browser-rendering/{markdown,scrape,json,...}`) | Stateless HTTP endpoints, needs an API token with `Browser Rendering - Edit`                                                                                              | ❌ From inside our own Worker it's the "Cloudflare REST API from inside a Worker" anti-pattern — auth overhead + network hop for the same capability the binding provides in-process. Only use case here: fetching session recordings (needs account token) — not MVP. |
| **Quick Actions via binding** — `createQuickActionTools({ browser })`                | The same stateless endpoints (`/markdown`, `/json`, `/links`, `/scrape`, `/content`) wrapped as AI SDK tools by the Agents SDK                                            | ✅ **MVP pick.** Needs only `"browser": { "binding": "BROWSER" }` in wrangler. No Worker Loader, no Code Mode runtime, no session lifecycle.                                                                                                                           |
| **Browser Sessions — `@cloudflare/puppeteer` / `@cloudflare/playwright`**            | Full headless-Chrome control from the Worker (navigate, click, type, evaluate, multi-step)                                                                                | ⏳ Upgrade path. Needed only for interactive automation (login flows, clicking through pages). Adds session management (launch/close/reuse, `keep_alive`, idle timeouts) and billing complexity (concurrent browsers).                                                 |
| **Full agent CDP tool — `createBrowserTools({ ctx, browser, loader })`**             | Agents SDK durable Code Mode runtime; the model writes code that drives CDP against a live session (`browser_execute`), with durable pause/resume and session reuse modes | ⏳ Later, if ever. Requires `worker_loaders` binding, `CodemodeRuntime` export, durable session semantics. The Quick Action tools it includes are exactly the MVP set above.                                                                                           |

## What the model gets (MVP pick)

From `agents/browser/ai` (already present in installed `agents@0.17.3`):

```ts
import { createQuickActionTools } from "agents/browser/ai";

const browserTools = createQuickActionTools({ browser: this.env.BROWSER });
```

| Tool               | LLM-facing purpose                                                          |
| ------------------ | --------------------------------------------------------------------------- |
| `browser_markdown` | Read a page (or raw HTML) as Markdown — the default "go read this URL" tool |
| `browser_extract`  | Pull structured data out of a page with an AI prompt/schema                 |
| `browser_links`    | List links on a page                                                        |
| `browser_scrape`   | Extract specific elements by CSS selector                                   |

Options: `actions` (subset; raw `content`/HTML is opt-in since it's large), `maxChars` (bounds every result, default 50,000), `options` (host-supplied `cookies`, `authenticate`, `gotoOptions`, `viewport` — never exposed to the model).

### Fitting the streamText loop

Ticket #2 settled on `AIChatAgent` + `workers-ai-provider` + `streamText` (`@cf/zai-org/glm-4.7-flash`); ticket #3 settled one conversation per Durable Object. The browser tools drop into that shape directly:

```ts
import { AIChatAgent } from "@cloudflare/ai-chat";
import { createQuickActionTools } from "agents/browser/ai";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export class ConversationAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const browserTools = createQuickActionTools({ browser: this.env.BROWSER });

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      messages: await convertToModelMessages(this.messages),
      tools: { ...browserTools /*, webSearchTool */ },
      stopWhen: stepCountIs(10),
    });
    return result.toUIMessageStreamResponse();
  }
}
```

The loop: model emits a tool call with a URL → tool hits Browser Run → bounded Markdown/JSON comes back as the tool result → model summarizes into the streamed reply.

## Config changes required

```jsonc
// wrangler.jsonc
{
  "compatibility_date": "2026-03-24", // was "2025-07-01"; Quick Actions binding requires 2026-03-24+
  "browser": { "binding": "BROWSER", "remote": true },
  // "ai" binding already present
}
```

- `remote: true` on the binding is required for local `wrangler dev` (Quick Actions don't run locally; without it you get `The RPC receiver does not implement the method "quickAction"`). It has no effect in production.
- No new npm dependencies for the MVP path — `agents@0.17.3` already ships `agents/browser/ai` with `createQuickActionTools`, `createBrowserTools`, `createBrowserRuntime`, and `CodemodeRuntime`.
- Run `wrangler types` after adding the binding so `Env` includes `BROWSER`.
- Upgrade path only: add `worker_loaders` binding and export `CodemodeRuntime` from `agents/browser` for `browser_execute`.

## Costs and limits (verified 2026-07-18)

Billing unit is **browser hours** (shared across all methods); Browser Sessions additionally bill **concurrent browsers** (monthly average of daily peaks).

|                                     | Workers Free                                 | Workers Paid                                      |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| Browser hours                       | 10 min/day                                   | 10 h/month included, then **$0.09/hour**          |
| Concurrent browsers (Sessions only) | 3                                            | 10 included, then $2.00/browser (default cap 120) |
| New browser instances               | 1 per 20 s                                   | 1 per second                                      |
| Quick Actions rate                  | 1 req per 10 s                               | 10 req per second                                 |
| Browser inactivity timeout          | 60 s (extendable to 10 min via `keep_alive`) | same                                              |
| `/crawl`                            | 5 jobs/day, ≤100 pages                       | higher                                            |

For roshi's personal-use MVP, usage is one Quick Action per agent browse — a few seconds of browser time each — comfortably inside even the free tier's 10 min/day. The Paid plan's included 10 h/month makes cost a non-issue.

**Cost foot-gun:** unclosed sessions bill until the idle timeout (60 s, or up to 10 min with `keep_alive`). Irrelevant for stateless Quick Actions; mandatory `try/finally { browser.close() }` if Puppeteer sessions are ever added. Monitor via the dashboard **Browser Run** page or the `X-Browser-Ms-Used` response header on Quick Actions.

## Sessions, errors, and timeouts (the details)

- **MVP (Quick Actions):** stateless; no session handle, nothing to reuse, nothing to close. Each tool call is one fresh browser.
- **Timeout knobs:** Quick Actions accept `gotoOptions` (e.g. `waitUntil`, `timeout`) via host-supplied `options`. Use `waitUntil: "domcontentloaded"` for speed; `networkidle` only when a page needs it (slowest).
- **Errors to expect:** `429` rate limit (respect the `Retry-After` header); navigation timeouts; `429 Browser time limit exceeded for today` on the free tier. Tool `execute` should catch and return a short structured error string as the tool result rather than throwing — the model then tells the user what happened instead of the stream dying.
- **Guardrails for the LLM loop:** keep `maxChars` at/below default (50 k chars ≈ plenty); don't opt into raw `content`; `stopWhen: stepCountIs(10)` caps browse loops.
- **If sessions ever needed:** `puppeteer.launch(env.BROWSER, { keep_alive: 600000 })`, reuse via `puppeteer.connect(env.BROWSER, sessionId)`; the per-conversation DO (ticket #3) is the natural place to stash a `sessionId` per conversation. Cloudflare documents exactly this DO + browser pattern.

## Sources

- [Browser Run overview](https://developers.cloudflare.com/browser-run/) — rename, integration families
- [Quick Actions](https://developers.cloudflare.com/browser-run/quick-actions/) — endpoints, `env.BROWSER.quickAction()`, compat-date and remote-mode requirements
- [Agents SDK: Browser tools](https://developers.cloudflare.com/agents/tools/browser/) — `createBrowserTools` / `createQuickActionTools`, session modes, Live View
- [Browser Run limits](https://developers.cloudflare.com/browser-run/limits/) — free/paid limits, 429 handling, `keep_alive`
- [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/) — $0.09/browser-hour, concurrency billing
- Installed `agents@0.17.3` type definitions (`node_modules/agents/dist/browser/ai.d.ts`) — confirmed exports and option shapes
