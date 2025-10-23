import * as React from "react";

type SpinnerProps = {
  size?: number;
  className?: string;
};

export default function Spinner({ size = 40, className }: SpinnerProps) {
  const center = size / 2;
  const radius = center; // exact half size to match unified radius
  const circumference = 2 * Math.PI * radius;
  const spinAnimation = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;

  return (
    <>
      <style>{spinAnimation}</style>
      <g
        className={className}
        style={{
          transformOrigin: `${center}px ${center}px`,
          animation: "spin 1s linear infinite",
        }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#waveSideGrad)"
          strokeWidth={2.4}
          strokeLinecap="round"
          filter="url(#glow)"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
        />
      </g>
    </>
  );
}
