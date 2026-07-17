// PROTOTYPE (roshi#4) — throwaway stub data for the text chat + conversation list
// UI variants. No persistence; everything here is in-memory set dressing.
export type StubMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool?: string;
};

export type StubConversation = {
  id: string;
  name: string;
  updatedAt: string;
};

export const stubConversations: StubConversation[] = [
  {
    id: "01JZQ3W8E4A9X2M5N7P0R6T1V2",
    name: "Cloudflare Agents SDK questions",
    updatedAt: "2h ago",
  },
  {
    id: "01JZQ1K9B3C8D4E6F5G7H9J0K1",
    name: "Weekend trip to Osaka",
    updatedAt: "Yesterday",
  },
  {
    id: "01JPXY7M2N4B6V8C0Z3L5K7J9H",
    name: "D1 vs DO SQLite tradeoffs",
    updatedAt: "Tue",
  },
  {
    id: "01JPXW4T1R8S2Q6N0M9L4K3J7D",
    name: "New conversation",
    updatedAt: "Mon",
  },
];

export const stubMessages: Record<string, StubMessage[]> = {
  "01JZQ3W8E4A9X2M5N7P0R6T1V2": [
    {
      id: "m1",
      role: "user",
      content: "How do I add tool calling to an AIChatAgent?",
    },
    {
      id: "m2",
      role: "assistant",
      tool: 'web_search: "cloudflare agents sdk tools"',
      content:
        "Define tools with the AI SDK's `tool()` helper and pass them to `streamText`. The agent loop runs them server-side inside the Durable Object, so secrets stay on the worker.",
    },
    {
      id: "m3",
      role: "user",
      content: "And the results stream back over the same WebSocket?",
    },
    {
      id: "m4",
      role: "assistant",
      content:
        "Yes — the Agents SDK bridges the AI SDK stream to connected clients. Tool calls appear as message parts, so the UI can render them inline.",
    },
  ],
  "01JZQ1K9B3C8D4E6F5G7H9J0K1": [
    {
      id: "m1",
      role: "user",
      content: "What's a good 3-day itinerary for Osaka?",
    },
    {
      id: "m2",
      role: "assistant",
      tool: "browser_rendering: https://www.japan-guide.com/osaka",
      content:
        "Day 1: Dōtonbori and Namba. Day 2: Osaka Castle and the Umeda Sky Building. Day 3: day trip to Nara for the deer park and Tōdai-ji.",
    },
  ],
  "01JPXY7M2N4B6V8C0Z3L5K7J9H": [
    {
      id: "m1",
      role: "user",
      content: "Why D1 for the index but DO SQLite for messages?",
    },
    {
      id: "m2",
      role: "assistant",
      content:
        "D1 is queryable across the whole account, which suits a global list. Messages only ever belong to one conversation, so they stay local to that conversation's Durable Object — no network hop on the hot path.",
    },
  ],
  "01JPXW4T1R8S2Q6N0M9L4K3J7D": [],
};
