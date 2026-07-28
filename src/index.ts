import { Agent, routeAgentRequest, type Connection } from "agents";
import { withVoiceInput, WorkersAINova3STT } from "@cloudflare/voice";
import start from "@tanstack/react-start/server-entry";
import { handleExemptRoute, requireAuth } from "./auth";
import { ConversationAgent } from "./conversation-agent";
import { createConversation, listConversations } from "./conversation-index";

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
    }

    // Cast to avoid a workers-types version mismatch between the request
    // shape expected by `agents` and the one provided by `ExportedHandler`.
    const agentResponse = await routeAgentRequest(request as Request, env);
    if (agentResponse) return agentResponse;

    return startFetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
