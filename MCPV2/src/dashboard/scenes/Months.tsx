"use client";
// The cushion, counted in months of expenses. Each month is a block that drops into place with
// weight; the recommended range is marked as empty slots waiting to be filled. For a big
// purchase that empties the cushion, the purchase arrives and knocks the blocks out.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { money, num } from "@/lib/copy";
import type { Topic } from "@/data/cases";
import { clamp } from "@/lib/store";
import { C, Pill, SceneFrame, tone, VW } from "./kit";

const GAP = 8;
const PER_ROW = 12;
const sizeFor = (total: number) => {
  const per = Math.min(total, PER_ROW);
  return Math.min(46, Math.floor((VW - (per - 1) * GAP) / per));
};

function layout(total: number) {
  const per = Math.min(total, PER_ROW);
  const SIZE = sizeFor(total);
  const x0 = (VW - (per * SIZE + (per - 1) * GAP)) / 2;
  return (i: number) => ({ x: x0 + (i % PER_ROW) * (SIZE + GAP), y: 70 + Math.floor(i / PER_ROW) * (SIZE + GAP) });
}

function Blocks({ months, total, min, max, knocked = -1 }: { months: number; total: number; min: number; max: number; knocked?: number }) {
  const at = layout(total);
  const SIZE = sizeFor(total);
  const filled = Math.ceil(months);
  const a = at(min - 1);
  const b = at(max - 1);
  const showIdeal = min >= 1 && max <= total;
  return (
    <g>
      {Array.from({ length: total }, (_, i) => {
        const p = at(i);
        const ideal = showIdeal && i >= min - 1 && i <= max - 1;
        return <rect key={`s${i}`} x={p.x} y={p.y} width={SIZE} height={SIZE} rx={6} fill="none" stroke={ideal ? C.lichen : C.dim} strokeDasharray={ideal ? "3 3" : undefined} />;
      })}
      {showIdeal && a.y === b.y && (
        <g>
          <path d={`M${a.x},${a.y - 9} v-6 H${b.x + SIZE} v6`} fill="none" stroke={C.lichen} />
          <text x={(a.x + b.x + SIZE) / 2} y={a.y - 21} textAnchor="middle" className="svg-label">
            {min === max ? `Lo recomendado: ${min} meses` : `Lo recomendado: ${min} a ${max} meses`}
          </text>
        </g>
      )}
      <AnimatePresence>
        {Array.from({ length: filled }, (_, i) => {
          const p = at(i);
          const part = clamp(months - i, 0, 1);
          const colour = i >= max ? C.warn : months < min ? C.bad : C.good;
          if (knocked >= 0 && i >= knocked) return null;
          return (
            <motion.rect
              key={`b${i}`}
              x={p.x}
              y={p.y}
              height={SIZE}
              rx={6}
              fill={colour}
              initial={{ y: -150, opacity: 0, width: SIZE * part }}
              animate={{ y: 0, opacity: 1, width: SIZE * part }}
              exit={{ y: 130 + (i % 3) * 22, x: 50 + i * 7, rotate: 40 + (i % 4) * 25, opacity: 0, transition: { duration: 0.75, ease: [0.5, 0, 0.9, 0.5], delay: (filled - i) * 0.05 } }}
              transition={{ type: "spring", stiffness: 420, damping: 17, mass: 0.9, delay: 0.15 + i * 0.07 }}
              style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
            />
          );
        })}
      </AnimatePresence>
    </g>
  );
}

export function Months({ t }: { t: Topic }) {
  const n = t.numbers as { months: number; min: number; max: number };
  const total = clamp(Math.max(Math.ceil(n.months), n.max) + 1, 6, 24);
  const short = n.min - n.months;
  const over = n.months - n.max;
  const rows = Math.ceil(total / PER_ROW);
  return (
    <SceneFrame
      title={`Si dejas de cobrar, aguantas ${num(n.months, 1)} meses`}
      sub={short > 0 ? `Te faltan ${num(short, 1)} meses para llegar a lo mínimo recomendado.` : over > 0 ? `Tienes ${num(over, 1)} meses de más: dinero parado que podría trabajar para ti.` : "Estás justo en el rango recomendado."}
      colour={tone(t.status)}
    >
      <Blocks months={n.months} total={total} min={n.min} max={n.max} />
      <Legend y={70 + rows * (sizeFor(total) + GAP) + 30} />
    </SceneFrame>
  );
}

export function NearGoal({ t }: { t: Topic }) {
  const n = t.numbers as { months: number; after: number; goal?: string; amount?: number; when?: string };
  const total = Math.max(Math.ceil(n.months), 6);
  const [hit, setHit] = useState(false);
  const [run, setRun] = useState(0);
  useEffect(() => {
    setHit(false);
    const id = setTimeout(() => setHit(true), 2300);
    return () => clearTimeout(id);
  }, [run]);
  const goal = n.goal ?? "Un gasto grande";
  return (
    <SceneFrame
      title={`${goal} vacía tu colchón`}
      sub={`Hoy cubres ${num(n.months, 1)} meses de gastos. Después del pago${n.when ? ` de ${n.when}` : ""}, te quedarían ${num(n.after, 1)}.`}
      colour={C.bad}
      controls={
        <button
          className="btn btn-line btn-small"
          onClick={(e) => {
            e.stopPropagation();
            setRun((r) => r + 1);
          }}
        >
          Verlo otra vez
        </button>
      }
    >
      <g key={run}>
        <Blocks months={n.months} total={total} min={0} max={99} knocked={hit ? Math.ceil(n.after) : -1} />
        <motion.g initial={{ x: VW + 140 }} animate={{ x: hit ? 300 : VW + 140 }} transition={{ type: "spring", stiffness: 140, damping: 16 }}>
          <Pill x={0} y={66} text={`${goal}: −${money(n.amount ?? 0)}`} colour={C.bad} />
        </motion.g>
      </g>
    </SceneFrame>
  );
}

function Legend({ y }: { y: number }) {
  const items: [string, string][] = [
    [C.bad, "Por debajo de lo mínimo"],
    [C.good, "Dentro de lo recomendado"],
    [C.warn, "Parado de más"],
  ];
  return (
    <g>
      {items.map(([c, l], i) => (
        <g key={l} transform={`translate(${30 + i * 190} ${y})`}>
          <rect width={10} height={10} rx={3} fill={c} y={-9} />
          <text x={16} className="svg-small">
            {l}
          </text>
        </g>
      ))}
    </g>
  );
}
