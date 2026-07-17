// PROTOTYPE (roshi#4) — throwaway. Variant C "Launcher + dialogue": the
// conversation list is a centered serif launcher (cmd-k/start-screen feel) that
// matches the decided `/` route shape; picking one slides into a dialogue-style
// thread (no bubbles — "You / Roshi" script typography). Voice lives as a
// pulsing mic inside the bottom composer.
import { useVoiceInput } from "@cloudflare/voice/react";
import { useEffect, useRef, useState } from "react";
import { stubConversations, stubMessages, type StubMessage } from "./data";
import { glassPanel, pillButton, SERIF, textShadow, dimText } from "./glass";
import { MicButton } from "./MicButton";
import { ShaderBackdrop } from "./ShaderBackdrop";

export function VariantC() {
  const voice = useVoiceInput({ agent: "VoiceAgent", name: "demo" });
  const [screen, setScreen] = useState<"launcher" | "chat">("launcher");
  const [activeId, setActiveId] = useState(stubConversations[0].id);
  const [threads, setThreads] = useState<Record<string, StubMessage[]>>(stubMessages);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (voice.transcript) setDraft(voice.transcript);
  }, [voice.transcript]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [threads, activeId, screen]);

  const messages = threads[activeId] ?? [];
  const active = stubConversations.find((c) => c.id === activeId);

  const openConversation = (id: string) => {
    setActiveId(id);
    setScreen("chat");
    voice.clear();
    setDraft("");
  };

  const send = () => {
    const content = draft.trim();
    if (!content) return;
    setThreads((t) => ({
      ...t,
      [activeId]: [...(t[activeId] ?? []), { id: crypto.randomUUID(), role: "user", content }],
    }));
    setDraft("");
    voice.clear();
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

      {/* Scrim: keeps white serif type legible on the light pastel shader */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(0, 0, 0, 0.38) 0%, rgba(0, 0, 0, 0.22) 60%, rgba(0, 0, 0, 0.12) 100%)",
        }}
      />

      {screen === "launcher" ? (
        /* Launcher: the decided `/` surface — New conversation + list */
        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              fontFamily: SERIF,
              fontSize: "2.2rem",
              color: "#fff",
              textShadow,
              marginBottom: "2rem",
            }}
          >
            Roshi
          </div>
          <div style={{ width: "min(480px, 92vw)" }}>
            <LauncherRow
              primary="+ New conversation"
              onClick={() => openConversation(stubConversations[stubConversations.length - 1].id)}
            />
            <div
              style={{
                height: 1,
                background: "rgba(255, 255, 255, 0.2)",
                margin: "0.9rem 0",
              }}
            />
            {stubConversations.map((c) => (
              <LauncherRow
                key={c.id}
                primary={c.name}
                secondary={c.updatedAt}
                onClick={() => openConversation(c.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        /* Chat: dialogue column + composer */
        <>
          <button
            type="button"
            onClick={() => setScreen("launcher")}
            style={{
              position: "fixed",
              top: "1rem",
              left: "1rem",
              zIndex: 30,
              ...pillButton,
              padding: "0.5rem 0.9rem",
            }}
          >
            ← Conversations
          </button>

          <div
            style={{
              position: "relative",
              zIndex: 1,
              height: "100%",
              overflowY: "auto",
            }}
            ref={scrollRef}
          >
            <div
              style={{
                maxWidth: 640,
                margin: "0 auto",
                padding: "4.5rem 1.5rem 10rem",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: "1.4rem",
                  color: "#fff",
                  textShadow,
                  marginBottom: "2rem",
                }}
              >
                {active?.name}
              </div>
              {messages.length === 0 && (
                <div
                  style={{
                    color: dimText,
                    fontFamily: SERIF,
                    fontStyle: "italic",
                    textShadow,
                  }}
                >
                  Say something, or type below…
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} style={{ marginBottom: "1.6rem" }}>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: dimText,
                      marginBottom: "0.3rem",
                    }}
                  >
                    {m.role === "user" ? "You" : "Roshi"}
                  </div>
                  {m.tool && (
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "rgba(255, 255, 255, 0.75)",
                        fontFamily: "ui-monospace, monospace",
                        marginBottom: "0.3rem",
                      }}
                    >
                      ⚙ {m.tool}
                    </div>
                  )}
                  <div
                    style={{
                      fontFamily: SERIF,
                      fontSize: "1.15rem",
                      lineHeight: 1.65,
                      color: "#fff",
                      textShadow,
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Composer — bottom offset clears the switcher */}
          <div
            style={{
              position: "fixed",
              bottom: "4.5rem",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
              width: "min(640px, 92vw)",
              display: "flex",
              gap: "0.6rem",
              alignItems: "center",
              padding: "0.5rem",
              borderRadius: "999px",
              ...glassPanel,
              boxSizing: "border-box",
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
                padding: "0.6rem 0.25rem",
                border: "none",
                background: "transparent",
                color: "#fff",
                fontSize: "0.95rem",
                outline: "none",
              }}
            />
            <button type="button" onClick={send} style={pillButton}>
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function LauncherRow({
  primary,
  secondary,
  onClick,
}: {
  primary: string;
  secondary?: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "1rem",
        width: "100%",
        textAlign: "left",
        padding: "0.7rem 1rem",
        marginBottom: "0.15rem",
        borderRadius: "0.75rem",
        border: "none",
        background: hover ? "rgba(255, 255, 255, 0.14)" : "transparent",
        backdropFilter: hover ? "blur(8px)" : "none",
        cursor: "pointer",
        color: "#fff",
      }}
    >
      <span
        style={{
          fontFamily: SERIF,
          fontSize: "1.15rem",
          textShadow,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {primary}
      </span>
      {secondary && (
        <span style={{ fontSize: "0.78rem", color: dimText, flexShrink: 0 }}>{secondary}</span>
      )}
    </button>
  );
}
