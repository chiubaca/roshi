import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll } from "vite-plus/test";
import migration from "../migrations/0001_conversations.sql?raw";

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    {
      name: "0001_conversations.sql",
      queries: migration
        .split(";")
        .map((query: string) => query.trim())
        .filter(Boolean),
    },
  ]);
});
