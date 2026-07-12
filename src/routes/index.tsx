import { useVoiceInput } from "@cloudflare/voice/react";
import { MeshGradient, PulsingBorder } from "@paper-design/shaders-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAudioAnalyser } from "~/useAudioAnalyser";

const COLORS = ["#4fb8b2", "#2f6a4a", "#328f97", "#7ed3bf"];
const PULSE_COLORS = ["#4fb8b2", "#7ed3bf", "#2f6a4a"];

const DISTORTION_OVERALL_SENSITIVITY = 0.9;
const DISTORTION_BASS_SENSITIVITY = 0.3;
const DISTORTION_MAX = 1.0;

const SPEED_OVERALL_SENSITIVITY = 0.4;
const SPEED_MID_SENSITIVITY = 0.2;
const SPEED_MAX = 1.5;

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const shaderProps = useMemo(() => {
    // Base values keep the wave moving smoothly even when silent
    const base = {
      colors: COLORS,
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
  }, [analysis, isListening]);

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
              color: "rgba(255, 255, 255, 0.92)",
              textShadow: "0 0 20px rgba(79, 184, 178, 0.35)",
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
                colors={PULSE_COLORS}
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
                colors={PULSE_COLORS}
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
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
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
