import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useEffect, useState, type FormEvent } from "react";

export const Route = createFileRoute("/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: '"Georgia", "Times New Roman", serif',
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          width: "100%",
          margin: "0 auto",
          padding: "2rem 1rem",
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        <ChatPanel conversationId={conversationId} />
      </div>
    </div>
  );
}

function ChatPanel({ conversationId }: { conversationId: string }) {
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <p
        style={{
          textAlign: "center",
          color: "#64748b",
          fontStyle: "italic",
          marginTop: "4rem",
        }}
      >
        Loading…
      </p>
    );
  }

  return (
    <ChatInner
      conversationId={conversationId}
      scrollRef={scrollRef}
      input={input}
      setInput={setInput}
    />
  );
}

function ChatInner({
  conversationId,
  scrollRef,
  input,
  setInput,
}: {
  conversationId: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  input: string;
  setInput: (v: string) => void;
}) {
  const agent = useAgent({
    agent: "ConversationAgent",
    name: conversationId,
  });

  const { messages, sendMessage, isStreaming } = useAgentChat({
    agent,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", paddingBottom: "1rem" }}>
        {messages.length === 0 && (
          <p
            style={{
              textAlign: "center",
              color: "#64748b",
              fontStyle: "italic",
              marginTop: "4rem",
            }}
          >
            Start a conversation with Roshi…
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: "1.25rem" }}>
            <span
              style={{
                display: "block",
                fontFamily: "system-ui, sans-serif",
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontVariant: "small-caps",
                color: msg.role === "user" ? "#93c5fd" : "#86efac",
                marginBottom: "0.25rem",
              }}
            >
              {msg.role === "user" ? "You" : "Roshi"}
            </span>
            <div
              style={{
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.parts?.map((part, i) => {
                if (part.type === "text") return <span key={i}>{part.text}</span>;
                return null;
              })}
            </div>
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div style={{ marginBottom: "1.25rem" }}>
            <span
              style={{
                display: "block",
                fontFamily: "system-ui, sans-serif",
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontVariant: "small-caps",
                color: "#86efac",
                marginBottom: "0.25rem",
              }}
            >
              Roshi
            </span>
            <span style={{ color: "#64748b" }}>…</span>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          position: "sticky",
          bottom: 0,
          padding: "1rem",
          margin: "0 -1rem",
          background: "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "0.75rem 0.75rem 0 0",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            disabled={isStreaming}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              color: "#e2e8f0",
              fontSize: "1rem",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            style={{
              padding: "0.75rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              background: isStreaming || !input.trim() ? "#334155" : "#3b82f6",
              color: "#e2e8f0",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Send
          </button>
        </div>
      </form>
    </>
  );
}
