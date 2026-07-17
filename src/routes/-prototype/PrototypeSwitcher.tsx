// PROTOTYPE (roshi#4) — floating variant switcher. Dev-only: renders nothing in
// production builds. Arrows (or ← / → keys) cycle variants via the ?variant=
// search param so a variant is shareable and reload-stable.
import { useNavigate } from "@tanstack/react-router";
import { useEffect, type CSSProperties } from "react";

export const VARIANTS = [
  { key: "A", name: "Sidebar" },
  { key: "B", name: "Voice hero + drawer" },
  { key: "C", name: "Launcher + dialogue" },
] as const;

export function PrototypeSwitcher({ current }: { current?: string }) {
  const navigate = useNavigate();
  const index = VARIANTS.findIndex((v) => v.key === current);

  const cycle = (dir: 1 | -1) => {
    const next =
      index === -1
        ? dir === 1
          ? 0
          : VARIANTS.length - 1
        : (index + dir + VARIANTS.length) % VARIANTS.length;
    navigate({ to: "/", search: { variant: VARIANTS[next].key }, replace: true });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  const label =
    index === -1 ? "current voice UI" : `${VARIANTS[index].key} — ${VARIANTS[index].name}`;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.35rem 0.6rem",
        borderRadius: "999px",
        background: "rgba(0, 0, 0, 0.8)",
        border: "1px solid rgba(255, 255, 255, 0.35)",
        color: "#fff",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: "0.8rem",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
      }}
    >
      <span style={{ opacity: 0.5, paddingLeft: "0.25rem" }}>prototype</span>
      <button
        type="button"
        onClick={() => cycle(-1)}
        style={arrowStyle}
        aria-label="Previous variant"
      >
        ←
      </button>
      <span style={{ minWidth: "11rem", textAlign: "center" }}>{label}</span>
      <button type="button" onClick={() => cycle(1)} style={arrowStyle} aria-label="Next variant">
        →
      </button>
    </div>
  );
}

const arrowStyle: CSSProperties = {
  background: "none",
  border: "1px solid rgba(255, 255, 255, 0.35)",
  color: "#fff",
  borderRadius: "999px",
  width: "1.6rem",
  height: "1.6rem",
  cursor: "pointer",
  lineHeight: 1,
};
