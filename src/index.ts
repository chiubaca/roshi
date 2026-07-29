import { Agent, routeAgentRequest, type Connection } from "agents";
import { withVoiceInput, WorkersAINova3STT } from "@cloudflare/voice";
import start from "@tanstack/react-start/server-entry";
import { handleExemptRoute, requireAuth } from "./auth";
import { ConversationAgent } from "./conversation-agent";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  restoreConversation,
} from "./conversation-index";

export { ConversationAgent };

type State = {
  transcript: string;
};

const VoiceInputAgent = withVoiceInput(Agent);

export class VoiceAgent extends VoiceInputAgent<Env, State> {
  initialState: State = { transcript: "" };

  transcriber = new WorkersAINova3STT(this.env.AI);

  async onTranscript(text: string, _connection: Connection) {
    const current = this.state.transcript;
    const next = current ? `${current} ${text}` : text;
    this.setState({ transcript: next });
  }
}

const startFetch = start.fetch as (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) => Response | Promise<Response>;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const exemptResponse = await handleExemptRoute(request, env.ROSHI_PASSWORD);
    if (exemptResponse) return exemptResponse;

    const authResponse = await requireAuth(request, env.ROSHI_PASSWORD);
    if (authResponse) return authResponse;

    const url = new URL(request.url);
    if (url.pathname === "/api/conversations") {
      if (request.method === "GET") {
        return Response.json(await listConversations(env.DB));
      }
      if (request.method === "POST") {
        return Response.json(await createConversation(env.DB), { status: 201 });
      }
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
    }

    const conversationMatch = /^\/api\/conversations\/([^/]+)$/.exec(url.pathname);
    if (conversationMatch) {
      const conversationId = conversationMatch[1];
      if (request.method === "PATCH") {
        const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        if (!name) return new Response("A conversation name is required", { status: 400 });

        const conversation = await renameConversation(env.DB, conversationId, name);
        return conversation
          ? Response.json(conversation)
          : new Response("Conversation not found", { status: 404 });
      }

      if (request.method === "DELETE") {
        const conversation = await getConversation(env.DB, conversationId);
        if (!conversation) {
          return new Response("Conversation not found", { status: 404 });
        }
        await deleteConversation(env.DB, conversationId);
        const stub = env.ConversationAgent.get(env.ConversationAgent.idFromName(conversationId));
        try {
          await stub.clearStorage();
        } catch (error) {
          await restoreConversation(env.DB, conversation);
          throw error;
        }
        return new Response(null, { status: 204 });
      }

      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "PATCH, DELETE" },
      });
    }

    const conversationAgentMatch = /^\/agents\/conversation-agent\/([^/]+)$/.exec(url.pathname);
    if (conversationAgentMatch && !(await getConversation(env.DB, conversationAgentMatch[1]))) {
      return new Response("Conversation not found", { status: 404 });
    }

    const chatMatch = /^\/chat\/([^/]+)$/.exec(url.pathname);
    if (chatMatch && !(await getConversation(env.DB, chatMatch[1]))) {
      return new Response("Conversation not found", { status: 404 });
    }

    // Cast to avoid a workers-types version mismatch between the request
    // shape expected by `agents` and the one provided by `ExportedHandler`.
    const agentResponse = await routeAgentRequest(request as Request, env);
    if (agentResponse) return agentResponse;

    return startFetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
