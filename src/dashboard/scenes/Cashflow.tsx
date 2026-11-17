"use client";
// The year's money as a river. What comes in enters on the left and splits: what goes out
// (spending, taxes, saving) bends down; what is left over rises to the right. When more goes
// out than comes in, a red stream is pulled from savings to make up the difference.
import { motion, useTransform } from "motion/react";
import { useState } from "react";
import { money, short } from "@/lib/copy";
import type { Topic } from "@/data/cases";
import { band, C, mid, SceneFrame, Slider, useBuild, useFollow, VH, VW } from "./kit";

export function Cashflow({ t }: { t: Topic }) {
  const n = t.numbers as { flow: number; income: number };
  const income = n.income;
  const out0 = income - n.flow;
  const deficit = n.flow < 0;
  const [cut, setCut] = useState(0);
  const out = out0 - cut * 12;
  const flowNow = income - out;
  const outS = useFollow(out);
  const build = useBuild(0.1, 1.3);

  const H = 128; // pixels for the larger of in / out
  const scale = H / Math.max(income, out0);
  const cy = 120;
  const x0 = 24;
  const xs = 210;
  const x1 = VW - 24;

  // geometry as motion values so the river reshapes with weight while dragging
  const geo = useTransform([outS, build], ([o, b]: number[]) => {
    const hin = income * scale * b;
    const hout = Math.max(0, o) * scale * b;
    const keep = Math.max(0, hin - hout);
    const fromSavings = Math.max(0, hout - hin);
    const top = cy - hin / 2;
    return { hin, hout, keep, fromSavings, top };
  });
  const inPath = useTransform(geo, (g) => `M${x0},${g.top} L${xs},${g.top} L${xs},${g.top + g.hin} L${x0},${g.top + g.hin} Z`);
  const keepPath = useTransform(geo, (g) => (g.keep > 0.5 ? band(xs, g.top, g.top + g.keep, x1, 34, 34 + g.keep) : ""));
  const outPath = useTransform(geo, (g) => {
    const t0 = g.top + g.keep;
    const ob = VH - 16;
    return band(xs, t0, t0 + Math.min(g.hout, g.hin), x1, ob - g.hout, ob - g.hout + Math.min(g.hout, g.hin));
  });
  const savingsPath = useTransform(geo, (g) => {
    if (g.fromSavings < 0.5) return "";
    const ob = VH - 16;
    const jt = g.top + g.hin; // joins just below the incoming stream
    return band(x0 + 40, VH + 30, VH + 30 + g.fromSavings, xs, jt, jt + g.fromSavings) + band(xs, jt, jt + g.fromSavings, x1, ob - g.fromSavings, ob);
  });
  const keepFlow = useTransform(geo, (g) => (g.keep > 2 ? mid(xs, g.top + g.keep / 2, x1, 34 + g.keep / 2) : ""));
  const outFlow = useTransform(geo, (g) => {
    const h = Math.min(g.hout, g.hin);
    return mid(xs, g.top + g.keep + h / 2, x1, VH - 16 - g.hout + h / 2);
  });
  const inFlow = useTransform(geo, (g) => `M${x0},${g.top + g.hin / 2} L${xs},${g.top + g.hin / 2}`);
  const keepLabelY = useTransform(geo, (g) => 34 + g.keep / 2 + 4);
  const outLabelY = useTransform(geo, (g) => VH - 16 - g.hout / 2 + 4);
  const op = useTransform(build, [0.6, 1], [0, 1]);

  const ok = flowNow >= 0;
  return (
    <SceneFrame
      title={deficit ? (ok ? "Con ese recorte, el año vuelve a cuadrar" : "Cada año sale más de lo que entra") : "Cada año te sobra dinero"}
      sub={deficit ? `Este año faltan ${money(-n.flow)} y salen de tus ahorros.` : `Entran ${short(income)} y te quedan ${money(n.flow)} para repartir entre tus metas.`}
      colour={deficit && !ok ? C.bad : C.snow}
      controls={
        deficit && (
          <Slider
            label="Recortar gastos al mes"
            min={0}
            max={Math.ceil(-n.flow / 12 / 50) * 50 + 150}
            step={25}
            value={cut}
            onChange={setCut}
            format={(v) => `${money(v)} al mes`}
          />
        )
      }
    >
      <motion.path d={inPath} fill={C.lichen} opacity={0.32} />
      <motion.path d={outPath} fill={C.lichen} opacity={0.16} />
      <motion.path d={keepPath} fill={C.good} opacity={0.42} />
      <motion.path d={savingsPath} fill={C.bad} opacity={0.42} />
      {/* the current: dashes that travel along each stream */}
      {[inFlow, outFlow, keepFlow].map((d, i) => (
        <motion.path key={i} d={d} className="river-flow" stroke={i === 2 ? C.good : C.snow} style={{ opacity: op }} />
      ))}
      <motion.g style={{ opacity: op }}>
        <text x={x0} y={cy - (income * scale) / 2 - 10} className="svg-label">
          Entra {short(income)} al año
        </text>
        {flowNow > 0 && (
          <motion.text x={x1} y={keepLabelY} textAnchor="end" className="svg-figure" fill={C.good} dy={-14}>
            {`Te queda ${short(flowNow)}`}
          </motion.text>
        )}
        <motion.text x={x1} y={outLabelY} textAnchor="end" className="svg-label" dy={-2}>
          {`Sale ${short(out)}`}
        </motion.text>
        {!ok && (
          <text x={x0 + 40} y={VH - 6} className="svg-label" fill={C.bad}>
            {`De tus ahorros: ${short(-flowNow)}`}
          </text>
        )}
      </motion.g>
    </SceneFrame>
  );
}
