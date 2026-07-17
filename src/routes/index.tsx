import { useVoiceInput } from "@cloudflare/voice/react";
import { MeshGradient, PulsingBorder } from "@paper-design/shaders-react";
import { interpolateLab } from "d3-interpolate";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAudioAnalyser } from "~/useAudioAnalyser";
// PROTOTYPE (roshi#4) — throwaway UI variants, dev-only via ?variant=A|B|C.
import { PrototypeSwitcher } from "./-prototype/PrototypeSwitcher";
import { VariantA } from "./-prototype/VariantA";
import { VariantB } from "./-prototype/VariantB";
import { VariantC } from "./-prototype/VariantC";

const COLORS = ["#a2d2ff", "#bde0fe", "#8ecae6", "#caf0f8"];
const LISTENING_COLORS = ["#ffe8d6", "#ffd7ba", "#fec89a", "#f9c74f"];
const PULSE_COLORS_DEFAULT = ["#5aa9e6", "#4a9ad9", "#6ab7ff", "#3d8bc6"];
const PULSE_COLORS_LISTENING = ["#f7b267", "#f5a142", "#f4a261", "#e38b2a"];

const COLOR_TRANSITION_DURATION_MS = 800;

const DISTORTION_OVERALL_SENSITIVITY = 0.9;
const DISTORTION_BASS_SENSITIVITY = 0.3;
const DISTORTION_MAX = 1.0;

const SPEED_OVERALL_SENSITIVITY = 0.4;
const SPEED_MID_SENSITIVITY = 0.2;
const SPEED_MAX = 1.5;

function blendPalettes(from: string[], to: string[], t: number): string[] {
  return from.map((color, i) => interpolateLab(color, to[i % to.length])(t));
}

export const Route = createFileRoute("/")({
  // PROTOTYPE (roshi#4) — ?variant=A|B|C renders throwaway UI variants in dev.
  validateSearch: (search: Record<string, unknown>): { variant?: string } => ({
    variant: typeof search.variant === "string" ? search.variant : undefined,
  }),
  component: Home,
});

function Home() {
  const { variant } = Route.useSearch();

  if (import.meta.env.DEV && (variant === "A" || variant === "B" || variant === "C")) {
    return (
      <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
        {variant === "A" && <VariantA />}
        {variant === "B" && <VariantB />}
        {variant === "C" && <VariantC />}
        <PrototypeSwitcher current={variant} />
      </div>
    );
  }

  return <VoiceHome />;
}

