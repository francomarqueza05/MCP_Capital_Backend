"use client";
// Shared pieces for the topic scenes. Every scene follows the same contract:
//   a sentence that says what is going on, in the family's numbers;
//   one picture that builds itself and then responds physically (springs, not tweens);
//   where Sherpas gives a fix, a control to try it and watch the picture change.
import { animate, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useId, useState, type ReactNode } from "react";

export const C = {
  night: "#0a0e2a",
  slate: "#151b45",
  slate2: "#1d2557",
  snow: "#eef0ff",
  lichen: "#9aa6f0",
  dim: "rgba(154,166,240,.14)",
  faint: "rgba(154,166,240,.08)",
  dawn: "#ffc9a3",
  good: "#7fe0b4",
  warn: "#f2c46d",
  bad: "#f28b9b",
};
export const tone = (s: string) => (s === "good" ? C.good : s === "warn" ? C.warn : C.bad);

export const VW = 560;
export const VH = 260;

/** Physical feel for anything a person drags: a little overshoot, then it settles. */
export const SPRING = { stiffness: 170, damping: 19, mass: 1 };
export const SOFT = { stiffness: 90, damping: 18, mass: 1 };

/** 0 → 1 once, after `delay` seconds: the scene's build-in. */
export function useBuild(delay = 0.15, duration = 1.1) {
  const b = useMotionValue(0);
  useEffect(() => {
    const c = animate(b, 1, { delay, duration, ease: [0.2, 0.7, 0.2, 1] });
    return () => c.stop();
  }, [b, delay, duration]);
  return b;
}

/** A spring that chases a React value: drag a slider, the picture follows with weight. */
export function useFollow(value: number, cfg = SPRING) {
  const s = useSpring(value, cfg);
  useEffect(() => {
    s.set(value);
  }, [s, value]);
  return s;
}

export const useText = (mv: MotionValue<number>, fmt: (v: number) => string) => useTransform(mv, fmt);

export function SceneFrame({ title, sub, colour, children, controls }: { title: ReactNode; sub?: ReactNode; colour?: string; children: ReactNode; controls?: ReactNode }) {
  return (
    <figure className="scene">
      <figcaption>
        <h4 className="scene-title" style={colour ? { color: colour } : undefined}>
          {title}
        </h4>
        {sub && <p className="scene-sub">{sub}</p>}
      </figcaption>
      <svg className="scene-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={typeof title === "string" ? title : undefined}>
        <Defs />
        {children}
      </svg>
      {controls && <div className="scene-controls">{controls}</div>}
    </figure>
  );
}

/** Gradients and the hatch for "what is missing", defined once per scene. */
function Defs() {
  return (
    <defs>
      {(["good", "warn", "bad", "lichen", "dawn"] as const).map((k) => (
        <linearGradient key={k} id={`v-${k}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={C[k]} stopOpacity=".05" />
          <stop offset="1" stopColor={C[k]} stopOpacity=".38" />
        </linearGradient>
      ))}
      <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="rgba(242,139,155,.06)" />
        <line x1="0" y1="0" x2="0" y2="7" stroke={C.bad} strokeWidth="1.6" opacity=".5" />
      </pattern>
      <pattern id="hatch-l" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="7" stroke={C.lichen} strokeWidth="1.2" opacity=".35" />
      </pattern>
    </defs>
  );
}

export function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  const id = useId();
  const k = max > min ? (value - min) / (max - min) : 0;
  return (
    <div className="slider">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{format(value)}</output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        onClick={(e) => e.stopPropagation()}
        style={{ ["--k" as string]: k }}
      />
    </div>
  );
}

export function Toggle({ on, onChange, labels }: { on: boolean; onChange: (v: boolean) => void; labels: [string, string] }) {
  return (
    <div className="seg" role="group">
      {labels.map((l, i) => (
        <button
          key={l}
          aria-pressed={on === (i === 1)}
          onClick={(e) => {
            e.stopPropagation();
            onChange(i === 1);
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** A label pill drawn inside the SVG; width measured from the text. */
export function Pill({ x, y, text, colour, anchor = "middle" }: { x: number | MotionValue<number>; y: number; text: string; colour: string; anchor?: "start" | "middle" | "end" }) {
  const w = text.length * 6.6 + 22;
  const off = anchor === "middle" ? -w / 2 : anchor === "end" ? -w : 0;
  return (
    <motion.g style={{ x, y }} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
      <rect x={off} y={-12} width={w} height={24} rx={12} fill={colour} />
      <text x={off + w / 2} y={4.5} textAnchor="middle" className="svg-pill">
        {text}
      </text>
    </motion.g>
  );
}

/** A Sankey-style band between two vertical spans. */
export function band(x0: number, t0: number, b0: number, x1: number, t1: number, b1: number) {
  const m = (x0 + x1) / 2;
  return `M${x0},${t0} C${m},${t0} ${m},${t1} ${x1},${t1} L${x1},${b1} C${m},${b1} ${m},${b0} ${x0},${b0} Z`;
}
export function mid(x0: number, y0: number, x1: number, y1: number) {
  const m = (x0 + x1) / 2;
  return `M${x0},${y0} C${m},${y0} ${m},${y1} ${x1},${y1}`;
}

/** Re-renders on a timer: for scenes that loop a little story (claims, drops). */
export function useTicker(ms: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}
