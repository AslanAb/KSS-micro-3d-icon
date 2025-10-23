"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import Spinner from "./Spinner";
import FacetBall3D from "./FacetBall3D";

type RecordingState = "idle" | "recording" | "recorded";

interface AudioRecorderProps {
  strokeWidthMultiplier?: number;
}

export default function AudioRecorder_v2({
  strokeWidthMultiplier: initialStrokeWidthMultiplier = 1.0,
}: AudioRecorderProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [strokeWidthMultiplier, setStrokeWidthMultiplier] = useState<number>(
    initialStrokeWidthMultiplier
  );
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const meteringActiveRef = useRef<boolean>(false);
  // Removed mic-driven ball props; keep only waveform path state
  const [waveAPath, setWaveAPath] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const playbackRafRef = useRef<number | null>(null);
  const [playbackLevel, setPlaybackLevel] = useState<number>(0);

  // Helper to build a smooth circular path from waveform samples
  const buildCircularPath = (
    dataArray: Uint8Array,
    bufferLength: number,
    offset: number,
    amplitude: number,
    points: number,
    baseR: number,
    cx: number,
    cy: number
  ) => {
    const step = Math.max(1, Math.floor(bufferLength / points));
    const firstIdx = offset % bufferLength;
    let d = "";
    let prevX = 0;
    let prevY = 0;
    for (let i = 0; i < points; i++) {
      const idx = (firstIdx + i * step) % bufferLength;
      const sample = ((dataArray[idx] ?? 128) - 128) / 128; // -1..1
      const theta = (i / points) * Math.PI * 2;
      const r = baseR + sample * amplitude;
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      if (i === 0) {
        d = `M ${x} ${y}`;
        prevX = x;
        prevY = y;
      } else {
        const xc = (prevX + x) / 2;
        const yc = (prevY + y) / 2;
        d += ` Q ${prevX} ${prevY} ${xc} ${yc}`;
        prevX = x;
        prevY = y;
      }
    }
    d += " Z";
    return d;
  };

  useEffect(() => {
    const el = audioElementRef.current;
    if (!el) return;
    const onPlay = async () => {
      setIsPlaying(true);
      // Setup audio graph for playback metering
      try {
        if (!audioContextRef.current || audioContextRef.current.state === "closed") {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioContextRef.current!;
        if (!playbackSourceRef.current) {
          playbackSourceRef.current = ctx.createMediaElementSource(el);
        }
        if (!playbackAnalyserRef.current) {
          playbackAnalyserRef.current = ctx.createAnalyser();
          playbackAnalyserRef.current.fftSize = 1024;
          playbackAnalyserRef.current.smoothingTimeConstant = 0.8;
        }
        // Connect: source -> analyser -> destination
        try {
          playbackSourceRef.current.connect(playbackAnalyserRef.current);
        } catch {}
        try {
          playbackAnalyserRef.current.connect(ctx.destination);
        } catch {}

        const analyser = playbackAnalyserRef.current;
        const bufferLength = analyser!.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        const updatePlayback = () => {
          analyser!.getByteTimeDomainData(dataArray);
          let sumSquares = 0;
          for (let i = 0; i < bufferLength; i++) {
            const v = (dataArray[i] - 128) / 128; // -1..1
            sumSquares += v * v;
          }
          const rms = Math.sqrt(sumSquares / bufferLength); // ~0..1
          setPlaybackLevel((prev) => prev * 0.7 + rms * 0.3);
          playbackRafRef.current = requestAnimationFrame(updatePlayback);
        };
        if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
        playbackRafRef.current = requestAnimationFrame(updatePlayback);
      } catch {}
    };
    const onPause = () => {
      setIsPlaying(false);
      if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = null;
      setPlaybackLevel(0);
    };
    const onEnded = () => {
      setIsPlaying(false);
      if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = null;
      setPlaybackLevel(0);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    if (!audioUrlRef.current) setIsPlaying(false);
  }, [audioUrlRef.current]);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);
  const startRecording = async () => {
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: "audio/webm",
        });
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setRecordingState("recorded");
        // stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        // cleanup audio metering
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        try {
          analyserRef.current?.disconnect();
          sourceNodeRef.current?.disconnect();
          if (
            audioContextRef.current &&
            audioContextRef.current.state !== "closed"
          ) {
            audioContextRef.current.close();
          }
        } catch {
          // ignore
        } finally {
          analyserRef.current = null;
          sourceNodeRef.current = null;
          audioContextRef.current = null;
        }
      };

      mediaRecorder.start();
      setRecordingState("recording");
      meteringActiveRef.current = true;

      // setup audio level metering
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 1;
      sourceNode.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceNodeRef.current = sourceNode;

      const bufferLength = analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      // Precompute constants used each frame
      const pointsConst = Math.max(100, Math.round(140 * scale));
      const baseRConst = spinnerRadius;
      const sensitivity = 2.2;
      const waveStrength = 1.9;

      const updateLevel = () => {
        if (!meteringActiveRef.current) {
          return; // do not schedule further frames when stopped
        }
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const centered = (dataArray[i] - 128) / 128; // -1..1
          sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / bufferLength); // 0..~1
        // High sensitivity normalization: react even to tiny sounds
        const noiseThreshold = 0.003; // lower gate
        const scaleRange = 0.05; // amplify small levels
        let norm = Math.max(0, (rms - noiseThreshold) / scaleRange);
        norm = Math.min(1, norm * 2.8); // sensitivity boost
        if (norm > 0) norm = Math.max(0.06, norm); // ensure visible movement when any signal exists

        const levelForAmp = Math.min(1, Math.pow(norm, 0.85) * sensitivity);
        const amp = (12 * scale + levelForAmp * (42 * scale)) * waveStrength;
        setWaveAPath(
          buildCircularPath(
            dataArray,
            bufferLength,
            16,
            amp * 0.9,
            pointsConst,
            baseRConst,
            center,
            center
          )
        );

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    } catch (err) {
      setErrorMessage(
        (err as Error).message || "Не удалось получить доступ к микрофону"
      );
      setRecordingState("idle");
    }
  };

  const stopRecording = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    // Immediately stop metering and cleanup, then restore idle circle
    meteringActiveRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    try {
      analyserRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    } catch {
      // ignore
    } finally {
      analyserRef.current = null;
      sourceNodeRef.current = null;
      audioContextRef.current = null;

      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
      }, 2000);
    }
      // reset waveform to idle
    setIdlePaths();
  };

  const play = () => {
    if (!audioUrlRef.current) return;
    if (!audioElementRef.current) return;
    audioElementRef.current.src = audioUrlRef.current;
    audioElementRef.current.play();
  };

  const toggleRecording = () => {
    if (recordingState === "recording") {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const onSvgKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleRecording();
    }
  };

  const reset = () => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    recordedChunksRef.current = [];
    setRecordingState("idle");
    // Ensure metering is fully stopped
    meteringActiveRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    try {
      analyserRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    } catch {
      // ignore
    } finally {
      analyserRef.current = null;
      sourceNodeRef.current = null;
      audioContextRef.current = null;
    }
    // reset waveform to idle
    setIdlePaths();
  };

  const isRecording = recordingState === "recording";
  const hasRecording = recordingState === "recorded";

  // Visual parameters (scaled to 40px canvas)
  const size = 80;
  const center = size / 2;
  const scale = size / 600; // reference design at 220px
  // Spinner / center visual size (keep wave radius in sync with this)
  const spinnerSize = 60;
  const spinnerRadius = spinnerSize / 2; // 30px
  // Helper: set idle circular paths based on current size/center
  const setIdlePaths = () => {
    const cx = center;
    const cy = center;
    const baseR = spinnerRadius; // unified base radius for idle and recording
    const buildCirclePath = (r: number) =>
      `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${
        cx + r
      } ${cy}`;
    setWaveAPath(buildCirclePath(baseR));
  };

  // Initialize idle paths once visual parameters are available
  useEffect(() => {
    setIdlePaths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  return (
    <div className="flex flex-col gap-3 w-full max-w-sm">
      <div className="flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          onClick={isLoading ? undefined : toggleRecording}
          onKeyDown={onSvgKeyDown}
          role="button"
          tabIndex={0}
          aria-pressed={isRecording}
          aria-label={isRecording ? "Остановить запись" : "Начать запись"}
          className="cursor-pointer select-none focus:outline-none"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <defs>
            <linearGradient id="waveSideGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a6a3a4" />
              <stop offset="100%" stopColor="#D51E1F" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={3 * scale}
                result="blur"
              />
              <feMerge>
                {/* <feMergeNode in="blur" /> */}
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {!isLoading && (
            <path
              d={waveAPath}
              fill="none"
              stroke="url(#waveSideGrad)"
              strokeWidth={2.4 * strokeWidthMultiplier}
              strokeLinecap="round"
              filter="url(#glow)"
              style={{
                transition: "opacity 300ms",
                opacity: isRecording ? 0.9 : 0,
              }}
            />
          )}
          {isLoading && (
            <g transform={`translate(${center - 30}, ${center - 30})`}>
              <Spinner size={60} />
            </g>
          )}
          <foreignObject
            x={center - 30}
            y={center - 30}
            width={60}
            height={60}
            overflow="visible"
          >
            <FacetBall3D
              size={60}
              rotate={isHovered || isRecording || isLoading}
              isPlaying={isPlaying}
              playbackLevel={playbackLevel}
            />
          </foreignObject>
        </svg>
      </div>
      <div className="flex gap-2 mt-2">
        <button
          className="rounded-md px-4 py-2 bg-green-600 text-white disabled:bg-gray-400"
          onClick={play}
          disabled={!hasRecording}
        >
          Воспроизвести
        </button>
        <button
          className="rounded-md px-4 py-2 bg-red-600 text-white disabled:bg-gray-400"
          onClick={reset}
          disabled={!hasRecording}
        >
          Сбросить
        </button>
      </div>

      {/* Stroke width control */}
      <div className="flex items-center gap-2 mt-2">
        <label
          htmlFor="strokeWidthSlider"
          className="text-sm text-gray-600 min-w-0"
        >
          Толщина линии:
        </label>
        <input
          id="strokeWidthSlider"
          type="range"
          min="0.1"
          max="3.0"
          step="0.1"
          value={strokeWidthMultiplier}
          onChange={(e) => setStrokeWidthMultiplier(parseFloat(e.target.value))}
          className="flex-1"
        />
        <span className="text-sm text-gray-600 min-w-8">
          {strokeWidthMultiplier.toFixed(1)}x
        </span>
      </div>

      {errorMessage ? (
        <div className="text-sm text-red-600">{errorMessage}</div>
      ) : null}
      <audio ref={audioElementRef} controls className="w-full" />
    </div>
  );
}
