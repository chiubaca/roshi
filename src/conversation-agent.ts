import { AIChatAgent } from "@cloudflare/ai-chat";
import { createQuickActionTools } from "agents/browser/ai";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { SearchResponse } from "./conversation";
import { recordConversationActivity } from "./conversation-index";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const MAX_SEARCH_RESULTS = 5;

type SearchFetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function searchWeb(
  query: string,
  maxResults: number,
  apiKey: string,
  abortSignal?: AbortSignal,
  fetcher: SearchFetch = fetch,
): Promise<SearchResponse> {
  const response = await fetcher(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: Math.min(maxResults, MAX_SEARCH_RESULTS),
    }),
    signal: abortSignal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = (await response.json()) as {
    results?: { title?: unknown; url?: unknown; content?: unknown }[];
  };
  return {
    results: (payload.results ?? []).slice(0, MAX_SEARCH_RESULTS).flatMap((result) =>
      typeof result.title === "string" && typeof result.url === "string"
        ? [
            {
              title: result.title,
              url: result.url,
              snippet: typeof result.content === "string" ? result.content : "",
            },
          ]
        : [],
    ),
  };
}

export function createWebSearchTools(apiKey: string, fetcher?: SearchFetch) {
  return {
    webSearch: tool({
      description: "Search the web for current information. Cite sources inline in Markdown.",
      inputSchema: z.object({
        query: z.string().min(1).describe("The web search query"),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_RESULTS)
          .describe("Maximum number of results"),
      }),
      execute: async ({ query, maxResults }, { abortSignal }) => {
        try {
          return await searchWeb(query, maxResults, apiKey, abortSignal, fetcher);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown error";
          return { error: `Web search is temporarily unavailable (${detail}).` };
        }
      },
    }),
  };
}

function browserToolResult(result: string): Response {
  return new Response(JSON.stringify({ success: true, result }), {
    headers: { "Content-Type": "application/json" },
  });
}

export function createBrowserTools(browserBinding: BrowserRun) {
  const browser = {
    quickAction: async (...args: Parameters<BrowserRun["quickAction"]>) => {
      try {
        const response = await browserBinding.quickAction(...args);
        if (response.ok) {
          try {
            const payload = (await response.clone().json()) as {
              success?: boolean;
              result?: unknown;
            };
            if (payload.success !== false && payload.result !== undefined) return response;
            return browserToolResult("Browser Run could not complete this request.");
          } catch {
            return browserToolResult("Browser Run returned an invalid response.");
          }
        }

        const retryAfter = response.headers.get("Retry-After");
        const retry = retryAfter ? ` Retry after ${retryAfter} seconds.` : "";
        return browserToolResult(
          `Browser Run could not complete this request (HTTP ${response.status}).${retry}`,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
        return browserToolResult(`Browser Run could not complete this request: ${detail}`);
      }
    },
  } as BrowserRun;

  return createQuickActionTools({ browser, maxChars: 50_000 });
}

export class ConversationAgent extends AIChatAgent<Env> {
  async destroyConversation(): Promise<void> {
    await this.destroy();
  }

  async onChatMessage() {
    const firstUserMessage = this.messages.find((message) => message.role === "user");
    await recordConversationActivity(
      this.env.DB,
      this.name,
      firstUserMessage ? messageText(firstUserMessage.parts) : undefined,
    );

    const workersai = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system:
        "You are Roshi, a helpful AI assistant. When you use web search, cite its sources inline with Markdown links.",
      messages: await convertToModelMessages(this.messages),
      tools: {
        ...createBrowserTools(this.env.BROWSER),
        ...createWebSearchTools(this.env.TAVILY_API_KEY),
      },
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  }
}

function messageText(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}
