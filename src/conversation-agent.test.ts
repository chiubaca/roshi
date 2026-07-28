import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vite-plus/test";

const COOKIE_NAME = "roshi_session";
const PASSWORD = "test-password";
const BASE_URL = "http://example.com";

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
  it("rejects unauthenticated chat page requests", async () => {
    const conversationId = ulid();
    const response = await exports.default.fetch(new Request(`${BASE_URL}/chat/${conversationId}`));

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('type="password"');
  });

  it("serves the chat page when authenticated", async () => {
    const conversationId = ulid();
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
    const conversationId = ulid();
    const response = await authenticatedFetch(`/agents/conversation-agent/${conversationId}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(response.status).toBe(101);
  });

  it.skip("routes two different conversation IDs to separate DO instances (requires live runtime)", async () => {
    const id1 = ulid();
    const id2 = "01K0VNFKJQZ1RWNJBXH7K4T3V8";

    const ws1 = await authenticatedFetch(`/agents/conversation-agent/${id1}`, {
      headers: { Upgrade: "websocket" },
    });
    const ws2 = await authenticatedFetch(`/agents/conversation-agent/${id2}`, {
      headers: { Upgrade: "websocket" },
    });

    expect(ws1.status).toBe(101);
    expect(ws2.status).toBe(101);
  });
});
