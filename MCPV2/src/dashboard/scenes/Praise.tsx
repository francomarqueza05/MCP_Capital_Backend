"use client";
// For what is going well: a flag planted on its own summit. Short, and then still.
import { motion } from "motion/react";
import type { Topic } from "@/data/cases";
import { C, SceneFrame, VH, VW } from "./kit";

export function Praise({ t }: { t: Topic }) {
  const base = VH - 34;
  const cx = VW / 2;
  return (
    <SceneFrame title={t.label} sub={t.headline} colour={C.good}>
      <motion.path
        d={`M${cx - 190},${base} L${cx - 70},${base - 80} L${cx - 40},${base - 70} L${cx},${base - 140} L${cx + 50},${base - 90} L${cx + 80},${base - 98} L${cx + 190},${base} Z`}
        fill={C.slate2}
        stroke={C.lichen}
        strokeOpacity={0.4}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      />
      <path d={`M${cx - 26},${base - 114} L${cx},${base - 140} L${cx + 22},${base - 118} L${cx + 10},${base - 112} L${cx},${base - 120} L${cx - 12},${base - 110} Z`} fill={C.snow} opacity={0.85} />
      <motion.line
        x1={cx}
        x2={cx}
        y1={base - 140}
        y2={base - 200}
        stroke={C.snow}
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.45, duration: 0.35, ease: "easeOut" }}
      />
      <motion.path
        d={`M${cx},${base - 200} L${cx + 40},${base - 190} L${cx},${base - 178} Z`}
        fill={C.good}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: [0, 1.15, 0.92, 1] }}
        transition={{ delay: 0.8, duration: 0.9 }}
        style={{ transformBox: "fill-box", transformOrigin: "0% 50%" }}
      />
      <line x1={0} x2={VW} y1={base} y2={base} stroke={C.dim} />
    </SceneFrame>
  );
}
