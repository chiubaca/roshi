// PROTOTYPE (roshi#4) — throwaway shared backdrop. Simplified copy of the /
// page's shader background: same palettes and listening colour blend, without
// the audio-analyser wiring (static distortion/speed).
import { MeshGradient } from "@paper-design/shaders-react";
import { interpolateLab } from "d3-interpolate";
import { useEffect, useState } from "react";

const COLORS = ["#a2d2ff", "#bde0fe", "#8ecae6", "#caf0f8"];
const LISTENING_COLORS = ["#ffe8d6", "#ffd7ba", "#fec89a", "#f9c74f"];
const TRANSITION_MS = 800;

function blendPalettes(from: string[], to: string[], t: number): string[] {
  return from.map((color, i) => interpolateLab(color, to[i % to.length])(t));
}

export function ShaderBackdrop({ isListening }: { isListening: boolean }) {
  const [blend, setBlend] = useState(0);

  useEffect(() => {
    let rafId: number;
    let startTime: number | null = null;
    const startBlend = blend;
    const targetBlend = isListening ? 1 : 0;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / TRANSITION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setBlend(startBlend + (targetBlend - startBlend) * eased);
      if (progress < 1) rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isListening]);

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      {/* Placeholder text (incl. the interim transcript) must read on dark glass */}
      <style>{`.proto-input::placeholder { color: rgba(255, 255, 255, 0.65); opacity: 1; }`}</style>
      <MeshGradient
        width="100vw"
        height="100vh"
        colors={blendPalettes(COLORS, LISTENING_COLORS, blend)}
        distortion={0.3}
        swirl={0.9}
        grainMixer={0.2}
        grainOverlay={0.2}
        speed={0.6}
        scale={1}
        rotation={0}
      />
    </div>
  );
}
