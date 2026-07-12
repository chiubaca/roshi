import { useCallback, useEffect, useRef, useState } from "react";

export type AudioAnalysis = {
  bass: number;
  mid: number;
  treble: number;
  overall: number;
  brightness: number;
  centroid: number;
};

export function useAudioAnalyser() {
  const [permissionState, setPermissionState] = useState<
    "idle" | "requesting" | "granted" | "denied"
  >("idle");
  const [analysis, setAnalysis] = useState<AudioAnalysis>({
    bass: 0,
    mid: 0,
    treble: 0,
    overall: 0,
    brightness: 0,
    centroid: 0,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const isRunningRef = useRef(false);
  const smoothedRef = useRef<AudioAnalysis>({
    bass: 0,
    mid: 0,
    treble: 0,
    overall: 0,
    brightness: 0,
    centroid: 0,
  });

  const stop = useCallback(() => {
    isRunningRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setAnalysis({ bass: 0, mid: 0, treble: 0, overall: 0, brightness: 0, centroid: 0 });
  }, []);

  const analyse = useCallback(() => {
    if (!isRunningRef.current || !analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const bassEnd = Math.floor(bufferLength * 0.1);
    const midEnd = Math.floor(bufferLength * 0.5);

    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;
    let totalSum = 0;

    for (let i = 0; i < bufferLength; i++) {
      const val = dataArray[i];
      totalSum += val;
      if (i < bassEnd) bassSum += val;
      else if (i < midEnd) midSum += val;
      else trebleSum += val;
    }

    const bassAvg = bassSum / (bassEnd || 1) / 255;
    const midAvg = midSum / (midEnd - bassEnd || 1) / 255;
    const trebleAvg = trebleSum / (bufferLength - midEnd || 1) / 255;
    const overall = totalSum / bufferLength / 255;

    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < bufferLength; i++) {
      weightedSum += i * dataArray[i];
      totalWeight += dataArray[i];
    }
    const centroid = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const brightness = centroid / bufferLength;

    // Smooth the raw values so the shader moves fluidly while still pulsing with voice
    const alpha = 0.18;
    const s = smoothedRef.current;
    s.bass = s.bass + alpha * (bassAvg - s.bass);
    s.mid = s.mid + alpha * (midAvg - s.mid);
    s.treble = s.treble + alpha * (trebleAvg - s.treble);
    s.overall = s.overall + alpha * (overall - s.overall);
    s.brightness = s.brightness + alpha * (brightness - s.brightness);
    s.centroid = s.centroid + alpha * (centroid - s.centroid);

    setAnalysis({ ...s });

    rafRef.current = requestAnimationFrame(analyse);
  }, []);

  const start = useCallback(async () => {
    if (isRunningRef.current) return;

    setPermissionState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      isRunningRef.current = true;
      setPermissionState("granted");
      rafRef.current = requestAnimationFrame(analyse);
    } catch (err) {
      console.error("Failed to get microphone permission:", err);
      setPermissionState("denied");
      stop();
    }
  }, [analyse, stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { start, stop, analysis, permissionState };
}
