// PROTOTYPE (roshi#4) — throwaway shared style consts lifted from the / page's
// existing visual language (glass panels over the shader, serif display type).
import type { CSSProperties } from "react";

export const SERIF = "Georgia, 'Times New Roman', serif";

export const textShadow = "0 2px 20px rgba(0, 0, 0, 0.5), 0 0 6px rgba(0, 0, 0, 0.35)";

export const glassPanel: CSSProperties = {
  background: "rgba(0, 0, 0, 0.38)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255, 255, 255, 0.22)",
};

export const glassDark: CSSProperties = {
  background: "rgba(0, 0, 0, 0.5)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255, 255, 255, 0.2)",
};

export const dimText = "rgba(255, 255, 255, 0.75)";

export const pillButton: CSSProperties = {
  ...glassPanel,
  borderRadius: "999px",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 700,
  padding: "0.6rem 1rem",
  fontSize: "0.9rem",
  border: "1px solid rgba(255, 255, 255, 0.25)",
};