function VoiceHome() {
  const {
    transcript,
    interimTranscript,
    isListening,
    error: voiceError,
    start: voiceStart,
    stop: voiceStop,
    clear,
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

  const [hasStarted, setHasStarted] = useState(false);
  const [colorBlend, setColorBlend] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    let startTime: number | null = null;
    const startBlend = colorBlend;
    const targetBlend = isListening ? 1 : 0;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const rawProgress = Math.min(elapsed / COLOR_TRANSITION_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - rawProgress, 3);
      setColorBlend(startBlend + (targetBlend - startBlend) * eased);

      if (rawProgress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isListening]);

  const shaderProps = useMemo(() => {
    // Base values keep the wave moving smoothly even when silent
    const base = {
      colors: blendPalettes(COLORS, LISTENING_COLORS, colorBlend),
      distortion: 0.3,
      swirl: 0.9,
      speed: 0.6,
      scale: 1,
      rotation: 0,
    };

    if (!isListening) return base;

    const { overall, bass, mid } = analysis;

    // React to voice through distortion and speed, keeping scale steady
    return {
      ...base,
      distortion: Math.min(
        base.distortion +
          overall * DISTORTION_OVERALL_SENSITIVITY +
          bass * DISTORTION_BASS_SENSITIVITY,
        DISTORTION_MAX,
      ),
      speed: Math.min(
        base.speed + overall * SPEED_OVERALL_SENSITIVITY + mid * SPEED_MID_SENSITIVITY,
        SPEED_MAX,
      ),
    };
  }, [analysis, isListening, colorBlend]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interimTranscript]);

  const handleStart = async () => {
    setHasStarted(true);
    await startAnalyser();
    await voiceStart();
  };

  const handleStop = () => {
    voiceStop();
    stopAnalyser();
  };

  const error =
    voiceError ||
    (permissionState === "denied"
      ? "Microphone access denied. Please allow permission and try again."
      : null);

  const displayText = transcript + (interimTranscript ? ` ${interimTranscript}` : "");
  const hasText = displayText.trim().length > 0;

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {/* Full-screen shader background */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <MeshGradient
          width="100vw"
          height="100vh"
          colors={shaderProps.colors}
          distortion={shaderProps.distortion}
          swirl={shaderProps.swirl}
          grainMixer={0.2}
          grainOverlay={0.2}
          speed={shaderProps.speed}
          scale={shaderProps.scale}
          rotation={shaderProps.rotation}
        />
      </div>

      {/* Transcript overlay */}
      {hasText && (
        <div
          ref={scrollRef}
          style={{
            position: "fixed",
            bottom: "2rem",
            left: "2rem",
            zIndex: 20,
            maxWidth: "min(600px, 50vw)",
            maxHeight: "35vh",
            overflowY: "auto",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 40px)",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 40px)",
          }}
        >
          <p
            style={{
              margin: 0,
              paddingTop: "2.5rem",
              paddingBottom: "0.5rem",
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "1.25rem",
              lineHeight: 1.6,
              color: "#ffffff",
              fontWeight: 500,
              textShadow: "0 2px 20px rgba(0, 0, 0, 0.5), 0 0 6px rgba(0, 0, 0, 0.35)",
              whiteSpace: "pre-wrap",
            }}
          >
            {displayText}
          </p>
        </div>
      )}

      {/* Centered controls */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        {!hasStarted ? (
          <div style={{ position: "relative", display: "inline-block" }}>
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
                width={220}
                height={220}
                colors={PULSE_COLORS_DEFAULT}
                colorBack="#00000000"
                roundness={0.5}
                thickness={0.15}
                softness={0.6}
                intensity={0.3}
                bloom={0.3}
                spots={3}
                spotSize={0.4}
                pulse={0.4}
                smoke={0.2}
                smokeSize={0.5}
                speed={0.8}
                scale={0.8}
              />
            </div>
            <button
              type="button"
              onClick={handleStart}
              style={{
                position: "relative",
                zIndex: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.85rem 1.25rem",
                borderRadius: "999px",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                background: "rgba(255, 255, 255, 0.12)",
                backdropFilter: "blur(8px)",
                color: "#fff",
                fontSize: "0.95rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
              }}
            >
              <MicIcon />
              Enable Voice
            </button>
          </div>
        ) : (
          <div style={{ position: "relative", display: "inline-block" }}>
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
              onClick={isListening ? handleStop : handleStart}
              style={{
                position: "relative",
                zIndex: 10,
                width: "5rem",
                height: "5rem",
                borderRadius: "50%",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                background: "rgba(255, 255, 255, 0.12)",
                backdropFilter: "blur(8px)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: `
                  0 1px 2px rgba(0, 0, 0, 0.12),
                  0 4px 8px rgba(0, 0, 0, 0.14),
                  0 12px 24px rgba(0, 0, 0, 0.18),
                  0 24px 48px rgba(0, 0, 0, 0.22),
                  inset 0 1px 1px rgba(255, 255, 255, 0.35)
                `,
              }}
            >
              {isListening ? <StopIcon /> : <MicIcon size={28} />}
            </button>
          </div>
        )}
      </div>

      {/* Top-right utility buttons */}
      {hasText && (
        <div
          style={{
            position: "fixed",
            top: "1rem",
            right: "1rem",
            zIndex: 30,
            display: "flex",
            gap: "0.5rem",
          }}
        >
          <button
            onClick={() => navigator.clipboard.writeText(transcript)}
            style={utilityButtonStyle}
          >
            Copy
          </button>
          <button onClick={clear} style={utilityButtonStyle}>
            Clear
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          style={{
            position: "fixed",
            top: "1rem",
            left: "50%",
            zIndex: 40,
            transform: "translateX(-50%)",
            padding: "0.75rem 1rem",
            borderRadius: "0.75rem",
            background: "rgba(127, 29, 29, 0.7)",
            backdropFilter: "blur(8px)",
            color: "#fca5a5",
            maxWidth: "min(90vw, 500px)",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      {/* PROTOTYPE (roshi#4) — dev-only entry point into the UI variants */}
      <PrototypeSwitcher />
    </div>
  );
}

const utilityButtonStyle: React.CSSProperties = {
  padding: "0.4rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  background: "rgba(0, 0, 0, 0.25)",
  backdropFilter: "blur(8px)",
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.85rem",
};

function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
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
