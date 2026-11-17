"use client";
// How each kind of visual plays. Generic and data-driven: a beat says "these amounts as bars",
// "this value against a healthy range", and this draws it for any household.
//
// Two things make them feel alive:
//  - they follow Cordi's speech: `p` (0 to 1, how far through its line it is) brings each
//    part in as Cordi gets to it, so the picture builds with the sentence;
//  - they answer touch: bars light up and explain themselves, the range's marker can be
//    dragged to try "what if", the score flips between today and after the step, list items
//    open.
// Motion springs throughout (the `motion` library), so every change is continuous.
import { animate, AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Case } from "@/data/cases";
import { Scene } from "@/dashboard/scenes";
import { tones } from "@/lib/audio";
import { useStore } from "@/lib/store";
import { speech } from "@/stage/stage";
import type { Fmt, Tone, Visual as V } from "./beats";
import { fmt } from "./format";
import { notify } from "./remarks";

const EASE = [0.16, 1, 0.3, 1] as const;
const SPRING = { type: "spring", stiffness: 170, damping: 22 } as const;

export { fmt };

const t = (x?: Tone) => `t-${x ?? "neutral"}`;

/** A number that springs to its value, and keeps springing to new ones. */
function Num({ to, f, delay = 0 }: { to: number; f: Fmt; delay?: number }) {
  const mv = useMotionValue(0);
  const txt = useTransform(mv, (x) => fmt(f, x));
  useEffect(() => {
    const ctl = animate(mv, to, { duration: 1.2, delay, ease: EASE });
    return () => ctl.stop();
  }, [mv, to, delay]);
  return <motion.span>{txt}</motion.span>;
}

/**
 * How far Cordi is through the line: live while it speaks, whole otherwise. `empty`: the step
 * is about to be told, so it waits at the start instead of showing whole first (and then
 * building again from zero once Cordi starts).
 */
function useProgress(live: boolean, empty: boolean) {
  const p = useStore(speech, (s) => s.p);
  return empty ? 0 : live ? p : 1;
}

export function Visual({ v, c, live = false, empty = false }: { v: V; c: Case; live?: boolean; empty?: boolean }) {
  const p = useProgress(live, empty);
  switch (v.kind) {
    case "scene":
      return (
        <div className="vx vx-scene">
          <Scene t={v.topic} c={c} />
        </div>
      );
    case "figure":
      return <Figure v={v} p={p} />;
    case "bars":
      return <Bars v={v} p={p} />;
    case "range":
      return <Range v={v} p={p} />;
    case "score":
      return <Score v={v} p={p} />;
    case "list":
      return <List v={v} p={p} />;
  }
}

// ---------------------------------------------------------------- figure
function Figure({ v, p }: { v: Extract<V, { kind: "figure" }>; p: number }) {
  return (
    <div className="vx vx-figure">
      <motion.span data-cordi="on" className={`vx-big ${t(v.tone)}`} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING}>
        <Num to={v.value} f={v.fmt} delay={0.15} />
      </motion.span>
      <motion.span className="vx-cap" animate={{ opacity: p > 0.35 ? 1 : 0, y: p > 0.35 ? 0 : 8 }} transition={{ duration: 0.4 }}>
        {v.caption}
      </motion.span>
      {v.fmt === "months" && <Months value={v.value} tone={v.tone} p={p} />}
    </div>
  );
}

