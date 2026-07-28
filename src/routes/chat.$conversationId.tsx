import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useVoiceInput } from "@cloudflare/voice/react";
import { MeshGradient, PulsingBorder } from "@paper-design/shaders-react";
import { createFileRoute } from "@tanstack/react-router";
import { interpolateLab } from "d3-interpolate";
import {
  useRef,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { useAudioAnalyser } from "~/useAudioAnalyser";

const DEFAULT_MESH_COLORS = ["#a2d2ff", "#bde0fe", "#8ecae6", "#caf0f8"];
const LISTENING_COLORS = ["#ffe8d6", "#ffd7ba", "#fec89a", "#f9c74f"];
const PULSE_COLORS_DEFAULT = ["#5aa9e6", "#4a9ad9", "#6ab7ff", "#3d8bc6"];
const PULSE_COLORS_LISTENING = ["#f7b267", "#f5a142", "#f4a261", "#e38b2a"];

function blendPalettes(from: string[], to: string[], t: number): string[] {
  return from.map((color, i) => interpolateLab(color, to[i % to.length])(t));
}

export const Route = createFileRoute("/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "#e2e8f0",
        fontFamily: '"Georgia", "Times New Roman", serif',
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{ position: "fixed", inset: 0, zIndex: -1, background: "rgba(15, 23, 42, 0.58)" }}
      />
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
  setInput: Dispatch<SetStateAction<string>>;
}) {
  const agent = useAgent({
    agent: "ConversationAgent",
    name: conversationId,
  });

  const { messages, sendMessage, isStreaming } = useAgentChat({
    agent,
  });
  const {
    transcript,
    interimTranscript,
    isListening,
    error: voiceError,
    start: voiceStart,
    stop: voiceStop,
  } = useVoiceInput({
    agent: "VoiceAgent",
    name: "demo",
  });
  const {
    start: startAnalyser,
    stop: stopAnalyser,
    analysis,
    permissionState,
  } = useAudioAnalyser();
  const [colorBlend, setColorBlend] = useState(0);
  const consumedTranscriptRef = useRef("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let rafId: number;
    let startTime: number | null = null;
    const startBlend = colorBlend;
    const targetBlend = isListening ? 1 : 0;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / 800, 1);
      setColorBlend(startBlend + (targetBlend - startBlend) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isListening]);

  useEffect(() => {
    if (!transcript) return;
    const previous = consumedTranscriptRef.current;
    const finalText = transcript.startsWith(previous)
      ? transcript.slice(previous.length).trim()
      : transcript;
    consumedTranscriptRef.current = transcript;
    if (finalText) setInput((current) => (current ? `${current} ${finalText}` : finalText));
  }, [setInput, transcript]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  }

  async function handleVoiceStart() {
    await startAnalyser();
    await voiceStart();
  }

  function handleVoiceStop() {
    voiceStop();
    stopAnalyser();
  }

  const shaderProps = useMemo(() => {
    const base = {
      colors: blendPalettes(DEFAULT_MESH_COLORS, LISTENING_COLORS, colorBlend),
      distortion: 0.3,
      speed: 0.6,
    };

    if (!isListening) return base;
    return {
      ...base,
      distortion: Math.min(base.distortion + analysis.overall * 0.9 + analysis.bass * 0.3, 1),
      speed: Math.min(base.speed + analysis.overall * 0.4 + analysis.mid * 0.2, 1.5),
    };
  }, [analysis, colorBlend, isListening]);

  const voiceErrorMessage =
    voiceError ||
    (permissionState === "denied"
      ? "Microphone access denied. Please allow permission and try again."
      : null);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: -2 }}>
        <MeshGradient
          width="100vw"
          height="100vh"
          colors={shaderProps.colors}
          distortion={shaderProps.distortion}
          swirl={0.9}
          grainMixer={0.2}
          grainOverlay={0.2}
          speed={shaderProps.speed}
          scale={1}
          rotation={0}
        />
      </div>
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
                if (part.type.startsWith("tool-browser_")) {
                  return (
                    <span
                      key={i}
                      style={{
                        display: "inline-flex",
                        margin: "0.1rem 0.35rem 0.1rem 0",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "999px",
                        background: "rgba(59, 130, 246, 0.18)",
                        color: "#93c5fd",
                        fontFamily: "system-ui, sans-serif",
                        fontSize: "0.75rem",
                      }}
                    >
                      {part.type.replace("tool-browser_", "Browser: ").replaceAll("_", " ")}
                    </span>
                  );
                }
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
            placeholder={interimTranscript || "Type a message…"}
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
          <div style={{ position: "relative", width: "3rem", height: "3rem", flex: "0 0 3rem" }}>
            <div
              style={{
                position: "absolute",
                inset: "-0.25rem",
                zIndex: 0,
                overflow: "hidden",
                borderRadius: "50%",
              }}
            >
              <PulsingBorder
                width={56}
                height={56}
                colors={isListening ? PULSE_COLORS_LISTENING : PULSE_COLORS_DEFAULT}
                colorBack="#00000000"
                roundness={0.5}
                thickness={0.15}
                softness={0.6}
                intensity={isListening ? 0.6 : 0.3}
                bloom={isListening ? 0.5 : 0.3}
                spots={3}
                spotSize={0.4}
                pulse={isListening ? 0.8 : 0.4}
                smoke={0.2}
                smokeSize={0.5}
                speed={isListening ? 1.5 : 0.8}
                scale={0.8}
              />
            </div>
            <button
              type="button"
              aria-label={isListening ? "Stop listening" : "Start listening"}
              onClick={isListening ? handleVoiceStop : handleVoiceStart}
              disabled={isStreaming && !isListening}
              style={{
                position: "relative",
                zIndex: 1,
                width: "3rem",
                height: "3rem",
                borderRadius: "50%",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                background: "rgba(0, 0, 0, 0.42)",
                backdropFilter: "blur(8px)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isStreaming && !isListening ? "not-allowed" : "pointer",
              }}
            >
              {isListening ? <StopIcon /> : <MicIcon />}
            </button>
          </div>
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
        {voiceErrorMessage && (
          <p
            style={{ margin: "0.75rem 0 0", color: "#fca5a5", fontFamily: "system-ui, sans-serif" }}
          >
            {voiceErrorMessage}
          </p>
        )}
      </form>
    </>
  );
}

function MicIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
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
      width={20}
      height={20}
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
