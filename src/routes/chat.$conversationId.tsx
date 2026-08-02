import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useVoiceInput } from "@cloudflare/voice/react";
import { MeshGradient, PulsingBorder } from "@paper-design/shaders-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useAgent } from "agents/react";
import { interpolateLab } from "d3-interpolate";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { useAudioAnalyser } from "~/useAudioAnalyser";
import type { SearchResult } from "~/conversation";
import { useReducedMotion } from "~/useReducedMotion";

const DEFAULT_MESH_COLORS = ["#09181d", "#16333a", "#416765", "#9eb9ae"];
const LISTENING_COLORS = ["#1a100a", "#59341f", "#b76838", "#f2bc76"];
const PULSE_COLORS_DEFAULT = ["#8fcfbd", "#62a998", "#b4e6d8", "#4f8f81"];
const PULSE_COLORS_LISTENING = ["#f8c27d", "#ed9652", "#ffd49d", "#d87337"];

function searchResults(output: unknown): SearchResult[] {
  if (!output || typeof output !== "object" || !("results" in output)) return [];
  const results = (output as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((result) => {
    if (!result || typeof result !== "object") return [];
    const { title, url, snippet } = result as Partial<SearchResult>;
    return typeof title === "string" && typeof url === "string" && typeof snippet === "string"
      ? [{ title, url, snippet }]
      : [];
  });
}

export function SearchToolChip({ output }: { output: unknown }) {
  const results = searchResults(output);
  return (
    <details className="tool-card">
      <summary>
        Web search
        <span className="tool-count">{results.length} sources</span>
      </summary>
      {results.length > 0 && (
        <ul className="source-list">
          {results.map((result) => (
            <li key={result.url}>
              <a className="source-link" href={result.url} target="_blank" rel="noreferrer">
                <span className="source-title">{result.title}</span>
                <span className="source-snippet">{result.snippet}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function blendPalettes(from: string[], to: string[], amount: number): string[] {
  return from.map((color, index) => interpolateLab(color, to[index % to.length])(amount));
}

export const Route = createFileRoute("/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();
  return <ChatPanel key={conversationId} conversationId={conversationId} />;
}

function ChatPanel({ conversationId }: { conversationId: string }) {
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <main className="chat-page">
        <div className="ambient-backdrop" aria-hidden="true" />
        <div className="loading-conversation" role="status">
          <span className="spinner" aria-hidden="true" /> Loading conversation
        </div>
      </main>
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
  const agent = useAgent({ agent: "ConversationAgent", name: conversationId });
  const { messages, sendMessage, isStreaming } = useAgentChat({ agent });
  const {
    transcript,
    interimTranscript,
    isListening,
    error: voiceError,
    start: voiceStart,
    stop: voiceStop,
  } = useVoiceInput({ agent: "VoiceAgent", name: conversationId });
  const {
    start: startAnalyser,
    stop: stopAnalyser,
    analysis,
    permissionState,
  } = useAudioAnalyser();

  const reducedMotion = useReducedMotion();
  const [colorBlend, setColorBlend] = useState(0);
  const [isPinned, setIsPinned] = useState(true);
  const [voiceStarting, setVoiceStarting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const consumedTranscriptRef = useRef("");
  const inputRef = useRef(input);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pinnedRef = useRef(true);
  const colorBlendRef = useRef(0);

  useEffect(() => {
    colorBlendRef.current = colorBlend;
  }, [colorBlend]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && pinnedRef.current) element.scrollTop = element.scrollHeight;
  }, [messages, isStreaming, scrollRef]);

  useEffect(() => {
    if (reducedMotion) {
      setColorBlend(isListening ? 1 : 0);
      return;
    }

    let animationFrame = 0;
    let startTime: number | null = null;
    const startBlend = colorBlendRef.current;
    const targetBlend = isListening ? 1 : 0;
    const duration = isListening ? 440 : 680;
    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setColorBlend(startBlend + (targetBlend - startBlend) * eased);
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isListening, reducedMotion]);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    resizeTextarea();
    if (pinnedRef.current) {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    }
  }, [input, scrollRef]);

  useEffect(() => {
    if (!transcript) return;
    const previous = consumedTranscriptRef.current;
    const finalText = transcript.startsWith(previous)
      ? transcript.slice(previous.length).trim()
      : transcript;
    consumedTranscriptRef.current = transcript;
    if (!finalText) return;

    const nextInput = inputRef.current ? `${inputRef.current} ${finalText}` : finalText;
    inputRef.current = nextInput;
    setInput(nextInput);
  }, [setInput, transcript]);

  function resizeTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }

  function submitMessage() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setSubmissionError(null);
    void sendMessage({ text }).catch(() => {
      setSubmissionError("Message wasn’t sent. Check your connection and try again.");
      if (!inputRef.current) {
        inputRef.current = text;
        setInput(text);
      }
    });
    inputRef.current = "";
    setInput("");
    pinnedRef.current = true;
    setIsPinned(true);
    requestAnimationFrame(() => {
      resizeTextarea();
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitMessage();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitMessage();
    }
  }

  async function handleVoiceStart() {
    if (voiceStarting) return;
    setVoiceStarting(true);
    try {
      await voiceStart();
      await startAnalyser();
    } catch {
      voiceStop();
      stopAnalyser();
    } finally {
      setVoiceStarting(false);
    }
  }

  function handleVoiceStop() {
    voiceStop();
    stopAnalyser();
  }

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const pinned = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
    pinnedRef.current = pinned;
    setIsPinned(pinned);
  }

  function jumpToLatest() {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
    pinnedRef.current = true;
    setIsPinned(true);
  }

  function choosePrompt(prompt: string) {
    setInput(prompt);
    inputRef.current = prompt;
    requestAnimationFrame(() => {
      resizeTextarea();
      textareaRef.current?.focus();
    });
  }

  const shaderColors = blendPalettes(DEFAULT_MESH_COLORS, LISTENING_COLORS, colorBlend);
  const shaderDistortion = isListening
    ? Math.min(0.28 + analysis.overall * 0.62 + analysis.bass * 0.2, 0.7)
    : 0.24;
  const shaderSpeed = reducedMotion
    ? 0
    : isListening
      ? Math.min(0.24 + analysis.overall * 0.3, 0.52)
      : 0.14;
  const voiceErrorMessage =
    (voiceError ? "Voice is reconnecting. Text chat is still available." : null) ||
    (permissionState === "denied"
      ? "Microphone access is blocked. Allow access in your browser settings, then try again."
      : null);
  const voiceStatus = voiceStarting
    ? "Requesting microphone access…"
    : isListening
      ? interimTranscript
        ? `Listening: ${interimTranscript}`
        : "Listening… speak naturally"
      : isStreaming
        ? "Roshi is composing a response"
        : "Enter to send · Shift Enter for a new line";

  return (
    <main className="chat-page">
      <div className="ambient-backdrop" aria-hidden="true">
        <MeshGradient
          width="100vw"
          height="100vh"
          colors={shaderColors}
          distortion={shaderDistortion}
          swirl={0.72}
          grainMixer={0.12}
          grainOverlay={0.15}
          speed={shaderSpeed}
          scale={1.08}
          rotation={0}
        />
      </div>

      <header className="chat-header">
        <Link className="chat-back" to="/" aria-label="Back to conversations">
          <ArrowLeftIcon /> <span>Conversations</span>
        </Link>
        <span className="chat-brand">Roshi</span>
        <div className="chat-header-actions">
          {(isListening || isStreaming) && (
            <span
              className={`chat-status${isListening ? " listening" : ""}`}
              role="status"
              aria-label={isListening ? "Listening" : "Roshi is thinking"}
            >
              <i className="chat-status-dot" aria-hidden="true" />
              <span>{isListening ? "Listening" : "Thinking"}</span>
            </span>
          )}
          <form action="/logout" className="logout-form" method="post">
            <button className="logout-button" type="submit">
              Log out
            </button>
          </form>
        </div>
      </header>

      <section className="chat-main" aria-label="Conversation">
        <div
          className="message-log"
          ref={scrollRef}
          role="log"
          aria-label="Conversation messages"
          aria-busy={isStreaming}
          onScroll={handleScroll}
          tabIndex={0}
        >
          {messages.length === 0 ? (
            <EmptyConversation onChoosePrompt={choosePrompt} />
          ) : (
            <ol className="message-list">
              {messages.map((message) => (
                <li className={`message-item ${message.role}`} key={message.id}>
                  <article
                    className="message-article"
                    aria-label={message.role === "user" ? "You" : "Roshi"}
                  >
                    {message.role !== "user" && <div className="message-role">Roshi</div>}
                    <div className="message-body">
                      {message.parts?.map((part, index) => {
                        if (part.type === "text")
                          return <MessageMarkdown key={index} text={part.text} />;
                        if (part.type === "tool-webSearch") {
                          return <SearchToolChip key={index} output={part.output} />;
                        }
                        if (part.type.startsWith("tool-browser_")) {
                          const isActiveMessage = message.id === messages[messages.length - 1]?.id;
                          return isStreaming && isActiveMessage ? (
                            <span className="browser-tool" key={index}>
                              {formatBrowserTool(part.type)}
                            </span>
                          ) : null;
                        }
                        return null;
                      })}
                    </div>
                  </article>
                </li>
              ))}
              {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
                <li className="message-item assistant">
                  <article className="message-article" aria-label="Roshi is thinking">
                    <div className="message-role">Roshi</div>
                    <ThinkingIndicator />
                  </article>
                </li>
              )}
            </ol>
          )}
        </div>

        {!isPinned && (
          <button className="jump-latest" type="button" onClick={jumpToLatest}>
            Latest response ↓
          </button>
        )}
      </section>

      <div className="composer-wrap">
        <form className="composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="message-roshi">
            Message Roshi
          </label>
          <div className="composer-row">
            <div className="composer-field">
              <textarea
                ref={textareaRef}
                id="message-roshi"
                rows={1}
                enterKeyHint="send"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  requestAnimationFrame(resizeTextarea);
                }}
                onKeyDown={handleComposerKeyDown}
                placeholder={interimTranscript || "Message Roshi"}
                aria-describedby="composer-status"
              />
            </div>

            <div className="voice-button-wrap">
              {(isListening || voiceStarting) && (
                <div className="voice-pulse" aria-hidden="true">
                  <PulsingBorder
                    width={56}
                    height={56}
                    colors={isListening ? PULSE_COLORS_LISTENING : PULSE_COLORS_DEFAULT}
                    colorBack="#00000000"
                    roundness={0.5}
                    thickness={0.12}
                    softness={0.64}
                    intensity={isListening ? 0.62 : 0.25}
                    bloom={isListening ? 0.42 : 0.18}
                    spots={3}
                    spotSize={0.38}
                    pulse={reducedMotion ? 0 : isListening ? 0.65 : 0.2}
                    smoke={0.16}
                    smokeSize={0.45}
                    speed={reducedMotion ? 0 : isListening ? 1.25 : 0.45}
                    scale={0.8}
                  />
                </div>
              )}
              <button
                className={`voice-button${isListening ? " listening" : ""}`}
                type="button"
                aria-label={isListening ? "Stop listening" : "Start voice input"}
                title={isListening ? "Stop listening" : "Voice input"}
                onClick={isListening ? handleVoiceStop : () => void handleVoiceStart()}
                disabled={voiceStarting || (isStreaming && !isListening)}
              >
                {voiceStarting ? (
                  <span className="spinner" />
                ) : isListening ? (
                  <StopIcon />
                ) : (
                  <MicIcon />
                )}
              </button>
            </div>

            <button
              className="send-button"
              type="submit"
              aria-label="Send message"
              title="Send message"
              disabled={isStreaming || !input.trim()}
            >
              <SendIcon />
            </button>
          </div>

          <div className="composer-meta">
            <p
              className={`voice-status${voiceErrorMessage || submissionError ? " error" : ""}`}
              id="composer-status"
              role={voiceErrorMessage || submissionError ? "alert" : "status"}
            >
              {submissionError || voiceErrorMessage || voiceStatus}
            </p>
          </div>
        </form>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {isStreaming ? "Roshi is responding" : ""}
      </div>
    </main>
  );
}

