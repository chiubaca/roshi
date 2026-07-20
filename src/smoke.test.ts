import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vite-plus/test";

describe("worker fetch boundary", () => {
  it("responds to a request through the default fetch export", async () => {
    const response = await exports.default.fetch(new Request("http://example.com/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
  });
});