/** Months as a calendar that fills: one cell a month, the covered ones lit. Tap one to read it. */
function Months({ value, tone, p }: { value: number; tone?: Tone; p: number }) {
  const cells = Math.min(24, Math.max(12, Math.ceil(value)));
  const [hover, setHover] = useState<number | null>(null);
  const shown = p > 0.15;
  return (
    <div className="vx-months" data-cordi={shown ? "on" : undefined} onPointerLeave={() => setHover(null)}>
      {Array.from({ length: cells }, (_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <motion.button
            type="button"
            key={i}
            className={`vx-month ${hover === i ? "on" : ""}`}
            onPointerEnter={() => setHover(i)}
            onClick={() => {
              setHover(i);
              tones.tap();
            }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: shown ? 1 : 0, scale: shown ? 1 : 0.6 }}
            transition={{ ...SPRING, delay: shown ? i * 0.035 : 0 }}
            aria-label={`Mes ${i + 1}: ${fill >= 1 ? "cubierto" : fill > 0 ? "cubierto en parte" : "sin cubrir"}`}
          >
            <motion.span className={`vx-month-fill ${t(tone)}`} initial={{ scaleY: 0 }} animate={{ scaleY: shown ? fill : 0 }} transition={{ duration: 0.5, delay: shown ? 0.3 + i * 0.05 : 0, ease: EASE }} />
          </motion.button>
        );
      })}
      <AnimatePresence>
        {hover !== null && (
          <motion.span key="tip" className="vx-tip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            Mes {hover + 1}: {value >= hover + 1 ? "cubierto" : value > hover ? "cubierto en parte" : "sin cubrir"}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- bars
/** Amounts on one scale. Each comes in as Cordi names it; tap one to light it and read it. */
function Bars({ v, p }: { v: Extract<V, { kind: "bars" }>; p: number }) {
  const max = Math.max(...v.items.map((i) => i.of ?? i.value), 1);
  const [focus, setFocus] = useState<number | null>(null);
  const n = v.items.length;
  return (
    <div className="vx vx-bars" onPointerLeave={() => setFocus(null)}>
      {v.items.map((it, k) => {
        const on = p >= (k / n) * 0.8;
        const dim = focus !== null && focus !== k;
        const share = it.of ? it.value / it.of : it.value / max;
        return (
          <motion.button
            type="button"
            className={`vx-bar${focus === k ? " focus" : ""}`}
            key={it.label}
            data-cordi={on ? "on" : undefined}
            onPointerEnter={() => setFocus(k)}
            onClick={() => {
              setFocus(focus === k ? null : k);
              tones.tap();
              if (focus !== k) void notify({ type: "focus", label: it.label, value: it.value, fmt: v.fmt, of: it.of });
            }}
            animate={{ opacity: on ? (dim ? 0.35 : 1) : 0, x: on ? 0 : -16 }}
            transition={{ duration: 0.45, ease: EASE }}
            aria-label={`${it.label}: ${fmt(v.fmt, it.value)}${it.of ? ` de ${fmt(v.fmt, it.of)}` : ""}`}
          >
            <span className="vx-bar-label">{it.label}</span>
            <span className="vx-bar-track">
              {it.of !== undefined && <span className="vx-bar-of" style={{ width: `${(it.of / max) * 100}%` }} />}
              <motion.span className={`vx-bar-fill ${t(it.tone)}`} initial={{ width: 0 }} animate={{ width: on ? `${(Math.max(0, it.value) / max) * 100}%` : 0 }} transition={{ ...SPRING, stiffness: 90, damping: 18 }} />
            </span>
            <span className="vx-bar-val">
              {on ? <Num to={it.value} f={v.fmt} /> : fmt(v.fmt, 0)}
              {it.of !== undefined && <small> de {fmt(v.fmt, it.of)}</small>}
            </span>
            <AnimatePresence>
              {focus === k && (
                <motion.span className="vx-bar-more" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  {it.of !== undefined ? `${Math.round(share * 100)}% de lo posible en este tramo` : `${Math.round(share * 100)}% del mayor importe`}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- range
/** A value against what's healthy. The marker can be dragged: "and if I had this much?" */
function Range({ v, p }: { v: Extract<V, { kind: "range" }>; p: number }) {
  const track = useRef<HTMLDivElement>(null);
  const [what, setWhat] = useState<number | null>(null);
  const val = what ?? v.value;
  const pct = (x: number) => Math.max(0, Math.min(100, (x / v.max) * 100));
  const inside = val >= v.lo && val <= v.hi;
  const zoneOn = p > 0.15;
  const dotOn = p > 0.35;
  const pos = useSpring(0, { stiffness: 140, damping: 20 });
  const left = useTransform(pos, (x) => `${x}%`);
  useEffect(() => {
    pos.set(dotOn ? pct(val) : 0);
  }, [dotOn, val]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromPointer = (e: React.PointerEvent) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const step = v.fmt === "months" ? 0.5 : 1;
    setWhat(Math.round((k * v.max) / step) * step);
  };

  return (
    <div className="vx vx-range">
      <div className="vx-range-top">
        <span className="vx-range-label">{v.label}</span>
        <AnimatePresence mode="wait">
          <motion.span key={inside ? "in" : "out"} className={`vx-range-state ${inside ? "t-good" : "t-bad"}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: dotOn ? 1 : 0, y: 0 }} exit={{ opacity: 0, y: 6 }}>
            {inside ? "Dentro de la zona sana" : val < v.lo ? "Por debajo de lo sano" : "Por encima de lo sano"}
          </motion.span>
        </AnimatePresence>
      </div>
      <div
        ref={track}
        className="vx-range-track"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => e.buttons && fromPointer(e)}
        onPointerUp={() => {
          if (what !== null) void notify({ type: "what-if", label: v.label, value: what, real: v.value, lo: v.lo, hi: v.hi, fmt: v.fmt });
        }}
        role="slider"
        aria-label={`${v.label}: prueba otro valor`}
        aria-valuemin={0}
        aria-valuemax={v.max}
        aria-valuenow={val}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (d) {
            e.stopPropagation();
            setWhat(Math.max(0, Math.min(v.max, val + d * (v.fmt === "months" ? 0.5 : 1))));
          }
        }}
      >
        <motion.span className="vx-range-ok" style={{ left: `${pct(v.lo)}%`, width: `${pct(v.hi) - pct(v.lo)}%` }} initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: zoneOn ? 1 : 0, scaleX: zoneOn ? 1 : 0 }} transition={SPRING} />
        {what !== null && <span className="vx-range-real" style={{ left: `${pct(v.value)}%` }} title="Tu dato" />}
        <motion.span data-cordi={dotOn ? "on" : undefined} className={`vx-range-dot ${inside ? "t-good" : "t-bad"}`} style={{ left }} animate={{ opacity: dotOn ? 1 : 0, scale: what !== null ? 1.15 : 1 }}>
          <span className="vx-range-val">{fmt(v.fmt, val)}</span>
        </motion.span>
      </div>
      <div className="vx-range-legend">
        <span>0</span>
        <span className="t-good">
          Zona sana: {fmt(v.fmt, v.lo)} a {fmt(v.fmt, v.hi)}
        </span>
        <span>{fmt(v.fmt, v.max)}</span>
      </div>
      <AnimatePresence mode="wait">
        {what === null ? (
          <motion.p key="hint" className="vx-hint" initial={{ opacity: 0 }} animate={{ opacity: p >= 1 ? 1 : 0 }} exit={{ opacity: 0 }}>
            Arrastra el punto para probar otro valor
          </motion.p>
        ) : (
          <motion.button key="back" type="button" className="vx-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWhat(null)}>
            Volver a tu dato ({fmt(v.fmt, v.value)})
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- score
/**
 * The score as a gauge, 0 to 100: today's score is marked on the scale, and with the step the
 * needle swings on and the points it gains light up in green. The number sits under the gauge,
 * clear of the needle. Flip between "Hoy" and "Con este paso".
 */
const G = { cx: 130, cy: 124, r: 100 };
const at = (k: number) => {
  const a = Math.PI * (1 - Math.max(0, Math.min(100, k)) / 100);
  return [G.cx + G.r * Math.cos(a), G.cy - G.r * Math.sin(a)] as const;
};
const arc = (from: number, to: number) => {
  const [x1, y1] = at(from);
  const [x2, y2] = at(to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${G.r} ${G.r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

/**
 * The gauge's needle, drawn from its angle every frame (rather than rotating an SVG group, whose
 * pivot browsers place inconsistently): a tapered blade from the hub to just inside the scale,
 * with a short tail. It sweeps up from 0 on arrival and settles with a small overshoot.
 */
function Needle({ value }: { value: number }) {
  const v = useSpring(0, { stiffness: 80, damping: 13, mass: 1 });
  useEffect(() => {
    v.set(Math.max(0, Math.min(100, value)));
  }, [value, v]);
  const blade = useTransform(v, (k) => {
    const a = Math.PI * (1 - k / 100);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const len = G.r - 20;
    const tail = 14;
    const half = 3.2;
    const tip = [G.cx + len * c, G.cy - len * sn];
    const back = [G.cx - tail * c, G.cy + tail * sn];
    // perpendicular to the blade, for its width at the hub
    const px = sn * half;
    const py = c * half;
    return `M${tip[0].toFixed(2)} ${tip[1].toFixed(2)} L${(G.cx + px).toFixed(2)} ${(G.cy + py).toFixed(2)} L${back[0].toFixed(2)} ${back[1].toFixed(2)} L${(G.cx - px).toFixed(2)} ${(G.cy - py).toFixed(2)} Z`;
  });
  return <motion.path d={blade} className="vx-dial-needle" />;
}

function Score({ v, p }: { v: Extract<V, { kind: "score" }>; p: number }) {
  const [after, setAfter] = useState(false);
  useEffect(() => {
    if (p > 0.55) setAfter(true);
  }, [p]);
  const value = after ? v.to : v.from;
  const up = v.to - v.from;
  const [tx1, ty1] = at(v.from);
  const tick = (k: number) => {
    const a = Math.PI * (1 - k / 100);
    return { x1: G.cx + (G.r - 16) * Math.cos(a), y1: G.cy - (G.r - 16) * Math.sin(a), x2: G.cx + (G.r + 14) * Math.cos(a), y2: G.cy - (G.r + 14) * Math.sin(a) };
  };
  const today = tick(v.from);
  return (
    <div className="vx vx-score">
      <span className="vx-cap">{v.label}</span>
      <div className="vx-score-body">
        <div className="vx-dial" data-cordi="on">
          <svg viewBox="0 0 260 150" aria-hidden>
            {/* the scale */}
            <path d={arc(0, 100)} className="vx-dial-bg" />
            {[0, 25, 50, 75, 100].map((k) => {
              const m = tick(k);
              return <line key={k} x1={m.x1 + (m.x2 - m.x1) * 0.55} y1={m.y1 + (m.y2 - m.y1) * 0.55} x2={m.x2 - (m.x2 - m.x1) * 0.2} y2={m.y2 - (m.y2 - m.y1) * 0.2} className="vx-dial-tick" />;
            })}
            {/* today's score */}
            <motion.path d={arc(0, Math.max(0.5, v.from))} className="vx-dial-fill t-warn" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: EASE }} />
            {/* what the step adds */}
            {up > 0 && <motion.path d={arc(v.from, v.to)} className="vx-dial-fill t-good" initial={{ pathLength: 0 }} animate={{ pathLength: after ? 1 : 0, opacity: after ? 1 : 0 }} transition={{ duration: 0.9, ease: EASE }} />}
            {/* where "today" is, kept on the scale once the needle moves on */}
            <line {...today} className="vx-dial-today" />
            <text x={tx1} y={ty1 - 22} className="vx-dial-label" textAnchor="middle">
              hoy
            </text>
            <text x={G.cx - G.r} y={G.cy + 22} className="vx-dial-end" textAnchor="middle">
              0
            </text>
            <text x={G.cx + G.r} y={G.cy + 22} className="vx-dial-end" textAnchor="middle">
              100
            </text>
            {/* the needle */}
            <Needle value={value} />
            <circle cx={G.cx} cy={G.cy} r="9" className="vx-dial-hub" />
            <circle cx={G.cx} cy={G.cy} r="3.5" className="vx-dial-pin" />
          </svg>
          <div className="vx-dial-read">
            <span className={`vx-dial-n ${after && up > 0 ? "t-good" : ""}`}>
              <Num to={value} f="pts" />
            </span>
            <span className="vx-dial-of">de 100</span>
          </div>
        </div>
        <div className="vx-score-side">
          <div className="vx-toggle" role="group" aria-label="Comparar la nota">
            <button type="button" className={!after ? "on" : ""} onClick={() => setAfter(false)}>
              Hoy · {v.from}
            </button>
            <button
              type="button"
              className={after ? "on" : ""}
              onClick={() => {
                setAfter(true);
                void notify({ type: "flip", after: true, from: v.from, to: v.to });
              }}
            >
              Con este paso · {v.to}
            </button>
          </div>
          <motion.span className="vx-score-up t-good" animate={{ opacity: after ? 1 : 0, y: after ? 0 : 6 }}>
            {up > 0 ? `+${up} puntos` : "Mantiene la nota y quita un freno"}
          </motion.span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- list
/** A short list, each item as Cordi names it. Items with more to say open on a tap. */
function List({ v, p }: { v: Extract<V, { kind: "list" }>; p: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const n = v.items.length;
  return (
    <ul className={n > 5 ? "vx vx-list many" : "vx vx-list"}>
      {v.items.map((it, k) => {
        const on = p >= (k / n) * 0.85;
        return (
          <motion.li key={k} layout data-cordi={on ? "on" : undefined} animate={{ opacity: on ? 1 : 0, x: on ? 0 : 24 }} transition={{ duration: 0.45, ease: EASE }}>
            <button
              type="button"
              className="vx-list-row"
              onClick={() => {
                if (!it.note) return;
                tones.tap();
                setOpen(open === k ? null : k);
              }}
              aria-expanded={it.note ? open === k : undefined}
            >
              <motion.span className={`vx-list-dot ${t(it.tone)}`} animate={{ scale: on ? [0.4, 1.3, 1] : 0.4 }} transition={{ duration: 0.5 }} />
              <span>{it.text}</span>
              {it.note && <span className="vx-list-more">{open === k ? "−" : "+"}</span>}
            </button>
            <AnimatePresence>
              {it.note && (open === k || n <= 3) && (
                <motion.small initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  {it.note}
                </motion.small>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ul>
  );
}