function EmptyConversation({ onChoosePrompt }: { onChoosePrompt: (prompt: string) => void }) {
  const prompts = [
    "Research a current topic",
    "Help me think through a decision",
    "Summarize and explain an idea",
  ];
  return (
    <div className="empty-conversation">
      <div className="empty-orbit" aria-hidden="true">
        <SparkIcon />
      </div>
      <h1>What are we working through?</h1>
      <p>
        Ask in text or speak. Roshi can search and read the web when current information matters.
      </p>
      <div className="prompt-list" aria-label="Prompt suggestions">
        {prompts.map((prompt) => (
          <button
            className="prompt-button"
            type="button"
            key={prompt}
            onClick={() => onChoosePrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="thinking" role="status" aria-label="Roshi is thinking">
      <span />
      <span />
      <span />
    </div>
  );
}

export function MessageMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node: _node, ...props }) => (
          <a className="citation-link" target="_blank" rel="noreferrer" {...props} />
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function formatBrowserTool(type: string): string {
  const labels: Record<string, string> = {
    "tool-browser_markdown": "Read a web page",
    "tool-browser_links": "Reviewed page links",
    "tool-browser_extract": "Extracted page details",
    "tool-browser_scrape": "Inspected a web page",
  };
  return labels[type] ?? "Reviewed a web page";
}

function SvgIcon({ children, size = 18 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <SvgIcon>
      <path
        d="m14.5 6-6 6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

function MicIcon() {
  return (
    <SvgIcon size={19}>
      <path
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M18.5 10.5V12a6.5 6.5 0 0 1-13 0v-1.5M12 18.5V22m-3 0h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function StopIcon() {
  return (
    <SvgIcon size={18}>
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
    </SvgIcon>
  );
}

function SendIcon() {
  return (
    <SvgIcon size={19}>
      <path
        d="M12 19V5m0 0-5 5m5-5 5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

function SparkIcon() {
  return (
    <SvgIcon size={22}>
      <path
        d="M12 3c.7 5 2 6.3 7 7-5 .7-6.3 2-7 7-.7-5-2-6.3-7-7 5-.7 6.3-2 7-7Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 16.5c.25 1.75.75 2.25 2.5 2.5-1.75.25-2.25.75-2.5 2.5-.25-1.75-.75-2.25-2.5-2.5 1.75-.25 2.25-.75 2.5-2.5Z"
        fill="currentColor"
      />
    </SvgIcon>
  );
}
