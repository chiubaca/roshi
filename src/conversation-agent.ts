import { AIChatAgent } from "@cloudflare/ai-chat";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, stepCountIs } from "ai";

export class ConversationAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: "You are Roshi, a helpful AI assistant.",
      messages: await convertToModelMessages(this.messages),
      tools: {},
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  }
}
