"use client";
import { tr } from "@/lib/lang";
// The mix of investments as a balance. On the left, what is in shares (grows more, swings
// more); on the right, the steadier part. The beam is level when the mix matches what fits the
// family. It is a real pendulum: drag the mix and it swings, overshoots, then settles.
import { motion, useTransform, type MotionValue } from "motion/react";
import { useState } from "react";
import type { Topic } from "@/data/cases";
import { clamp } from "@/lib/store";
import { C, SceneFrame, Slider, useBuild, useFollow, VW } from "./kit";

export function Investments({ t }: { t: Topic }) {
  const n = t.numbers as { equity: number; target: number; leveraged?: string };
  if (n.leveraged) return <Leveraged fund={n.leveraged} />;
  return <Balance equity={n.equity} target={n.target} />;
}

function Balance({ equity, target }: { equity: number; target: number }) {
  const [eq, setEq] = useState(equity);
  const tilt = clamp((eq - target) * 1.6, -24, 24);
  const build = useBuild(0.3, 0.01);
  const a = useFollow(tilt, { stiffness: 60, damping: 5.5, mass: 1.4 });
  const angle = useTransform([a, build], ([v, k]: number[]) => v * k);
  const cx = VW / 2;
  const pivot = 70;
  const arm = 170;
  // pans hang straight down from the ends of the beam
  const lx = useTransform(angle, (d) => cx - arm * Math.cos((d * Math.PI) / 180));
  const ly = useTransform(angle, (d) => pivot + arm * Math.sin((d * Math.PI) / 180));
  const rx = useTransform(angle, (d) => cx + arm * Math.cos((d * Math.PI) / 180));
  const ry = useTransform(angle, (d) => pivot - arm * Math.sin((d * Math.PI) / 180));
  const beam = useTransform(angle, (d) => -d);
  const diff = eq - target;
  const level = Math.abs(diff) < 5;
  const colour = level ? C.good : C.warn;
  return (
    <SceneFrame
      title={level ? tr("Your money is in balance", "Tu dinero está en equilibrio") : diff < 0 ? tr("Your money is sitting stiller than it should", "Tu dinero está más quieto de lo que te toca") : tr("You're taking more risk than fits you", "Tienes más riesgo del que te toca")}
      sub={tr(`Today you have ${equity}% in stocks. For your age and goals, the right mix is ${target}%.`, `Hoy tienes un ${equity}% en acciones. Para tu edad y tus metas, lo que encaja es un ${target}%.`)}
      colour={colour}
      controls={<Slider label={tr("In stocks", "En acciones")} min={Math.min(equity, target) - 15} max={Math.max(equity, target) + 15} value={eq} onChange={setEq} format={(v) => `${v}%`} />}
    >
      <path d={`M${cx - 40},${236} L${cx},${pivot + 6} L${cx + 40},${236} Z`} fill={C.slate2} stroke={C.lichen} strokeOpacity={0.3} />
      <motion.g style={{ rotate: beam, x: cx, y: pivot }}>
        <rect x={-arm - 6} y={-4} width={arm * 2 + 12} height={8} rx={4} fill={C.lichen} />
      </motion.g>
      <circle cx={cx} cy={pivot} r={8} fill={C.snow} />
      <Pan x={lx} y={ly} share={eq} label={tr("In stocks", "En acciones")} colour={C.dawn} />
      <Pan x={rx} y={ry} share={100 - eq} label={tr("Steadier assets", "Lo más estable")} colour={C.lichen} />
      <text x={cx} y={8} textAnchor="middle" className="svg-label" fill={colour}>
        {level ? tr("Practically level", "Prácticamente nivelado") : diff < 0 ? tr(`${Math.round(-diff)} points short in stocks`, `Faltan ${Math.round(-diff)} puntos en acciones`) : tr(`${Math.round(diff)} points too many in stocks`, `Sobran ${Math.round(diff)} puntos en acciones`)}
      </text>
    </SceneFrame>
  );
}

function Pan({ x, y, share, label, colour }: { x: MotionValue<number>; y: MotionValue<number>; share: number; label: string; colour: string }) {
  const h = 18 + share * 0.5;
  return (
    <motion.g style={{ x, y }}>
      <line x1={-34} y1={46} x2={0} y2={0} stroke={C.lichen} strokeOpacity={0.5} />
      <line x1={34} y1={46} x2={0} y2={0} stroke={C.lichen} strokeOpacity={0.5} />
      <path d="M-48,46 H48 Q40,62 0,62 Q-40,62 -48,46 Z" fill={C.slate2} stroke={C.lichen} strokeOpacity={0.4} />
      <motion.rect x={-22} width={44} rx={6} fill={colour} animate={{ y: 46 - h, height: h }} transition={{ type: "spring", stiffness: 200, damping: 18 }} />
      <text y={84} textAnchor="middle" className="svg-label" fill={C.snow}>
        {`${share}%`}
      </text>
      <text y={100} textAnchor="middle" className="svg-small">
        {label}
      </text>
    </motion.g>
  );
}

function Leveraged({ fund }: { fund: string }) {
  const build = useBuild(0.2, 2.2);
  const X = 24;
  const Y = 96;
  const PW = VW - 48;
  const drop = (x: number) => -Math.sin(clamp(x, 0, 1) * Math.PI) * 10;
  const line = (k: number, mult: number) =>
    "M" +
    Array.from({ length: 60 }, (_, i) => {
      const x = (i / 59) * k;
      return `${X + x * PW},${Y - drop(x) * mult * 4.4}`;
    }).join(" L");
  const market = useTransform(build, (k) => line(k, 1));
  const lev = useTransform(build, (k) => line(k, 3));
  const op = useTransform(build, [0.45, 0.6], [0, 1]);
  return (
    <SceneFrame title={tr(`${fund} triples the falls`, `${fund} multiplica las caídas por tres`)} sub={tr("If the market falls 10%, this fund falls about 30%. And it needs to rise much more to recover.", "Si el mercado cae un 10%, este fondo cae alrededor de un 30%. Y para recuperarse necesita subir mucho más.")} colour={C.bad}>
      <line x1={X} y1={Y} x2={X + PW} y2={Y} stroke={C.dim} strokeDasharray="3 4" />
      <text x={X} y={Y - 10} className="svg-small">
        {tr("today", "hoy")}
      </text>
      <motion.path d={market} fill="none" stroke={C.lichen} strokeWidth={3} strokeLinecap="round" />
      <motion.path d={lev} fill="none" stroke={C.bad} strokeWidth={3} strokeLinecap="round" />
      <motion.g style={{ opacity: op }}>
        <text x={X + PW * 0.5} y={Y + 44 + 26} textAnchor="middle" className="svg-label">
          {tr("Market, −10%", "Mercado, −10%")}
        </text>
        <text x={X + PW * 0.5} y={Y + 132 + 26} textAnchor="middle" className="svg-label" fill={C.bad}>
          {`${fund}, −30%`}
        </text>
      </motion.g>
    </SceneFrame>
  );
}
