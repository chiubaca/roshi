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

async function authenticatedRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const setCookie = await login();
  const cookieValue = extractCookieValue(setCookie);
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${COOKIE_NAME}=${cookieValue}`);
  return exports.default.fetch(new Request(`${BASE_URL}${path}`, { ...init, headers }));
}

describe("shared-password access gate", () => {
  it("renders the login form for unauthenticated HTTP requests", async () => {
    const response = await exports.default.fetch(new Request(`${BASE_URL}/`));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const text = await response.text();
    expect(text).toContain('type="password"');
  });

  it("exempts the login route from the gate", async () => {
    const response = await exports.default.fetch(new Request(`${BASE_URL}/login`));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const text = await response.text();
    expect(text).toContain('type="password"');
  });

  it("sets a long-lived signed cookie on correct password", async () => {
    const response = await postLogin(PASSWORD);

    expect(response.status).toBe(302);
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toMatch(/Max-Age=\d+/);
    const maxAge = Number(setCookie!.match(/Max-Age=(\d+)/)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(29 * 24 * 60 * 60);
    expect(maxAge).toBeLessThanOrEqual(31 * 24 * 60 * 60);
  });

  it("rejects wrong password", async () => {
    const response = await postLogin("wrong-password");

    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("passes authenticated requests through to the app", async () => {
    const response = await authenticatedRequest("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const text = await response.text();
    expect(text).not.toContain('type="password"');
  });

  it("rejects tampered session cookies", async () => {
    const setCookie = await login();
    const cookieValue = extractCookieValue(setCookie);
    const response = await exports.default.fetch(
      new Request(`${BASE_URL}/`, {
        headers: { Cookie: `${COOKIE_NAME}=${cookieValue}tampered` },
      }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('type="password"');
  });

  it("logs out by clearing the session cookie", async () => {
    const response = await exports.default.fetch(
      new Request(`${BASE_URL}/logout`, { method: "POST", redirect: "manual" }),
    );

    expect(response.status).toBe(302);
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("rejects unauthenticated WebSocket upgrades", async () => {
    const response = await exports.default.fetch(
      new Request(`${BASE_URL}/agents/voice-agent/demo`, {
        headers: { Upgrade: "websocket" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("allows authenticated WebSocket upgrades through the gate", async () => {
    const response = await authenticatedRequest("/agents/voice-agent/demo", {
      headers: { Upgrade: "websocket" },
    });

    expect(response.status).toBe(101);
  });
});
