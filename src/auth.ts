const COOKIE_NAME = "roshi_session";
const SESSION_TOKEN = "roshi_authenticated";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const EXEMPT_ROUTES = ["/login", "/logout"];

function base64Encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64Decode(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function importSigningKey(password: string): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password);
  const keyBytes = await crypto.subtle.digest("SHA-256", passwordBytes);
  return crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(password: string): Promise<string> {
  const key = await importSigningKey(password);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SESSION_TOKEN));
  return `${SESSION_TOKEN}.${base64Encode(new Uint8Array(signature))}`;
}

export async function verifySession(cookieValue: string, password: string): Promise<boolean> {
  const separatorIndex = cookieValue.lastIndexOf(".");
  if (separatorIndex === -1) return false;

  const token = cookieValue.slice(0, separatorIndex);
  const signatureB64 = cookieValue.slice(separatorIndex + 1);
  if (token !== SESSION_TOKEN || !signatureB64) return false;

  const signature = base64Decode(signatureB64);
  if (!signature) return false;

  const key = await importSigningKey(password);
  return crypto.subtle.verify(
    "HMAC",
    key,
    signature.buffer as ArrayBuffer,
    new TextEncoder().encode(token),
  );
}

export async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [aDigest, bDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);

  const aBytes = new Uint8Array(aDigest);
  const bBytes = new Uint8Array(bDigest);
  if (aBytes.length !== bBytes.length) return false;

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

export function isExemptRoute(pathname: string): boolean {
  return EXEMPT_ROUTES.includes(pathname);
}

function setCookieHeader(value: string, maxAge: number): string {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function loginHtml(error?: string): string {
  const errorHtml = error ? `<p style="color:#fca5a5;margin-bottom:1rem;">${error}</p>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roshi — Sign in</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
    }
    form {
      width: min(320px, 90vw);
      padding: 2rem;
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.05);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    h1 { margin: 0 0 1.5rem; font-size: 1.5rem; }
    label { display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #94a3b8; }
    input[type="password"] {
      width: 100%;
      padding: 0.75rem;
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 0.5rem;
      background: rgba(0, 0, 0, 0.25);
      color: inherit;
      font-size: 1rem;
    }
    button {
      width: 100%;
      margin-top: 1.25rem;
      padding: 0.75rem;
      border: none;
      border-radius: 0.5rem;
      background: #3b82f6;
      color: white;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <form method="post" action="/login">
    <h1>Roshi</h1>
    ${errorHtml}
    <label for="password">Password</label>
    <input id="password" type="password" name="password" required autofocus>
    <button type="submit">Sign in</button>
  </form>
</body>
</html>`;
}

function loginResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function renderLoginForm(error?: string): Response {
  return loginResponse(loginHtml(error), 200);
}

export async function handleLogin(request: Request, password: string): Promise<Response> {
  const formData = await request.formData();
  const provided = formData.get("password");

  // Always run the timing-safe comparison so the code path is identical
  // regardless of whether the secret is configured. If no secret is set,
  // compare against an unpredictable value that can never be submitted.
  const expectedPassword = password || crypto.randomUUID();
  if (typeof provided !== "string" || !(await timingSafeCompare(provided, expectedPassword))) {
    return loginResponse(loginHtml("Invalid password."), 401);
  }

  const session = await signSession(password);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": setCookieHeader(session, MAX_AGE_SECONDS),
    },
  });
}

export function handleLogout(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login",
      "Set-Cookie": setCookieHeader("", 0),
    },
  });
}

export async function handleExemptRoute(
  request: Request,
  password: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isExemptRoute(url.pathname)) return null;

  if (url.pathname === "/login" && request.method === "POST") {
    return handleLogin(request, password);
  }
  if (url.pathname === "/logout" && request.method === "POST") {
    return handleLogout();
  }
  return renderLoginForm();
}

export async function requireAuth(request: Request, password: string): Promise<Response | null> {
  const cookie = request.headers.get("Cookie");
  const match = cookie?.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  const valid = match ? await verifySession(match[1], password) : false;

  if (valid) return null;

  const isWebSocketUpgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
  if (isWebSocketUpgrade) {
    return new Response("Unauthorized", { status: 401 });
  }
  return renderLoginForm();
}
