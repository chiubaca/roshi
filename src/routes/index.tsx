import { MeshGradient } from "@paper-design/shaders-react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useReducedMotion } from "~/useReducedMotion";

type Conversation = {
  id: string;
  name: string;
  updatedAt: string;
};

type RowMode = { id: string; mode: "actions" | "rename" | "delete" } | null;

export const Route = createFileRoute("/")({
  component: Launcher,
});

function Launcher() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [creating, setCreating] = useState(false);
  const [rowMode, setRowMode] = useState<RowMode>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const renameInputRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();

  const loadConversations = useCallback(async () => {
    setLoadState("loading");
    setNotice(null);
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) throw new Error("Could not load conversations");
      setConversations((await response.json()) as Conversation[]);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (rowMode?.mode === "rename") {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [rowMode]);

  useEffect(() => {
    if (rowMode?.mode !== "actions") return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".conversation-actions, .conversation-menu")
      ) {
        setRowMode(null);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setRowMode(null);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [rowMode]);

  async function createConversation() {
    if (creating) return;
    setCreating(true);
    setNotice(null);
    setAnnouncement("Creating conversation");
    try {
      const response = await fetch("/api/conversations", { method: "POST" });
      if (!response.ok) throw new Error("Could not create conversation");
      const conversation = (await response.json()) as Conversation;
      await navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
    } catch {
      setNotice("Couldn’t create a conversation. Please try again.");
      setAnnouncement("Conversation could not be created");
    } finally {
      setCreating(false);
    }
  }

  function beginRename(conversation: Conversation) {
    setDraftName(conversation.name);
    setNotice(null);
    setRowMode({ id: conversation.id, mode: "rename" });
  }

  async function renameConversation(event: FormEvent, conversation: Conversation) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      setNotice("A conversation name is required.");
      return;
    }
    if (name === conversation.name) {
      setRowMode(null);
      return;
    }

    setBusyId(conversation.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Could not rename conversation");
      const renamed = (await response.json()) as Conversation;
      setConversations((current) =>
        current
          .map((item) => (item.id === renamed.id ? renamed : item))
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      );
      setRowMode(null);
      setAnnouncement(`Conversation renamed to ${renamed.name}`);
    } catch {
      setNotice("Couldn’t rename this conversation. Your draft has been kept.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteConversation(conversation: Conversation) {
    if (busyId) return;
    setBusyId(conversation.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete conversation");
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      setRowMode(null);
      setAnnouncement(`${conversation.name} deleted`);
    } catch {
      setNotice("Couldn’t delete this conversation. Nothing was removed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="launcher-page">
      <div className="ambient-backdrop" aria-hidden="true">
        <MeshGradient
          width="100vw"
          height="100vh"
          colors={["#0b171c", "#153137", "#385654", "#88716d"]}
          distortion={0.27}
          swirl={0.68}
          grainMixer={0.12}
          grainOverlay={0.16}
          speed={reducedMotion ? 0 : 0.18}
          scale={1.12}
          rotation={0}
        />
      </div>

      <section className="launcher-shell" aria-labelledby="roshi-title">
        <header className="launcher-brand">
          <h1 className="launcher-wordmark" id="roshi-title">
            Roshi
          </h1>
          <p className="launcher-kicker">A quiet place to think</p>
          <form action="/logout" className="logout-form" method="post">
            <button className="logout-button" type="submit">
              Log out
            </button>
          </form>
        </header>

        <section className="launcher-panel" aria-labelledby="conversations-title">
          <header className="launcher-panel-header">
            <div className="launcher-panel-title">
              <h2 id="conversations-title">Conversations</h2>
              {loadState === "ready" && (
                <span
                  className="conversation-count"
                  aria-label={`${conversations.length} conversations`}
                >
                  {String(conversations.length).padStart(2, "0")}
                </span>
              )}
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => void createConversation()}
              disabled={creating}
            >
              {creating ? <span className="spinner" aria-hidden="true" /> : <PlusIcon />}
              {creating ? (
                "Creating"
              ) : (
                <>
                  <span className="new-button-label">New conversation</span>
                  <span className="new-button-label-short">New</span>
                </>
              )}
            </button>
          </header>

          {notice && (
            <div className="panel-notice" role="alert">
              <p>{notice}</p>
              <button className="notice-action" type="button" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            </div>
          )}

          {loadState === "loading" && <ConversationSkeleton />}

          {loadState === "error" && (
            <div className="launcher-state">
              <span className="launcher-state-icon" aria-hidden="true">
                <CloudIcon />
              </span>
              <h3>Couldn’t load conversations</h3>
              <p>Check your connection and try again.</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void loadConversations()}
              >
                Try again
              </button>
            </div>
          )}

          {loadState === "ready" && conversations.length === 0 && (
            <div className="launcher-state">
              <span className="launcher-state-icon" aria-hidden="true">
                <ConversationIcon />
              </span>
              <h3>No conversations yet</h3>
              <p>Start with a question, an idea, or something you want to understand.</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void createConversation()}
                disabled={creating}
              >
                <PlusIcon /> New conversation
              </button>
            </div>
          )}

          {loadState === "ready" && conversations.length > 0 && (
            <ul className="conversation-list">
              {conversations.map((conversation) => {
                const isRenaming = rowMode?.id === conversation.id && rowMode.mode === "rename";
                const isDeleting = rowMode?.id === conversation.id && rowMode.mode === "delete";
                const actionsOpen = rowMode?.id === conversation.id && rowMode.mode === "actions";
                const isBusy = busyId === conversation.id;

                return (
                  <li className="conversation-row" key={conversation.id} aria-busy={isBusy}>
                    {isRenaming ? (
                      <form
                        className="conversation-editor"
                        onSubmit={(event) => void renameConversation(event, conversation)}
                      >
                        <label className="sr-only" htmlFor={`rename-${conversation.id}`}>
                          Conversation name
                        </label>
                        <input
                          ref={renameInputRef}
                          id={`rename-${conversation.id}`}
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape" && !isBusy) setRowMode(null);
                          }}
                          disabled={isBusy}
                        />
                        <button
                          className="icon-button"
                          type="submit"
                          aria-label={`Save name for ${conversation.name}`}
                          title="Save"
                          disabled={isBusy || !draftName.trim()}
                        >
                          {isBusy ? <span className="spinner" /> : <CheckIcon />}
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          aria-label="Cancel rename"
                          title="Cancel"
                          onClick={() => setRowMode(null)}
                          disabled={isBusy}
                        >
                          <CloseIcon />
                        </button>
                      </form>
                    ) : isDeleting ? (
                      <div
                        className="delete-confirmation"
                        role="group"
                        aria-label="Delete conversation"
                      >
                        <div className="delete-copy">
                          <strong>Delete “{conversation.name}”?</strong>
                          <span>This permanently removes its messages.</span>
                        </div>
                        <div className="delete-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => setRowMode(null)}
                            disabled={isBusy}
                          >
                            Cancel
                          </button>
                          <button
                            className="danger-button"
                            type="button"
                            onClick={() => void deleteConversation(conversation)}
                            disabled={isBusy}
                          >
                            {isBusy && <span className="spinner" aria-hidden="true" />}
                            {isBusy ? "Deleting" : "Delete"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Link
                          className="conversation-link"
                          to="/chat/$conversationId"
                          params={{ conversationId: conversation.id }}
                        >
                          <span className="conversation-name">{conversation.name}</span>
                          <time
                            className="conversation-time"
                            dateTime={conversation.updatedAt}
                            title={formatExactTime(conversation.updatedAt)}
                          >
                            {relativeTime(conversation.updatedAt, clock)}
                          </time>
                        </Link>
                        <div className="conversation-actions">
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Actions for ${conversation.name}`}
                            aria-expanded={actionsOpen}
                            title="Conversation actions"
                            onClick={() =>
                              setRowMode(
                                actionsOpen ? null : { id: conversation.id, mode: "actions" },
                              )
                            }
                          >
                            <MoreIcon />
                          </button>
                        </div>
                        {actionsOpen && (
                          <div className="conversation-menu">
                            <button type="button" onClick={() => beginRename(conversation)}>
                              <PencilIcon /> Rename
                            </button>
                            <button
                              className="destructive"
                              type="button"
                              onClick={() => {
                                setNotice(null);
                                setRowMode({ id: conversation.id, mode: "delete" });
                              }}
                            >
                              <TrashIcon /> Delete
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </main>
  );
}

function ConversationSkeleton() {
  return (
    <div role="status" aria-label="Loading conversations">
      <ul className="skeleton-list" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <li className="skeleton-row" key={item}>
            <span className="skeleton-line" />
            <span className="skeleton-line short" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function relativeTime(timestamp: string, now: number): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "—";
  const seconds = Math.max(0, Math.floor((now - parsed) / 1_000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: new Date(parsed).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  }).format(parsed);
}

function formatExactTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed)
    : "Unknown update time";
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Icon>
  );
}

function PencilIcon() {
  return (
    <Icon>
      <path
        d="m15.5 5.5 3 3M5 19l3.4-.7L18 8.7a1.4 1.4 0 0 0 0-2l-.7-.7a1.4 1.4 0 0 0-2 0l-9.6 9.6L5 19Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

function TrashIcon() {
  return (
    <Icon>
      <path
        d="M4.5 7h15M9 4h6l1 3H8l1-3Zm-2 3 .8 13h8.4L17 7M10 10.5v6M14 10.5v6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

function MoreIcon() {
  return (
    <Icon>
      <circle cx="6" cy="12" r="1.25" fill="currentColor" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
      <circle cx="18" cy="12" r="1.25" fill="currentColor" />
    </Icon>
  );
}

function CheckIcon() {
  return (
    <Icon>
      <path
        d="m5 12.5 4.2 4.2L19 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

function CloseIcon() {
  return (
    <Icon>
      <path
        d="m6.5 6.5 11 11m0-11-11 11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Icon>
  );
}

function ConversationIcon() {
  return (
    <Icon>
      <path
        d="M5 5.5h14v10H9l-4 3v-13Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

function CloudIcon() {
  return (
    <Icon>
      <path
        d="M7.5 18h9a4 4 0 0 0 .6-8 5.4 5.4 0 0 0-10.4 1.3A3.4 3.4 0 0 0 7.5 18Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="m9.5 11 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Icon>
  );
}
