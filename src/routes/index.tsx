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
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  async function renameConversation(conversation: Conversation) {
    const name = window.prompt("Conversation name", conversation.name)?.trim();
    if (!name || updatingId) return;

    setUpdatingId(conversation.id);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Could not rename conversation");
      const renamed = (await response.json()) as Conversation;
      setConversations((current) =>
        current.map((item) => (item.id === renamed.id ? renamed : item)),
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteConversation(conversation: Conversation) {
    if (updatingId || !window.confirm(`Delete “${conversation.name}”? This cannot be undone.`)) {
      return;
    }

    setUpdatingId(conversation.id);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete conversation");
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
    } finally {
      setUpdatingId(null);
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
            <div key={conversation.id} style={conversationRowStyle}>
              <button
                type="button"
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
              <div style={actionStyle}>
                <button
                  type="button"
                  aria-label={`Rename ${conversation.name}`}
                  disabled={updatingId !== null}
                  onClick={() => void renameConversation(conversation)}
                  style={actionButtonStyle}
                >
                  Rename
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${conversation.name}`}
                  disabled={updatingId !== null}
                  onClick={() => void deleteConversation(conversation)}
                  style={deleteButtonStyle}
                >
                  Delete
                </button>
              </div>
            </div>
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

const conversationRowStyle: React.CSSProperties = {
  alignItems: "center",
  borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
  display: "flex",
};

const conversationStyle: React.CSSProperties = {
  ...baseRowStyle,
  borderBottom: 0,
  flex: 1,
  minWidth: 0,
};

const actionStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.35rem",
  paddingRight: "1rem",
};

const actionButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  borderRadius: "0.35rem",
  color: "#f5f1e8",
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
  fontSize: "0.75rem",
  padding: "0.35rem 0.5rem",
};

const deleteButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  borderColor: "rgba(252, 165, 165, 0.55)",
  color: "#fca5a5",
};

const timeStyle: React.CSSProperties = {
  color: "rgba(245, 241, 232, 0.58)",
  fontSize: "0.8rem",
  marginLeft: "1rem",
  whiteSpace: "nowrap",
};
