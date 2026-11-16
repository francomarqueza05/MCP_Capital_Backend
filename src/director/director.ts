// The director: which blocks play in each phase, in what order and at what depth, for this
// family and this person. Pure code, no model. Each phase has a ladder of levels:
//   level 1  the one or two blocks that carry the idea, in plain terms
//   level 2  what a person who asks for more gets next
//   level 3  the detail and the plan's own analysis, for experts or a second "tell me more"
// The focus phase uses the ladder of the family's main concern (their worry first, then the
// most severe concern in the plan). A block shown in an earlier phase is not repeated.
import type { CaseData } from "../cases/load";
import type { PhaseId, Profile } from "../engine/engine";
import { buildPlan, type Plan } from "../plan/build";
import { sections, type Block, type Depth } from "./catalog";

export type Mode = "more" | "simpler" | null;

export type Step = {
  /** Block id from the shared catalog; the front end draws it. */
  block: string;
  name: string;
  /** How the block is drawn: plain words or the detailed version. */
  depth: Depth;
  /** Ladder level this step comes from (1 core, 2 more, 3 detail). */
  level: 1 | 2 | 3;
  /** What the guide can say with it, from the plan's figures. */
  say: string | null;
  /** Whose view, for blocks that differ per person. */
  who: string;
};

type Ladder = [string[], string[], string[]];

const BLOCKS = new Map<string, Block>(sections.flatMap((s) => s.blocks).map((b) => [b.id, b]));

/** Ladders for the focus phase, by the topic of the family's main concern. */
const FOCUS: Record<string, (p: Plan, simple: boolean) => Ladder> = {
  retirement: () => [["savings-line"], ["gap-vs-room", "retirement-income"], ["retirement-mix", "tax-back", "retirement-reading"]],
  home: () => [["goals", "cushion"], ["family-lanes", "waterfall"], ["savings-reading"]],
  cash: () => [["cushion"], ["money-river", "waterfall"], ["emergency-reading"]],
  cashflow: (_, simple) => [[simple ? "hundred" : "money-river"], ["outflow-detail", "saving-now"], ["savings-reading"]],
  debt: (_, simple) => [simple ? ["card-bite", "debt-ladder"] : ["debt-ladder"], ["debt-ratios", "monthly-debt", "debt-payoff"], ["debt-reading"]],
  protection: () => [["shield"], ["life-cover", "umbrella"], ["protection-intro", "life-reading", "umbrella-reading"]],
  education: () => [["college"], ["waterfall"], ["savings-reading"]],
  investments: (p) => [["mix-shift"], ["risk-spectrum", "proposal", ...(p.household.couple ? ["account-returns"] : ["performance"])], ["holdings-map", "exposure", "class-shift", "invest-recs"]],
  score: () => [["pillars"], ["recommendations"], ["plan-summary"]],
};

function ladder(phase: PhaseId, c: CaseData, plan: Plan, profile: Profile, topic: string | null): Ladder {
  const simple = profile.level === "new";
  const couple = plan.household.couple;
  const splitRisk = c.persona.classification.D4 === "MISALIGNED";
  switch (phase) {
    case "discovery":
      return [["family-snapshot"], ["unknowns"], []];
    case "today":
      return [[simple ? "hundred" : "money-river"], ["cushion", "pillars", ...(couple ? ["who-holds"] : [])], ["outflow-detail", "plan-summary"]];
    case "focus":
      return (FOCUS[topic ?? "score"] ?? FOCUS.score)(plan, simple);
    case "tension":
      return [couple && splitRisk ? ["risk-spectrum", "competing-needs"] : ["competing-needs"], ["gap-vs-room", "waterfall"], ["tensions", "concerns"]];
    case "route":
      return [[couple ? "family-lanes" : "net-worth-path"], ["net-worth-path", "goals", "debt-payoff"], ["assumptions"]];
    case "step":
      return [["first-step"], ["move-sim", "on-table"], ["recommendations"]];
    case "commit":
      return [["first-step"], simple ? ["terms"] : [], []];
  }
}

/** Plain words for someone who did not follow. */
const SIMPLER: Record<string, string> = {
  "money-river": "hundred",
  "outflow-detail": "hundred",
  "debt-ratios": "card-bite",
  "monthly-debt": "card-bite",
  "retirement-income": "savings-line",
  "retirement-mix": "savings-line",
  proposal: "mix-shift",
  "class-shift": "mix-shift",
  "risk-spectrum": "mix-shift",
};

const plans = new Map<string, Plan>();
export const planFor = (caseId: string) => {
  if (!plans.has(caseId)) plans.set(caseId, buildPlan(caseId));
  return plans.get(caseId)!;
};

/** The blocks of one phase. `depth` is how many times they asked to go further (0, 1, 2). */
export function stepsFor(
  c: CaseData,
  profile: Profile,
  phase: PhaseId,
  topic: string | null,
  depth: number,
  mode: Mode,
  used: Set<string> = new Set(),
): Step[] {
  const plan = planFor(c.id);
  const who = profile.memberId;
  const expert = profile.level === "expert";
  const lad = ladder(phase, c, plan, profile, topic);
  // Experts start one level deeper; every "tell me more" adds a level.
  // Level 2 is always on the board too: the phase shows everything at once and the guide walks
  // through it, so there is something to look forward to. Experts get level 3 as well.
  const reach = Math.min(3, 2 + (expert ? 1 : 0) + (mode === "more" ? depth : 0));
  let ids: { id: string; level: 1 | 2 | 3 }[] = [];
  for (let l = 0; l < reach; l++) for (const id of lad[l]) ids.push({ id, level: (l + 1) as 1 | 2 | 3 });

  if (mode === "simpler") {
    ids = ids.filter((x) => x.level === 1).map((x) => ({ id: SIMPLER[x.id] ?? x.id, level: 1 as const }));
    if (!ids.some((x) => x.id === "terms")) ids.push({ id: "terms", level: 1 });
  }

  // If nothing at the reached levels applies to this family, borrow the first block that does
  // from the deeper levels, so no phase is ever left without something on screen.
  const fallback = lad.flatMap((ls, l) => ls.map((id) => ({ id, level: (l + 1) as 1 | 2 | 3 })));

  const steps: Step[] = [];
  const seen = new Set<string>();
  const pick = ({ id, level }: { id: string; level: 1 | 2 | 3 }) => {
    const b = BLOCKS.get(id);
    if (!b || seen.has(id)) return;
    // Commit repeats the first step on purpose; everything else is shown once per conversation.
    if (used.has(id) && phase !== "commit") return;
    const blockDepth: Depth = mode === "simpler" || profile.level === "new" ? "plain" : expert || level > 1 ? "detailed" : "plain";
    const ctx = { data: plan, who, depth: blockDepth };
    if (b.when && !b.when(ctx)) return;
    seen.add(id);
    steps.push({ block: id, name: b.name, depth: blockDepth, level, say: b.says?.(ctx) ?? null, who });
  };
  ids.forEach(pick);
  for (const x of fallback) {
    if (steps.length) break;
    pick(x);
  }
  return steps;
}

/** Blocks the earlier phases of this conversation will already have shown (at their first level). */
export function usedBefore(c: CaseData, profile: Profile, plan: PhaseId[], upTo: number, topic: string | null) {
  const used = new Set<string>();
  for (let i = 0; i < upTo; i++) for (const s of stepsFor(c, profile, plan[i], topic, 0, null, used)) used.add(s.block);
  return used;
}
