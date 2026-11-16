"use client";
// Picks the scene for a topic. Anything that is fine (or unknown) gets the praise scene, except
// the topics where "fine" still has a picture worth showing.
import type { Case, Topic } from "@/data/cases";
import { Cashflow } from "./Cashflow";
import { Debt } from "./Debt";
import { Education } from "./Education";
import { Investments } from "./Investments";
import { LifeNet } from "./LifeNet";
import { Months, NearGoal } from "./Months";
import { Praise } from "./Praise";
import { Retirement } from "./Retirement";
import { Umbrella } from "./Umbrella";

const SCENES: Record<string, (p: { t: Topic; c: Case }) => React.ReactNode> = {
  cashflow: Cashflow,
  emergency: Months,
  "near-goal": NearGoal,
  debt: Debt,
  retirement: Retirement,
  education: Education,
  life: LifeNet,
  umbrella: Umbrella,
  investments: Investments,
};
const SHOW_WHEN_GOOD = new Set(["emergency", "investments", "umbrella", "life", "cashflow", "debt"]);

export function Scene({ t, c }: { t: Topic; c: Case }) {
  const S = SCENES[t.id];
  if (!S || (t.status === "good" && !SHOW_WHEN_GOOD.has(t.id))) return <Praise t={t} />;
  return <S t={t} c={c} />;
}
