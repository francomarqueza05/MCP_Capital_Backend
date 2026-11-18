"use client";
import { tr } from "@/lib/lang";
// Retirement, three ways depending on what the plan says:
//   a gap      two mountains: the one you need to climb and the one your savings build;
//   a run-out  the savings line from the day you retire down to the age it reaches zero;
//   a draw     a gauge of how much you take out each year, with a needle that has weight.
import { motion, useTransform } from "motion/react";
import { useState } from "react";
import { money, short } from "@/lib/copy";
import type { Topic } from "@/data/cases";
import { clamp } from "@/lib/store";
import { C, SceneFrame, Slider, useBuild, useFollow, VH, VW } from "./kit";
import { Praise } from "./Praise";

type N = { gap: number; extraSave: number; runOut: string; draw: number; incomeShare: number; retireAge: number; projected: number };

export function Retirement({ t }: { t: Topic }) {
  const n = t.numbers as N;
  if (n.runOut !== "Not applicable") return <RunOut n={n} />;
  if (n.gap > 0) return <TwoMountains n={n} />;
  if (n.draw > 6) return <Gauge n={n} />;
  return <Praise t={t} />;
}

function peak(cx: number, base: number, h: number, w: number) {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const top = base - h;
  // a mountain with a shoulder, not a triangle
  return `M${l},${base} L${cx - w * 0.22},${base - h * 0.55} L${cx - w * 0.12},${base - h * 0.62} L${cx},${top} L${cx + w * 0.16},${base - h * 0.7} L${cx + w * 0.24},${base - h * 0.6} L${r},${base} Z`;
}

function TwoMountains({ n }: { n: N }) {
  const need = n.projected + n.gap;
  const [extra, setExtra] = useState(0);
  const have = n.projected + n.gap * Math.min(1, extra / n.extraSave);
  const haveS = useFollow(have, { stiffness: 120, damping: 14, mass: 1 });
  const build = useBuild(0.1, 1.4);
  const base = VH - 30;
  const maxH = 180;
  const hOf = (v: number) => (maxH * v) / need;
  const needPath = useTransform(build, (k) => peak(170, base, hOf(need) * k, 250));
  const havePath = useTransform([haveS, build], ([v, k]: number[]) => peak(390, base, hOf(v) * k, 250));
  const haveTop = useTransform([haveS, build], ([v, k]: number[]) => base - hOf(v) * k);
  const needTop = base - hOf(need);
  const done = have >= need - 1;
  const gapY = useTransform(haveTop, (y) => (needTop + y) / 2);
  const haveLabelY = useTransform(haveTop, (y) => y - 12);
  return (
    <SceneFrame
      title={done ? tr("With that saving, you reach the summit", "Con ese ahorro, llegas a la cima") : tr(`To retire at ${n.retireAge} you're ${short(n.gap)} short`, `Para jubilarte a los ${n.retireAge} te faltan ${short(n.gap)}`)}
      sub={tr(`What you'll need against what you'll have, in today's dollars. Sherpas works out that ${money(n.extraSave)} more a year gets you there.`, `Lo que necesitarás frente a lo que tendrás, en dinero de hoy. Sherpas calcula que con ${money(n.extraSave)} más al año llegarías.`)}
      colour={done ? C.good : C.bad}
      controls={<Slider label={tr("Extra saved a year", "Ahorro extra al año")} min={0} max={Math.ceil((n.extraSave * 1.2) / 1000) * 1000} step={500} value={extra} onChange={setExtra} format={(v) => money(v)} />}
    >
      <line x1={0} x2={VW} y1={base} y2={base} stroke={C.dim} />
      <motion.path d={needPath} fill="url(#hatch-l)" stroke={C.lichen} strokeDasharray="4 4" />
      <motion.path d={havePath} fill={done ? C.good : C.slate2} stroke={done ? C.good : C.lichen} strokeWidth={1.5} />
      {/* the height you are missing, measured against the first mountain */}
      {!done && (
        <motion.g>
          <motion.line x1={300} x2={480} y1={needTop} y2={needTop} stroke={C.bad} strokeDasharray="3 4" />
          <motion.text x={488} y={gapY} className="svg-small" fill={C.bad}>
            {`faltan ${short(need - have)}`}
          </motion.text>
        </motion.g>
      )}
      <text x={170} y={needTop - 12} textAnchor="middle" className="svg-figure">
        {short(need)}
      </text>
      <motion.text x={390} y={haveLabelY} textAnchor="middle" className="svg-figure" fill={done ? C.good : C.snow}>
        {short(have)}
      </motion.text>
      <text x={170} y={base + 20} textAnchor="middle" className="svg-label">
        {tr("What you'll need", "Lo que necesitarás")}
      </text>
      <text x={390} y={base + 20} textAnchor="middle" className="svg-label">
        {tr("What you'll have", "Lo que tendrás")}
      </text>
    </SceneFrame>
  );
}

