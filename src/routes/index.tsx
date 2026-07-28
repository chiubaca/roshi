import { MeshGradient } from "@paper-design/shaders-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type Conversation = {
  id: string;
  name: string;
  updatedAt: string;
};

export const Route = createFileRoute("/")({
  component: Launcher,
});

function Launcher() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void fetch("/api/conversations")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load conversations");
        return (await response.json()) as Conversation[];
      })
      .then(setConversations)
      .catch(() => setConversations([]));
  }, []);

  async function createConversation() {
    if (creating) return;
    setCreating(true);
    try {
      const response = await fetch("/api/conversations", { method: "POST" });
      if (!response.ok) throw new Error("Could not create conversation");
      const conversation = (await response.json()) as Conversation;
      await navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
    } finally {
      setCreating(false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={shaderStyle}>
        <MeshGradient
          width="100vw"
          height="100vh"
          colors={["#273a54", "#1a2638", "#403447", "#172536"]}
          distortion={0.35}
          swirl={0.8}
          grainMixer={0.15}
          grainOverlay={0.2}
          speed={0.3}
          scale={1.1}
          rotation={0}
        />
      </div>
      <div style={scrimStyle} />
      <section style={launcherStyle}>
        <h1 style={titleStyle}>Roshi</h1>
        <div style={listStyle}>
          <button
            type="button"
            onClick={createConversation}
            disabled={creating}
            style={newConversationStyle}
          >
            {creating ? "Creating..." : "+ New conversation"}
          </button>
          {conversations.map((conversation) => (
            <button
              type="button"
              key={conversation.id}
              onClick={() =>
                navigate({
                  to: "/chat/$conversationId",
                  params: { conversationId: conversation.id },
                })
              }
              style={conversationStyle}
            >
              <span>{conversation.name}</span>
              <time dateTime={conversation.updatedAt} style={timeStyle}>
                {relativeTime(conversation.updatedAt)}
              </time>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function relativeTime(timestamp: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1_000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const pageStyle: React.CSSProperties = {
  alignItems: "center",
  background: "#111722",
  color: "#f5f1e8",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  minHeight: "100vh",
  overflow: "hidden",
  padding: "1.5rem",
  position: "fixed",
};

const shaderStyle: React.CSSProperties = { inset: 0, position: "absolute" };

const scrimStyle: React.CSSProperties = {
  background:
    "radial-gradient(circle at center, rgba(8, 12, 18, 0.18) 0%, rgba(8, 12, 18, 0.7) 72%, rgba(8, 12, 18, 0.88) 100%)",
  inset: 0,
  position: "absolute",
};

const launcherStyle: React.CSSProperties = {
  maxWidth: "38rem",
  position: "relative",
  width: "100%",
  zIndex: 1,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "clamp(3.5rem, 12vw, 7rem)",
  fontWeight: 400,
  letterSpacing: "-0.06em",
  lineHeight: 0.9,
  margin: "0 0 2.5rem",
  textAlign: "center",
  textShadow: "0 4px 36px rgba(0, 0, 0, 0.65)",
};

const listStyle: React.CSSProperties = {
  backdropFilter: "blur(18px)",
  background: "rgba(10, 14, 21, 0.62)",
  border: "1px solid rgba(255, 255, 255, 0.16)",
  borderRadius: "1rem",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.38)",
  overflow: "hidden",
};

const baseRowStyle: React.CSSProperties = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
  color: "#f5f1e8",
  cursor: "pointer",
  display: "flex",
  fontFamily: "system-ui, sans-serif",
  fontSize: "1rem",
  justifyContent: "space-between",
  padding: "1.1rem 1.25rem",
  textAlign: "left",
  width: "100%",
};

const newConversationStyle: React.CSSProperties = {
  ...baseRowStyle,
  background: "rgba(255, 255, 255, 0.1)",
  fontWeight: 650,
};

const conversationStyle: React.CSSProperties = baseRowStyle;

const timeStyle: React.CSSProperties = {
  color: "rgba(245, 241, 232, 0.58)",
  fontSize: "0.8rem",
  marginLeft: "1rem",
  whiteSpace: "nowrap",
};
