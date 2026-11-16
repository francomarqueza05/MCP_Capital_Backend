"use client";
// College savings as one glass jar per child. The liquid rises with a spring and its surface
// keeps moving, so a full jar still feels alive. The line marks what the degree will cost.
import { motion, useAnimationFrame, useMotionValue, useTransform } from "motion/react";
import { useState } from "react";
import { money, short } from "@/lib/copy";
import type { Case, Topic } from "@/data/cases";
import { C, SceneFrame, Slider, useBuild, useFollow } from "./kit";

const JW = 120;
const JH = 160;
const TOP = 46;

function Jar({ x, name, share, per, phase }: { x: number; name: string; share: ReturnType<typeof useFollow>; per: number; phase: number }) {
  const t = useMotionValue(0);
  useAnimationFrame((ms) => t.set(ms / 1000));
  const surface = useTransform([share, t], ([k, s]: number[]) => {
    const level = TOP + JH - JH * Math.min(1, k);
    const amp = k > 0.001 ? 3.2 : 0;
    let d = `M${x + 4},${level}`;
    for (let i = 0; i <= 24; i++) {
      const px = x + 4 + ((JW - 8) * i) / 24;
      d += ` L${px},${level + Math.sin(i / 3.2 + s * 2.4 + phase) * amp}`;
    }
    return `${d} L${x + JW - 4},${TOP + JH - 4} L${x + 4},${TOP + JH - 4} Z`;
  });
  const pct = useTransform(share, (k) => `${Math.round(Math.min(1, k) * 100)}%`);
  const clip = `jar-${name.replace(/\W/g, "")}`;
  return (
    <g>
      <clipPath id={clip}>
        <rect x={x} y={TOP} width={JW} height={JH} rx={22} />
      </clipPath>
      <rect x={x} y={TOP} width={JW} height={JH} rx={22} fill={C.faint} />
      <motion.path d={surface} fill={C.warn} opacity={0.85} clipPath={`url(#${clip})`} />
      <rect x={x} y={TOP} width={JW} height={JH} rx={22} fill="none" stroke={C.lichen} strokeOpacity={0.5} strokeWidth={1.5} />
      <rect x={x + 14} y={TOP + 14} width={6} height={JH * 0.55} rx={3} fill={C.snow} opacity={0.12} />
      <motion.text x={x + JW / 2} y={TOP + JH / 2 + 8} textAnchor="middle" className="svg-figure">
        {pct}
      </motion.text>
      <text x={x + JW / 2} y={TOP + JH + 22} textAnchor="middle" className="svg-label" fill={C.snow}>
        {name}
      </text>
      <text x={x + JW / 2} y={TOP + JH + 38} textAnchor="middle" className="svg-small">
        {`de ${short(per)}`}
      </text>
    </g>
  );
}

export function Education({ t, c }: { t: Topic; c: Case }) {
  const n = t.numbers as { gap: number; extraSave: number; need: number; have: number };
  const kids = c.household.kids.length ? c.household.kids : ["Hijos"];
  const [extra, setExtra] = useState(0);
  const base = n.need ? n.have / n.need : 0;
  const target = n.extraSave > 0 ? Math.min(1, base + ((1 - base) * extra) / n.extraSave) : base;
  const build = useBuild(0.2, 1);
  const s = useFollow(target, { stiffness: 60, damping: 11, mass: 1 });
  const share = useTransform([s, build], ([v, k]: number[]) => v * k);
  const per = n.need / kids.length;
  const gapW = kids.length * JW + (kids.length - 1) * 60;
  const x0 = (560 - gapW) / 2;
  return (
    <SceneFrame
      title={target >= 0.999 ? "Con ese aporte, la universidad queda cubierta" : `Para la universidad faltan ${short(n.gap)}`}
      sub={n.have ? `Hay ${short(n.have)} ahorrados de los ${short(n.need)} que costará, en dinero de hoy.` : `Hoy no hay nada ahorrado para la universidad, y costará ${short(n.need)} en dinero de hoy.`}
      colour={target >= 0.999 ? C.good : C.warn}
      controls={
        n.extraSave > 0 ? (
          <Slider label="Aporte extra al año" min={0} max={Math.ceil((n.extraSave * 1.5) / 100) * 100} step={50} value={extra} onChange={setExtra} format={(v) => money(v)} />
        ) : (
          <p className="scene-note">Con lo que entra hoy no queda margen para aportar: primero hay que cuadrar el dinero de cada año.</p>
        )
      }
    >
      {kids.map((k, i) => (
        <Jar key={k} x={x0 + i * (JW + 60)} name={k} share={share as ReturnType<typeof useFollow>} per={per} phase={i * 1.7} />
      ))}
      <line x1={x0 - 20} x2={x0 + gapW + 20} y1={TOP} y2={TOP} stroke={C.lichen} strokeDasharray="3 4" opacity={0.6} />
      <text x={x0 + gapW + 24} y={TOP + 4} className="svg-small">
        coste
      </text>
    </SceneFrame>
  );
}
