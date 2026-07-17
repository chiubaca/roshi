// PROTOTYPE (roshi#4) — throwaway. Variant A "Sidebar": classic chat-app layout.
// Conversation list is a persistent left glass sidebar; the voice UI shrinks to a
// mic button inside the bottom composer, with the interim transcript streaming in
// as the input placeholder. Voice still works against the real VoiceAgent.
import { useVoiceInput } from "@cloudflare/voice/react";
import { useEffect, useRef, useState } from "react";
import { stubConversations, stubMessages, type StubMessage } from "./data";
import { glassPanel, pillButton, SERIF, textShadow, dimText } from "./glass";
import { MicButton } from "./MicButton";
import { ShaderBackdrop } from "./ShaderBackdrop";

export function VariantA() {
  const voice = useVoiceInput({ agent: "VoiceAgent", name: "demo" });
  const [activeId, setActiveId] = useState(stubConversations[0].id);
  const [threads, setThreads] = useState<Record<string, StubMessage[]>>(stubMessages);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Finalised voice turns land in the composer for editing before sending.
  useEffect(() => {
    if (voice.transcript) setDraft(voice.transcript);
  }, [voice.transcript]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [threads, activeId]);

  const messages = threads[activeId] ?? [];
  const active = stubConversations.find((c) => c.id === activeId);

  const send = () => {
    const content = draft.trim();
    if (!content) return;
    const userMessage: StubMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    setThreads((t) => ({ ...t, [activeId]: [...(t[activeId] ?? []), userMessage] }));
    setDraft("");
    voice.clear();
    // Stub assistant reply — stands in for the conversation DO's stream.
    setTimeout(() => {
      setThreads((t) => ({
        ...t,
        [activeId]: [
          ...(t[activeId] ?? []),
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              "Stub reply — the real answer would stream in from the conversation's Durable Object.",
          },
        ],
      }));
    }, 500);
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ShaderBackdrop isListening={voice.isListening} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Sidebar: conversation list */}
        <aside
          style={{
            width: 280,
            margin: "0.75rem",
            borderRadius: "1rem",
            ...glassPanel,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              padding: "1rem 1rem 0.25rem",
              color: "#fff",
              fontFamily: SERIF,
              fontSize: "1.3rem",
              textShadow,
            }}
          >
            Roshi
          </div>
          <button
            type="button"
            style={{ ...pillButton, margin: "0.6rem 1rem" }}
            onClick={() => setActiveId(stubConversations[stubConversations.length - 1].id)}
          >
            + New conversation
          </button>
          <div style={{ flex: 1, overflowY: "auto", padding: "0.25rem 0.5rem 0.75rem" }}>
            {stubConversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveId(c.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: c.id === activeId ? "rgba(255, 255, 255, 0.22)" : "transparent",
                  border: "none",
                  borderRadius: "0.6rem",
                  padding: "0.55rem 0.6rem",
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                <div
                  style={{
                    fontSize: "0.9rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.name}
                </div>
                <div style={{ fontSize: "0.72rem", color: dimText }}>{c.updatedAt}</div>
              </button>
            ))}
          </div>
        </aside>

        {/* Main: thread + composer */}
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            margin: "0.75rem 0.75rem 0.75rem 0",
            borderRadius: "1rem",
            ...glassPanel,
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <header
            style={{
              padding: "1rem 1.25rem",
              borderBottom: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#fff",
              fontFamily: SERIF,
              fontSize: "1.05rem",
              textShadow,
            }}
          >
            {active?.name}
          </header>

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  color: dimText,
                  fontFamily: SERIF,
                  fontStyle: "italic",
                }}
              >
                Say something, or type below…
              </div>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
          </div>

          {/* Composer: mic + text input + send. Bottom padding clears the switcher. */}
          <div
            style={{
              padding: "0.75rem 1rem 4.5rem",
              display: "flex",
              gap: "0.6rem",
              alignItems: "center",
            }}
          >
            <MicButton voice={voice} />
            <input
              className="proto-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={
                voice.isListening ? voice.interimTranscript || "Listening…" : "Type or speak…"
              }
              style={{
                flex: 1,
                padding: "0.7rem 1rem",
                borderRadius: "999px",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                background: "rgba(0, 0, 0, 0.45)",
                color: "#fff",
                fontSize: "0.95rem",
                outline: "none",
              }}
            />
            <button type="button" onClick={send} style={pillButton}>
              Send
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: StubMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "75%",
      }}
    >
      {message.tool && (
        <div
          style={{
            fontSize: "0.72rem",
            color: "rgba(255, 255, 255, 0.75)",
            marginBottom: "0.25rem",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          ⚙ {message.tool}
        </div>
      )}
      <div
        style={{
          ...glassPanel,
          borderRadius: "1rem",
          padding: "0.6rem 0.9rem",
          color: "#fff",
          fontFamily: isUser ? "inherit" : SERIF,
          fontSize: "0.95rem",
          lineHeight: 1.5,
        }}
      >
        {message.content}
      </div>
    </div>
  );
}
