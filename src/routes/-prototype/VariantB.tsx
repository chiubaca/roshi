// PROTOTYPE (roshi#4) — throwaway. Variant B "Voice hero + drawer": today's
// voice-first page stays the hero (centered mic, serif overlay). The
// conversation list hides in a slide-in drawer (hamburger, top-left); text chat
// is a "type instead" pill that expands into a bottom composer. Thread renders
// in the same serif overlay the transcript uses today.
import { useVoiceInput } from "@cloudflare/voice/react";
import { PulsingBorder } from "@paper-design/shaders-react";
import { useEffect, useRef, useState } from "react";
import { stubConversations, stubMessages, type StubMessage } from "./data";
import { glassDark, glassPanel, pillButton, SERIF, textShadow, dimText } from "./glass";
import { ShaderBackdrop } from "./ShaderBackdrop";

const PULSE_DEFAULT = ["#5aa9e6", "#4a9ad9", "#6ab7ff", "#3d8bc6"];
const PULSE_LISTENING = ["#f7b267", "#f5a142", "#f4a261", "#e38b2a"];

export function VariantB() {
  const voice = useVoiceInput({ agent: "VoiceAgent", name: "demo" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeId, setActiveId] = useState(stubConversations[0].id);
  const [threads, setThreads] = useState<Record<string, StubMessage[]>>(stubMessages);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = threads[activeId] ?? [];
  const liveText =
    voice.transcript + (voice.interimTranscript ? ` ${voice.interimTranscript}` : "");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [threads, activeId, liveText]);

  const send = () => {
    const content = draft.trim();
    if (!content) return;
    setThreads((t) => ({
      ...t,
      [activeId]: [...(t[activeId] ?? []), { id: crypto.randomUUID(), role: "user", content }],
    }));
    setDraft("");
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

  const pickConversation = (id: string) => {
    setActiveId(id);
    setDrawerOpen(false);
    voice.clear();
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ShaderBackdrop isListening={voice.isListening} />

      {/* Thread overlay — same position/type as today's transcript overlay */}
      {(messages.length > 0 || liveText.trim()) && (
        <div
          ref={scrollRef}
          style={{
            position: "fixed",
            bottom: "6.5rem",
            left: "2rem",
            zIndex: 20,
            maxWidth: "min(600px, 50vw)",
            maxHeight: "55vh",
            overflowY: "auto",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 40px)",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 40px)",
          }}
        >
          <div
            style={{
              paddingTop: "2.5rem",
              paddingBottom: "0.75rem",
              paddingLeft: "1rem",
              paddingRight: "1rem",
              marginLeft: "-1rem",
              borderRadius: "0.75rem",
              background:
                "linear-gradient(to top, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.3) 70%, rgba(0, 0, 0, 0.1) 100%)",
            }}
          >
            {messages.map((m) => (
              <p key={m.id} style={overlayText}>
                <span style={{ color: dimText, fontStyle: "italic" }}>
                  {m.role === "user" ? "You — " : "Roshi — "}
                </span>
                {m.content}
              </p>
            ))}
            {liveText.trim() && (
              <p style={{ ...overlayText, fontStyle: "italic", color: dimText }}>
                You — {liveText}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Centered mic hero — unchanged from today's page */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-block",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "-0.75rem",
              zIndex: 0,
              overflow: "hidden",
              borderRadius: "50%",
            }}
          >
            <PulsingBorder
              width={120}
              height={120}
              colors={voice.isListening ? PULSE_LISTENING : PULSE_DEFAULT}
              colorBack="#00000000"
              roundness={0.5}
              thickness={0.15}
              softness={0.6}
              intensity={voice.isListening ? 0.6 : 0.3}
              bloom={voice.isListening ? 0.5 : 0.3}
              spots={3}
              spotSize={0.4}
              pulse={voice.isListening ? 0.8 : 0.4}
              smoke={0.2}
              smokeSize={0.5}
              speed={voice.isListening ? 1.5 : 0.8}
              scale={0.8}
            />
          </div>
          <button
            type="button"
            onClick={voice.isListening ? voice.stop : voice.start}
            style={{
              position: "relative",
              zIndex: 10,
              width: "5rem",
              height: "5rem",
              borderRadius: "50%",
              ...glassPanel,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {voice.isListening ? <StopIcon /> : <MicIcon />}
          </button>
        </div>
      </div>

      {/* Hamburger — opens the conversation drawer */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open conversations"
        style={{
          position: "fixed",
          top: "1rem",
          left: "1rem",
          zIndex: 30,
          ...pillButton,
          padding: "0.5rem 0.8rem",
        }}
      >
        ☰
      </button>

      {/* Conversation drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 300,
          zIndex: 50,
          ...glassDark,
          transform: drawerOpen ? "translateX(0)" : "translateX(-105%)",
          transition: "transform 250ms ease",
          display: "flex",
          flexDirection: "column",
          padding: "1rem 0.75rem",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#fff",
            fontFamily: SERIF,
            fontSize: "1.15rem",
            textShadow,
            padding: "0 0.25rem",
          }}
        >
          Conversations
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              fontSize: "1.1rem",
              cursor: "pointer",
              opacity: 0.7,
            }}
          >
            ✕
          </button>
        </div>
        <button
          type="button"
          style={{ ...pillButton, margin: "0.75rem 0.25rem" }}
          onClick={() => pickConversation(stubConversations[stubConversations.length - 1].id)}
        >
          + New conversation
        </button>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {stubConversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pickConversation(c.id)}
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
      </div>

      {/* "Type instead" pill → bottom composer. Bottom offset clears the switcher. */}
      <div
        style={{
          position: "fixed",
          bottom: "4.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 30,
          width: "min(560px, 90vw)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {composerOpen ? (
          <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
            <input
              className="proto-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
                if (e.key === "Escape") setComposerOpen(false);
              }}
              placeholder="Type a message… (Esc to close)"
              style={{
                flex: 1,
                padding: "0.7rem 1rem",
                borderRadius: "999px",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                background: "rgba(0, 0, 0, 0.5)",
                backdropFilter: "blur(8px)",
                color: "#fff",
                fontSize: "0.95rem",
                outline: "none",
              }}
            />
            <button type="button" onClick={send} style={pillButton}>
              Send
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            style={{ ...pillButton, opacity: 0.85 }}
          >
            ⌨ Type instead
          </button>
        )}
      </div>
    </div>
  );
}

const overlayText: React.CSSProperties = {
  margin: "0 0 0.75rem",
  fontFamily: SERIF,
  fontSize: "1.15rem",
  lineHeight: 1.6,
  color: "#ffffff",
  fontWeight: 500,
  textShadow,
  whiteSpace: "pre-wrap",
};

function MicIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
