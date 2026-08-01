/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as ai from "ai";
import * as workersAIProvider from "workers-ai-provider";
import { createBrowserTools, createWebSearchTools } from "./conversation-agent";

const COOKIE_NAME = "roshi_session";
const PASSWORD = "test-password";
const BASE_URL = "http://example.com";

type Tool<Input> = {
  execute(input: Input, options: unknown): Promise<unknown>;
};

async function postLogin(password: string): Promise<Response> {
  return exports.default.fetch(
    new Request(`${BASE_URL}/login`, {
      method: "POST",
      body: new URLSearchParams({ password }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "manual",
    }),
  );
}

async function login(): Promise<string> {
  const response = await postLogin(PASSWORD);
  expect(response.status).toBe(302);
  const setCookie = response.headers.get("Set-Cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!;
}

function extractCookieValue(setCookie: string): string {
  const match = setCookie.match(new RegExp(`^${COOKIE_NAME}=([^;]+)`));
  expect(match).toBeTruthy();
  return match![1];
}

async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const setCookie = await login();
  const cookieValue = extractCookieValue(setCookie);
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${COOKIE_NAME}=${cookieValue}`);
  return exports.default.fetch(new Request(`${BASE_URL}${path}`, { ...init, headers }));
}

function ulid(): string {
  return "01K0VNFKJQZ1RWNJBXH7K4T3V7";
}

describe("ConversationAgent", () => {
  beforeEach(() => {
    stubModel();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubModel(reply = "") {
    const streamText = vi.spyOn(ai, "streamText");
    const createWorkersAI = vi.spyOn(workersAIProvider, "createWorkersAI");
    createWorkersAI.mockReturnValue((() => ({})) as never);
    streamText.mockReturnValue({
      toUIMessageStreamResponse: () => new Response(reply),
    } as never);
    return streamText;
  }

  it("rejects unauthenticated chat page requests", async () => {
    const conversationId = ulid();
    const response = await exports.default.fetch(new Request(`${BASE_URL}/chat/${conversationId}`));

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('type="password"');
  });

  it("serves the chat page when authenticated", async () => {
    const create = await authenticatedFetch("/api/conversations", { method: "POST" });
    const { id: conversationId } = (await create.json()) as { id: string };
    const response = await authenticatedFetch(`/chat/${conversationId}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const text = await response.text();
    expect(text).not.toContain('type="password"');
  });

  it("rejects unauthenticated WebSocket upgrades to ConversationAgent", async () => {
    const conversationId = ulid();
    const response = await exports.default.fetch(
      new Request(`${BASE_URL}/agents/conversation-agent/${conversationId}`, {
        headers: { Upgrade: "websocket" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("allows authenticated WebSocket upgrades to ConversationAgent", async () => {
    const create = await authenticatedFetch("/api/conversations", { method: "POST" });
    const { id: conversationId } = (await create.json()) as { id: string };
    const response = await authenticatedFetch(`/agents/conversation-agent/${conversationId}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(response.status).toBe(101);
  });

  it("titles the conversation from its first user message and records activity", async () => {
    const create = await authenticatedFetch("/api/conversations", { method: "POST" });
    const created = (await create.json()) as { id: string; updatedAt: string };
    const conversationId = created.id;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await authenticatedFetch("/api/conversations", { method: "POST" });
    const id = env.ConversationAgent.idFromName(conversationId);
    const stub = env.ConversationAgent.get(id);
    await runInDurableObject(stub, async (agent) => {
      const conversation = agent as import("./conversation-agent").ConversationAgent;
      conversation.messages = [
        {
          id: "message-1",
          role: "user",
          parts: [{ type: "text", text: "Plan the next release, please!" }],
        },
      ];
      await conversation.onChatMessage();
    });

    const list = await authenticatedFetch("/api/conversations");
    const conversations = (await list.json()) as { id: string; name: string; updatedAt: string }[];
    const updated = conversations.find((conversation) => conversation.id === conversationId);
    expect(conversations[0].id).toBe(conversationId);
    expect(updated).toMatchObject({
      id: conversationId,
      name: "Plan the next release, please",
      updatedAt: expect.any(String),
    });
    expect(updated!.updatedAt).not.toBe(created.updatedAt);
  });

  it("keeps the fallback title for a very short first message", async () => {
    const create = await authenticatedFetch("/api/conversations", { method: "POST" });
    const { id: conversationId } = (await create.json()) as { id: string };
    const stub = env.ConversationAgent.get(env.ConversationAgent.idFromName(conversationId));
    await runInDurableObject(stub, async (agent) => {
      const conversation = agent as import("./conversation-agent").ConversationAgent;
      conversation.messages = [
        { id: "message-1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      ];
      await conversation.onChatMessage();
    });

    const list = await authenticatedFetch("/api/conversations");
    const conversations = (await list.json()) as { id: string; name: string }[];
    expect(conversations.find((conversation) => conversation.id === conversationId)?.name).toBe(
      "New conversation",
    );
  });

  it("routes two different conversation IDs to separate DO instances", async () => {
    const first = await authenticatedFetch("/api/conversations", { method: "POST" });
    const second = await authenticatedFetch("/api/conversations", { method: "POST" });
    const { id: id1 } = (await first.json()) as { id: string };
    const { id: id2 } = (await second.json()) as { id: string };
    expect(id1).not.toBe(id2);
    expect(env.ConversationAgent.idFromName(id1).toString()).not.toBe(
      env.ConversationAgent.idFromName(id2).toString(),
    );

    const ws1 = await authenticatedFetch(`/agents/conversation-agent/${id1}`, {
      headers: { Upgrade: "websocket" },
    });
    const ws2 = await authenticatedFetch(`/agents/conversation-agent/${id2}`, {
      headers: { Upgrade: "websocket" },
    });

    expect(ws1.status).toBe(101);
    expect(ws2.status).toBe(101);
  });

  it("returns bounded Markdown from Browser Run to the model", async () => {
    const markdown = "a".repeat(50_100);
    vi.spyOn(env.BROWSER, "quickAction").mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: markdown })),
    );
    const tools = createBrowserTools(env.BROWSER);
    expect(tools).toMatchObject({
      browser_extract: expect.any(Object),
      browser_links: expect.any(Object),
      browser_scrape: expect.any(Object),
    });
    expect(tools).not.toHaveProperty("browser_content");
    const browserMarkdown = tools.browser_markdown as unknown as Tool<{ url: string }>;
    const result = (await browserMarkdown.execute(
      { url: "https://example.com/article" },
      {},
    )) as string;

    expect(result).toContain("[truncated 100 characters]");
    expect(result.length).toBeLessThan(50_100);
    expect(env.BROWSER.quickAction).toHaveBeenCalledWith("markdown", {
      url: "https://example.com/article",
    });
  });

  it("returns Browser Run errors to the model instead of terminating the stream", async () => {
    vi.spyOn(env.BROWSER, "quickAction").mockResolvedValue(
      new Response("rate limited", { status: 429, headers: { "Retry-After": "20" } }),
    );
    const tools = createBrowserTools(env.BROWSER);
    const browserMarkdown = tools.browser_markdown as unknown as Tool<{ url: string }>;
    const result = (await browserMarkdown.execute(
      { url: "https://example.com/article" },
      {},
    )) as string;

    expect(result).toContain("HTTP 429");
    expect(result).toContain("Retry after 20 seconds");
  });

  it("returns Browser Run exceptions to the model", async () => {
    vi.spyOn(env.BROWSER, "quickAction").mockRejectedValue(new Error("navigation timed out"));
    const tools = createBrowserTools(env.BROWSER);
    const browserMarkdown = tools.browser_markdown as unknown as Tool<{ url: string }>;
    const result = (await browserMarkdown.execute(
      { url: "https://example.com/article" },
      {},
    )) as string;

    expect(result).toContain("Browser Run could not complete this request");
    expect(result).toContain("navigation timed out");
  });

  it("returns unsuccessful Browser Run responses to the model", async () => {
    vi.spyOn(env.BROWSER, "quickAction").mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, errors: [{ message: "daily limit reached" }] }),
      ),
    );
    const tools = createBrowserTools(env.BROWSER);
    const browserMarkdown = tools.browser_markdown as unknown as Tool<{ url: string }>;
    const result = (await browserMarkdown.execute(
      { url: "https://example.com/article" },
      {},
    )) as string;

    expect(result).toContain("Browser Run could not complete this request");
  });

  it("routes link and extraction requests to their Browser Run actions", async () => {
    const quickAction = vi.spyOn(env.BROWSER, "quickAction");
    quickAction.mockImplementation(async () => {
      return new Response(JSON.stringify({ success: true, result: [] }));
    });
    const tools = createBrowserTools(env.BROWSER);
    const browserLinks = tools.browser_links as unknown as Tool<{ url: string }>;
    const browserExtract = tools.browser_extract as unknown as Tool<{
      url: string;
      prompt: string;
    }>;

    await browserLinks.execute({ url: "https://example.com/article" }, {});
    await browserExtract.execute(
      { url: "https://example.com/article", prompt: "List the author names" },
      {},
    );

    expect(quickAction).toHaveBeenNthCalledWith(1, "links", {
      url: "https://example.com/article",
    });
    expect(quickAction).toHaveBeenNthCalledWith(2, "json", {
      url: "https://example.com/article",
      prompt: "List the author names",
      response_format: undefined,
    });
  });

  it("returns compact Tavily results to the model", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        results: [
          {
            title: "Roshi release notes",
            url: "https://example.com/releases",
            content: "The current release is 1.2.3.",
            raw_content: "This page content must not reach the model.",
          },
        ],
      }),
    );
    const tools = createWebSearchTools("test-key", fetch);
    const webSearch = tools.webSearch as unknown as Tool<{
      query: string;
      maxResults: number;
    }>;

    const result = await webSearch.execute(
      { query: "latest Roshi release", maxResults: 5 },
      { abortSignal: AbortSignal.abort() },
    );

    expect(result).toEqual({
      results: [
        {
          title: "Roshi release notes",
          url: "https://example.com/releases",
          snippet: "The current release is 1.2.3.",
        },
      ],
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      api_key: "test-key",
      query: "latest Roshi release",
      max_results: 5,
    });
  });

  it("returns Tavily failures as a structured tool result", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    const tools = createWebSearchTools("test-key", fetch);
    const webSearch = tools.webSearch as unknown as Tool<{
      query: string;
      maxResults: number;
    }>;

    const result = await webSearch.execute({ query: "latest Roshi release", maxResults: 5 }, {});

    expect(result).toEqual({ error: "Web search is temporarily unavailable (HTTP 429)." });
  });

  it("passes web search results through the ConversationAgent tool boundary", async () => {
    const fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          results: [
            { title: "Release notes", url: "https://example.com/releases", content: "1.2.3" },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const streamText = stubModel();
    streamText.mockImplementation(
      (options) =>
        ({
          toUIMessageStreamResponse: async () => {
            const tools = options.tools as ReturnType<typeof createWebSearchTools>;
            const result = await (
              tools.webSearch as unknown as Tool<{ query: string; maxResults: number }>
            ).execute({ query: "latest release", maxResults: 5 }, {});
            expect(result).toEqual({
              results: [
                { title: "Release notes", url: "https://example.com/releases", snippet: "1.2.3" },
              ],
            });
            return new Response("[Release notes](https://example.com/releases)");
          },
        }) as never,
    );
    const conversationId = ulid();
    const stub = env.ConversationAgent.get(env.ConversationAgent.idFromName(conversationId));

    await runInDurableObject(stub, async (agent) => {
      const conversation = agent as import("./conversation-agent").ConversationAgent;
      conversation.messages = [
        { id: "message-1", role: "user", parts: [{ type: "text", text: "Latest release?" }] },
      ];
      const response = await conversation.onChatMessage();
      expect(await response.text()).toContain("[Release notes](https://example.com/releases)");
    });

    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps the ConversationAgent stream alive after a web search failure", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("rate limited", { status: 429 })));
    vi.stubGlobal("fetch", fetch);
    const streamText = stubModel();
    streamText.mockImplementation(
      (options) =>
        ({
          toUIMessageStreamResponse: async () => {
            const tools = options.tools as ReturnType<typeof createWebSearchTools>;
            const result = await (
              tools.webSearch as unknown as Tool<{ query: string; maxResults: number }>
            ).execute({ query: "latest release", maxResults: 5 }, {});
            expect(result).toEqual({ error: "Web search is temporarily unavailable (HTTP 429)." });
            return new Response("I couldn't search the web just now. Please try again shortly.");
          },
        }) as never,
    );
    const stub = env.ConversationAgent.get(env.ConversationAgent.idFromName(ulid()));

    await runInDurableObject(stub, async (agent) => {
      const conversation = agent as import("./conversation-agent").ConversationAgent;
      conversation.messages = [
        { id: "message-1", role: "user", parts: [{ type: "text", text: "Latest release?" }] },
      ];
      const response = await conversation.onChatMessage();
      expect(await response.text()).toContain("couldn't search the web");
    });

    expect(fetch).toHaveBeenCalledOnce();
  });
});
