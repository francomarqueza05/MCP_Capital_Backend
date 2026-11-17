"use client";
// A card balance that barely moves. Top: where each monthly payment actually goes (interest
// versus the debt itself). Below: the balance over ten years at today's payment, and at the
// payment you choose. Both reshape with weight as you drag.
import { motion, useTransform } from "motion/react";
import { useState } from "react";
import { money, num, short } from "@/lib/copy";
import type { Topic } from "@/data/cases";
import { C, Pill, SceneFrame, Slider, tone, useBuild, useFollow, VW } from "./kit";

const X = 56;
const Y = 108;
const PW = VW - X - 24;
const PH = 118;
const YEARS = 10;

function curve(balance: number, r: number, pay: number, k: number) {
  let b = balance;
  const pts: string[] = [];
  const months = Math.max(2, Math.round(YEARS * 12 * k));
  for (let m = 0; m <= months; m++) {
    pts.push(`${X + (PW * m) / (YEARS * 12)},${Y + PH * (1 - b / balance)}`);
    b = Math.max(0, b * (1 + r) - pay);
  }
  return pts;
}
const monthsToPay = (balance: number, r: number, p: number) => (p > balance * r ? Math.log(p / (p - r * balance)) / Math.log(1 + r) : Infinity);

export function Debt({ t }: { t: Topic }) {
  const n = t.numbers as { balance?: number; monthly: number; interest: number; dti?: number };
  if (!n.balance) return <DebtToIncome t={t} />;
  const balance = n.balance;
  return <Card balance={balance} monthly={n.monthly} interest={n.interest} />;
}

function Card({ balance, monthly, interest }: { balance: number; monthly: number; interest: number }) {
  const r = interest / balance;
  const [pay, setPay] = useState(Math.round(monthly));
  const payS = useFollow(pay);
  const build = useBuild(0.2, 1.4);

  const nowLine = useTransform(build, (k) => "M" + curve(balance, r, monthly, k).join(" L"));
  const newLine = useTransform([payS, build], ([p, k]: number[]) => (p > monthly + 4 ? "M" + curve(balance, r, p, k).join(" L") : ""));
  const newArea = useTransform([payS, build], ([p, k]: number[]) => {
    if (p <= monthly + 4) return "";
    const pts = curve(balance, r, p, k);
    return `M${X},${Y + PH} L${pts.join(" L")} L${pts.at(-1)!.split(",")[0]},${Y + PH} Z`;
  });
  // where each payment goes
  const W = VW;
  const split = useTransform([payS, build], ([p, k]: number[]) => (Math.min(interest, p) / p) * W * k);
  const rest = useTransform([payS, build], ([p, k]: number[]) => (W - (Math.min(interest, p) / p) * W) * k);
  const restX = useTransform(split, (s) => s + 3);
  const m = monthsToPay(balance, r, pay);
  const free = !isFinite(m) ? "Con este pago no terminarías nunca" : m > 24 ? `Libre de deuda en ${num(m / 12, 1)} años` : `Libre de deuda en ${Math.ceil(m)} meses`;
  const interestShare = Math.round((Math.min(interest, pay) / pay) * 100);

  return (
    <SceneFrame
      title={`Pagas ${money(monthly)} al mes y la deuda casi no baja`}
      sub={`La tarjeta cobra alrededor de un ${num(r * 1200, 1)}% al año. De cada pago, ${interestShare}% se va en intereses.`}
      colour={C.bad}
      controls={<Slider label="Pagar al mes" min={Math.round(monthly)} max={Math.round((monthly * 4) / 50) * 50} step={25} value={pay} onChange={setPay} format={(v) => money(v)} />}
    >
      <text x={0} y={14} className="svg-label">
        {`Adónde va cada pago de ${money(pay)}`}
      </text>
      <motion.rect x={0} y={24} height={22} rx={6} fill={C.bad} width={split} />
      <motion.rect y={24} height={22} rx={6} fill={C.good} width={rest} style={{ x: restX }} />
      <text x={0} y={64} className="svg-small" fill={C.bad}>
        {`Intereses: ${money(Math.min(interest, pay))}`}
      </text>
      <text x={VW} y={64} textAnchor="end" className="svg-small" fill={C.good}>
        {`Baja la deuda: ${money(Math.max(0, pay - interest))}`}
      </text>

      <line x1={X} y1={Y + PH} x2={X + PW} y2={Y + PH} stroke={C.dim} />
      {Array.from({ length: YEARS / 2 + 1 }, (_, i) => i * 2).map((yr) => (
        <text key={yr} x={X + (PW * yr) / YEARS} y={Y + PH + 16} textAnchor="middle" className="svg-small">
          {yr === 0 ? "hoy" : `${yr} años`}
        </text>
      ))}
      <text x={X - 8} y={Y + 4} textAnchor="end" className="svg-small">
        {short(balance)}
      </text>
      <text x={X - 8} y={Y + PH} textAnchor="end" className="svg-small">
        $0
      </text>
      <motion.path d={newArea} fill="url(#v-good)" />
      <motion.path d={nowLine} fill="none" stroke={C.bad} strokeWidth={2.5} strokeLinecap="round" />
      <motion.path d={newLine} fill="none" stroke={C.good} strokeWidth={3} strokeLinecap="round" />
      <text x={X + PW} y={Y - 6} textAnchor="end" className="svg-small" fill={C.bad}>
        con el pago de hoy
      </text>
      <Pill key={free} x={X + PW / 2} y={Y + PH - 36} text={free} colour={isFinite(m) && m < 48 ? C.good : C.bad} />
    </SceneFrame>
  );
}

function DebtToIncome({ t }: { t: Topic }) {
  const share = (t.numbers as { dti: number }).dti;
  const build = useBuild(0.2, 1.2);
  const w = useTransform(build, (k) => VW * share * k);
  const colour = tone(t.status);
  const limit = VW * 0.36;
  return (
    <SceneFrame title={`${Math.round(share * 100)}% de tu sueldo se va en deudas`} sub="Hasta un 36% suele considerarse sano. Estás por debajo." colour={colour}>
      <rect x={0} y={100} width={VW} height={44} rx={10} fill={C.faint} />
      <motion.rect x={0} y={100} height={44} rx={10} fill={colour} width={w} />
      <line x1={limit} x2={limit} y1={88} y2={156} stroke={C.lichen} strokeDasharray="3 3" />
      <text x={limit} y={80} textAnchor="middle" className="svg-small">
        límite sano, 36%
      </text>
      <text x={0} y={172} className="svg-small" fill={colour}>
        Pagos de deudas
      </text>
      <text x={VW} y={172} textAnchor="end" className="svg-small">
        Tu sueldo bruto al mes
      </text>
    </SceneFrame>
  );
}
