"use client";
import { tr } from "@/lib/lang";
// Liability cover. A lawsuit falls toward what the family owns (home, car, savings). Without
// the policy it lands and takes a piece; with it, an umbrella catches it and it breaks apart.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { short } from "@/lib/copy";
import type { Topic } from "@/data/cases";
import { C, SceneFrame, Toggle, useTicker, VH } from "./kit";

const GROUND = VH - 40;
const ASSETS = [
  { id: "house", x: 150, get label() { return tr("Home", "Casa"); } },
  { id: "car", x: 280, get label() { return tr("Car", "Coche"); } },
  { id: "savings", x: 410, get label() { return tr("Savings", "Ahorros"); } },
];

function Asset({ id, x, hit }: { id: string; x: number; hit: boolean }) {
  return (
    <motion.g
      animate={hit ? { x: [x, x - 5, x + 5, x - 3, x], opacity: [1, 1, 1, 1, 0.38] } : { x, opacity: 1 }}
      transition={hit ? { duration: 0.45 } : { duration: 0.6 }}
      style={{ y: GROUND }}
    >
      {id === "house" && (
        <>
          <path d="M-30,0 V-30 L0,-54 L30,-30 V0 Z" fill={C.lichen} />
          <rect x={-7} y={-18} width={14} height={18} fill={C.slate} />
        </>
      )}
      {id === "car" && (
        <>
          <path d="M-38,-8 V-22 H-24 L-14,-36 H14 L26,-22 H38 V-8 Z" fill={C.lichen} />
          <circle cx={-20} cy={-6} r={8} fill={C.snow} />
          <circle cx={20} cy={-6} r={8} fill={C.snow} />
        </>
      )}
      {id === "savings" && (
        <>
          <rect x={-26} y={-44} width={52} height={44} rx={10} fill={C.lichen} />
          <text y={-15} textAnchor="middle" className="svg-figure" fill={C.slate}>
            $
          </text>
        </>
      )}
    </motion.g>
  );
}

export function Umbrella({ t }: { t: Topic }) {
  const n = t.numbers as { recommended?: number; current?: number };
  const [on, setOn] = useState(!n.recommended);
  const tick = useTicker(2600);
  const target = ASSETS[tick % ASSETS.length];
  const [landed, setLanded] = useState<string | null>(null);
  useEffect(() => {
    setLanded(null);
    const id = setTimeout(() => setLanded(target.id), 900);
    return () => clearTimeout(id);
  }, [tick, target.id]);
  const stopY = on ? 92 : GROUND - 60;
  const struck = !on && landed === target.id;
  return (
    <SceneFrame
      title={on ? tr("If you're sued, the insurance answers for you", "Si te demandan, el seguro responde por ti") : tr("A lawsuit could reach what you own", "Una demanda podría llegar a lo que tienes")}
      sub={n.recommended ? tr(`Home and car insurance cover little against a big lawsuit. Sherpas recommends ${short(n.recommended)} of cover.`, `El seguro de casa y coche cubre poco ante una demanda grande. Sherpas recomienda ${short(n.recommended)} de cobertura.`) : tr(`You have ${short(n.current ?? 0)} of umbrella cover.`, `Tienes ${short(n.current ?? 0)} de cobertura ante demandas.`)}
      colour={on ? C.good : C.bad}
      controls={n.recommended ? <Toggle on={on} onChange={setOn} labels={[tr("Without it", "Sin el seguro"), tr("With it", "Con el seguro")]} /> : undefined}
    >
      <line x1={40} x2={520} y1={GROUND} y2={GROUND} stroke={C.dim} />
      <motion.path
        d="M110,120 Q280,10 450,120"
        fill="none"
        stroke={C.good}
        strokeWidth={6}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 90, damping: 16 }}
      />
      {on && <line x1={280} x2={280} y1={66} y2={GROUND - 64} stroke={C.good} strokeWidth={2} opacity={0.5} />}
      {ASSETS.map((a) => (
        <Asset key={a.id} id={a.id} x={a.x} hit={struck && a.id === target.id} />
      ))}
      <AnimatePresence>
        <motion.g
          key={tick}
          initial={{ x: target.x - 70, y: -30, opacity: 0 }}
          animate={{ x: target.x, y: stopY, opacity: 1 }}
          exit={on ? { y: stopY - 40, x: target.x - 60, opacity: 0, scale: 0.4 } : { opacity: 0 }}
          transition={{ type: "spring", stiffness: 70, damping: 13 }}
        >
          <path d="M-8,-26 L6,-26 L-2,-6 L10,-6 L-10,22 L-4,0 L-14,0 Z" fill={C.bad} />
          <text x={16} y={-8} className="svg-small" fill={C.bad}>
            {tr("Lawsuit", "Demanda")}
          </text>
        </motion.g>
      </AnimatePresence>
      <AnimatePresence>
        {on && landed === target.id && (
          <motion.g key={`s${tick}`} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.8 }}>
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <motion.circle
                  key={i}
                  r={2.4}
                  fill={i % 2 ? C.good : C.snow}
                  initial={{ cx: target.x, cy: stopY }}
                  animate={{ cx: target.x + Math.cos(a) * 34, cy: stopY + Math.sin(a) * 22 - 10 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              );
            })}
          </motion.g>
        )}
        {struck && (
          <motion.text key={`h${tick}`} x={target.x} textAnchor="middle" className="svg-figure" fill={C.bad} initial={{ y: GROUND - 70, opacity: 0 }} animate={{ y: GROUND - 100, opacity: 1 }} exit={{ opacity: 0 }}>
            −$
          </motion.text>
        )}
      </AnimatePresence>
    </SceneFrame>
  );
}
