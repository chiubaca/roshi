// ROSHI_PASSWORD is provided as a secret (via `wrangler secret put` in production
// and `.dev.vars` locally). It is intentionally not declared in `wrangler.jsonc`
// so the value never lives in committed configuration.
declare interface Env {
  ROSHI_PASSWORD: string;
  TAVILY_API_KEY: string;
}