function RunOut({ n }: { n: N }) {
  const from = n.retireAge;
  const to = +n.runOut;
  const end = Math.max(to + 10, 90);
  const X = 40;
  const Y = 30;
  const PW = VW - X - 16;
  const PH = 170;
  const xOf = (age: number) => X + (PW * (age - from)) / (end - from);
  const curve = (a: number) => (a >= to ? 0 : Math.pow(1 - (a - from) / (to - from), 0.8));
  const build = useBuild(0.2, 3.2);
  const pts = (k: number) => {
    const a = from + (end - from) * k;
    const out: [number, number][] = [];
    for (let x = from; x <= a; x += 0.25) out.push([xOf(x), Y + PH * (1 - curve(x))]);
    return out;
  };
  const line = useTransform(build, (k) => {
    const p = pts(k);
    return p.length ? "M" + p.map((q) => q.join(",")).join(" L") : "";
  });
  const area = useTransform(build, (k) => {
    const p = pts(k);
    return p.length > 1 ? `M${X},${Y + PH} L${p.map((q) => q.join(",")).join(" L")} L${p.at(-1)![0]},${Y + PH} Z` : "";
  });
  const dot = useTransform(build, (k) => pts(k).at(-1) ?? [X, Y]);
  const dx = useTransform(dot, (d) => d[0]);
  const dy = useTransform(dot, (d) => d[1]);
  const ly = useTransform(dy, (y) => y - 14);
  const ageLabel = useTransform(build, (k) => `${Math.floor(from + (end - from) * k)} ${tr("yrs", "años")}`);
  const zeroW = useTransform(build, (k) => Math.max(0, xOf(Math.max(to, from + (end - from) * k)) - xOf(to)));
  const step = Math.max(2, Math.round((end - from) / 6));
  return (
    <SceneFrame title={tr(`Your savings run out at ${to}`, `Tus ahorros se acaban a los ${to} años`)} sub={tr(`This is how your money falls from when you retire, at ${from}. From ${to} on, you'd live on your pension alone.`, `Así baja tu dinero desde que te jubilas, a los ${from}. A partir de los ${to}, vivirías solo de la pensión.`)} colour={C.bad}>
      <line x1={X} y1={Y + PH} x2={X + PW} y2={Y + PH} stroke={C.dim} />
      {Array.from({ length: Math.floor((end - from) / step) + 1 }, (_, i) => from + i * step).map((age) => (
        <text key={age} x={xOf(age)} y={Y + PH + 18} textAnchor="middle" className="svg-small">
          {age}
        </text>
      ))}
      <rect x={xOf(to)} y={Y} width={X + PW - xOf(to)} height={PH} fill="url(#hatch)" opacity={0.6} />
      <text x={xOf(to) + 8} y={Y + 14} className="svg-small" fill={C.bad}>
        {tr("no savings", "sin ahorros")}
      </text>
      <motion.path d={area} fill="url(#v-warn)" />
      <motion.path d={line} fill="none" stroke={C.warn} strokeWidth={3} strokeLinecap="round" />
      <motion.rect x={xOf(to)} y={Y + PH - 2} height={4} rx={2} fill={C.bad} width={zeroW} />
      <motion.circle r={6} fill={C.snow} cx={dx} cy={dy} />
      <motion.text x={dx} y={ly} textAnchor="middle" className="svg-label" fill={C.snow}>
        {ageLabel}
      </motion.text>
    </SceneFrame>
  );
}

function Gauge({ n }: { n: N }) {
  const max = Math.max(14, Math.ceil(n.draw + 2));
  const [d, setD] = useState(n.draw);
  const build = useBuild(0.2, 0.01);
  const dS = useFollow(d, { stiffness: 140, damping: 9, mass: 1.2 });
  const cx = VW / 2;
  const cy = 210;
  const R = 150;
  const point = (v: number, r = R) => {
    const ang = Math.PI * (1 - clamp(v, 0, max) / max);
    return [cx + r * Math.cos(ang), cy - r * Math.sin(ang)];
  };
  const arc = (a: number, b: number) => {
    const [x0, y0] = point(a);
    const [x1, y1] = point(b);
    return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`;
  };
  const nx = useTransform([dS, build], ([v, k]: number[]) => point(v * k, R - 30)[0]);
  const ny = useTransform([dS, build], ([v, k]: number[]) => point(v * k, R - 30)[1]);
  return (
    <SceneFrame
      title={tr(`You draw ${n.draw}% of your savings a year`, `Sacas un ${n.draw}% de tus ahorros al año`)}
      sub={tr("Up to 6% a year can usually be sustained. Above that, the money runs out sooner.", "Hasta un 6% al año suele poder sostenerse. Por encima, el dinero se agota antes.")}
      colour={C.warn}
      controls={<Slider label={tr("Draw a year", "Sacar al año")} min={2} max={Math.ceil(n.draw)} step={0.5} value={d} onChange={setD} format={(v) => `${v}%`} />}
    >
      <path d={arc(0, 6)} fill="none" stroke={C.good} strokeWidth={16} />
      <path d={arc(6, 8)} fill="none" stroke={C.warn} strokeWidth={16} />
      <path d={arc(8, max)} fill="none" stroke={C.bad} strokeWidth={16} />
      <motion.line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.snow} strokeWidth={4} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={9} fill={C.snow} />
      <text x={cx} y={cy + 34} textAnchor="middle" className="svg-figure" fill={d <= 6 ? C.good : C.bad}>
        {`${d}% ${tr("a year", "al año")}`}
      </text>
    </SceneFrame>
  );
}

