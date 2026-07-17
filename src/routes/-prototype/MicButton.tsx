// PROTOTYPE (roshi#4) — throwaway shared mic button: the / page's PulsingBorder
// mic control shrunk to composer size.
import type { useVoiceInput } from "@cloudflare/voice/react";
import { PulsingBorder } from "@paper-design/shaders-react";
import { glassPanel } from "./glass";

const PULSE_LISTENING = ["#f7b267", "#f5a142", "#f4a261", "#e38b2a"];

export function MicButton({ voice }: { voice: ReturnType<typeof useVoiceInput> }) {
  return (
    <div
      style={{
        position: "relative",
        width: "2.9rem",
        height: "2.9rem",
        flexShrink: 0,
      }}
    >
      {voice.isListening && (
        <div
          style={{
            position: "absolute",
            inset: "-0.5rem",
            zIndex: 0,
            overflow: "hidden",
            borderRadius: "50%",
          }}
        >
          <PulsingBorder
            width={70}
            height={70}
            colors={PULSE_LISTENING}
            colorBack="#00000000"
            roundness={0.5}
            thickness={0.15}
            softness={0.6}
            intensity={0.6}
            bloom={0.5}
            spots={3}
            spotSize={0.4}
            pulse={0.8}
            smoke={0.2}
            smokeSize={0.5}
            speed={1.5}
            scale={0.8}
          />
        </div>
      )}
      <button
        type="button"
        onClick={voice.isListening ? voice.stop : voice.start}
        title={voice.isListening ? "Stop listening" : "Speak"}
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          ...glassPanel,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        {voice.isListening ? <StopIcon /> : <MicIcon />}
      </button>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={18}
      height={18}
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
      width={18}
      height={18}
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
