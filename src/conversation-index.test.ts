/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vite-plus/test";

const BASE_URL = "http://example.com";
const COOKIE_NAME = "roshi_session";

async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const login = await exports.default.fetch(
    new Request(`${BASE_URL}/login`, {
      method: "POST",
      body: new URLSearchParams({ password: "test-password" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "manual",
    }),
  );
  const setCookie = login.headers.get("Set-Cookie");
  expect(setCookie).toBeTruthy();
  const cookieValue = setCookie!.match(new RegExp(`^${COOKIE_NAME}=([^;]+)`))?.[1];
  expect(cookieValue).toBeTruthy();

  const headers = new Headers(init.headers);
  headers.set("Cookie", `${COOKIE_NAME}=${cookieValue}`);
  return exports.default.fetch(new Request(`${BASE_URL}${path}`, { ...init, headers }));
}

describe("conversation index Worker boundary", () => {
  it("serves the Roshi launcher with a new-conversation action", async () => {
    const response = await authenticatedFetch("/");

    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain("Roshi");
    expect(page).toContain("New conversation");
  });

  it("creates and lists a new conversation through local D1", async () => {
    const create = await authenticatedFetch("/api/conversations", { method: "POST" });

    expect(create.status).toBe(201);
    const conversation = (await create.json()) as { id: string; name: string; updatedAt: string };
    expect(conversation.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(conversation.name).toBe("New conversation");

    const list = await authenticatedFetch("/api/conversations");

    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([conversation]);

    await new Promise((resolve) => setTimeout(resolve, 2));
    const newerCreate = await authenticatedFetch("/api/conversations", { method: "POST" });
    const newerConversation = (await newerCreate.json()) as { id: string };
    const reorderedList = await authenticatedFetch("/api/conversations");
    const reorderedConversations = (await reorderedList.json()) as { id: string }[];

    expect(reorderedConversations.map(({ id }) => id)).toEqual([
      newerConversation.id,
      conversation.id,
    ]);
  });

  it("applies the conversations migration with its activity index", async () => {
    const indexes = await env.DB.prepare("PRAGMA index_list('conversations')").all<{
      name: string;
    }>();

    expect(indexes.results).toContainEqual(
      expect.objectContaining({ name: "conversations_updated_at" }),
    );
  });

  it("renames a conversation through the Worker and persists the new name", async () => {
    const create = await authenticatedFetch("/api/conversations", { method: "POST" });
    const conversation = (await create.json()) as { id: string; name: string };

    const rename = await authenticatedFetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Release planning" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(rename.status).toBe(200);
    expect(await rename.json()).toMatchObject({
      id: conversation.id,
      name: "Release planning",
    });
    const renamedRow = await env.DB.prepare("SELECT name FROM conversations WHERE id = ?")
      .bind(conversation.id)
      .first<{ name: string }>();
    expect(renamedRow).toEqual({ name: "Release planning" });

    const list = await authenticatedFetch("/api/conversations");
    const conversations = (await list.json()) as { id: string; name: string }[];
    expect(conversations).toContainEqual(
      expect.objectContaining({ id: conversation.id, name: "Release planning" }),
    );
  });

  it("hard deletes the index row and Durable Object messages through the Worker", async () => {
    const create = await authenticatedFetch("/api/conversations", { method: "POST" });
    const { id: conversationId } = (await create.json()) as { id: string };
    const stub = env.ConversationAgent.get(env.ConversationAgent.idFromName(conversationId));
    await runInDurableObject(stub, async (agent) => {
      const conversation = agent as import("./conversation-agent").ConversationAgent;
      await conversation.persistMessages([
        { id: "message-1", role: "user", parts: [{ type: "text", text: "Keep this secret" }] },
      ]);
    });

    const remove = await authenticatedFetch(`/api/conversations/${conversationId}`, {
      method: "DELETE",
    });

    expect(remove.status).toBe(204);
    const deletedRow = await env.DB.prepare("SELECT id FROM conversations WHERE id = ?")
      .bind(conversationId)
      .first<{ id: string }>();
    expect(deletedRow).toBeNull();
    const list = await authenticatedFetch("/api/conversations");
    const conversations = (await list.json()) as { id: string }[];
    expect(conversations).not.toContainEqual(expect.objectContaining({ id: conversationId }));
    const chat = await authenticatedFetch(`/chat/${conversationId}`);
    expect(chat.status).toBe(404);
    const agent = await authenticatedFetch(`/agents/conversation-agent/${conversationId}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(agent.status).toBe(404);
    await expect(runInDurableObject(stub, async () => undefined)).rejects.toThrow("destroyed");
  });
});
