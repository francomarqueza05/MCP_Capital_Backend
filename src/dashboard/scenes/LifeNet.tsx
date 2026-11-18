"use client";
import { tr } from "@/lib/lang";
// Life insurance as a safety net under each earner. Every knot is a slice of what the family
// would need if that person were gone; the knots the policy does not pay for are holes.
// Raising the cover knits the holes shut, one by one.
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { short } from "@/lib/copy";
import type { Topic } from "@/data/cases";
import { C, SceneFrame, Slider, tone, VW } from "./kit";

const COLS = 22;
const ROWS = 4;
const CELL = 18;

// deterministic scatter so the holes look like wear, not a progress bar
function order(n: number, seed: number) {
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function Net({ y, name, has, need, seed }: { y: number; name: string; has: number; need: number; seed: number }) {
  const n = COLS * ROWS;
  const ord = useMemo(() => order(n, seed), [n, seed]);
  const covered = Math.round(n * Math.min(1, has / need));
  const rank = useMemo(() => {
    const r = new Array(n);
    ord.forEach((cell, i) => (r[cell] = i));
    return r as number[];
  }, [ord, n]);
  const x0 = (VW - COLS * CELL) / 2;
  const ok = has >= need - 1;
  return (
    <g>
      <text x={x0} y={y - 10} className="svg-label" fill={C.snow}>
        {name}
      </text>
      <text x={x0 + COLS * CELL} y={y - 10} textAnchor="end" className="svg-small" fill={ok ? C.good : C.bad}>
        {ok ? tr(`Covers ${short(need)}, what the family would need`, `Cubre ${short(need)}, lo que necesitaría su familia`) : tr(`Covers ${short(has)} of ${short(need)}`, `Cubre ${short(has)} de ${short(need)}`)}
      </text>
      {Array.from({ length: n }, (_, i) => {
        const cx = x0 + (i % COLS) * CELL;
        const cy = y + Math.floor(i / COLS) * CELL;
        const on = rank[i] < covered;
        return (
          <motion.path
            key={i}
            d={`M${cx},${cy + CELL / 2} L${cx + CELL / 2},${cy} L${cx + CELL},${cy + CELL / 2} L${cx + CELL / 2},${cy + CELL} Z`}
            fill="none"
            stroke={on ? (ok ? C.good : C.lichen) : C.bad}
            strokeDasharray={on ? undefined : "2 4"}
            initial={false}
            animate={{ opacity: on ? 0.95 : 0.32, scale: on ? 1 : 0.7 }}
            transition={{ type: "spring", stiffness: 380, damping: 14, delay: on ? (rank[i] % 30) * 0.008 : 0 }}
            style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
            strokeWidth={1.3}
          />
        );
      })}
    </g>
  );
}

export function LifeNet({ t }: { t: Topic }) {
  const n = t.numbers as { people?: { name: string; has: number; need: number }[] };
  const people = n.people ?? [];
  const missing = people.reduce((a, p) => a + Math.max(0, p.need - p.has), 0);
  const [extra, setExtra] = useState(0);
  const rows = people.length;
  const block = ROWS * CELL + 44;
  const y0 = Math.max(36, (240 - rows * block) / 2 + 30);
  return (
    <SceneFrame
      title={missing ? (extra >= missing ? tr("With that cover, the net holds", "Con esa cobertura, la red aguanta") : tr("If you were gone, the net has holes", "Si faltaras, la red tiene agujeros")) : tr("Your family's net is whole", "La red de tu familia está entera")}
      sub={tr("Each diamond is part of what your family would need to carry on. The holes are what insurance wouldn't pay.", "Cada rombo es una parte de lo que tu familia necesitaría para seguir adelante. Los agujeros son lo que el seguro no pagaría.")}
      colour={missing && extra < missing ? tone(t.status) : C.good}
      controls={
        missing > 0 && (
          <Slider label={tr("Raise the cover", "Subir la cobertura")} min={0} max={missing} step={10000} value={extra} onChange={setExtra} format={(v) => `+${short(v)}`} />
        )
      }
    >
      {people.map((p, i) => {
        const add = missing ? (extra * Math.max(0, p.need - p.has)) / missing : 0;
        return <Net key={p.name} y={y0 + i * block} name={p.name} has={p.has + add} need={p.need} seed={17 + i * 31} />;
      })}
    </SceneFrame>
  );
}
