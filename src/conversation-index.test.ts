/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { exports } from "cloudflare:workers";
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
});
