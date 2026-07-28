import { AIChatAgent } from "@cloudflare/ai-chat";
import { createQuickActionTools } from "agents/browser/ai";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, stepCountIs } from "ai";

function browserToolResult(result: string): Response {
  return new Response(JSON.stringify({ success: true, result }), {
    headers: { "Content-Type": "application/json" },
  });
}

export class ConversationAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const browser = {
      quickAction: async (...args: Parameters<BrowserRun["quickAction"]>) => {
        try {
          const response = await this.env.BROWSER.quickAction(...args);
          if (response.ok) return response;

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

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: "You are Roshi, a helpful AI assistant.",
      messages: await convertToModelMessages(this.messages),
      tools: createQuickActionTools({ browser, maxChars: 50_000 }),
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  }
}
