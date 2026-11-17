// Phase briefs for the live voice agent (the ElevenLabs "Cordada guide", gemini-3.1-flash-lite,
// chosen by bench/). Its fixed prompt (scripts/agent.ts) runs the call in phases: code hands it
// one brief at a time, it shows blocks on screen with show_block, quotes only the brief's
// figures, and calls phase_done when the brief's DONE WHEN is met.
import type { Case } from "@/data/cases";
import { BAND, byImpact, EFFORT, fixFor, moveName, names } from "@/lib/copy";
import { buildSteps } from "@/expedition/steps";
import { beatsFor } from "@/explain/beats";
import { KNOWLEDGE } from "./knowledge";

export const TOPIC_OF: Record<string, string[]> = {
  score: ["base"],
  retirement: ["retirement"],
  cash: ["emergency", "near-goal"],
  cashflow: ["cashflow"],
  debt: ["debt"],
  protection: ["life", "umbrella"],
  education: ["education"],
  investments: ["investments"],
  home: ["near-goal"],
};

/** The figures of one camp, as the only ones the agent may say there. */
export function figures(c: Case, campId: string) {
  if (campId === "base")
    return [`Nota ${c.score.value}/100, franja ${BAND[c.score.band].label}.`, `Tramos: ${c.score.pillars.map((p) => `${p.name} ${p.points}`).join("; ")}.`].join(" ");
  if (campId === "summit") return byImpact(c.moves).map((m) => `${moveName(m)}: nota de ${m.before} a ${m.after} (${EFFORT[m.effort].toLowerCase()}).`).join(" ");
  const t = c.topics.find((x) => x.id === campId);
  if (!t) return "";
  const fix = fixFor(c, t);
  return [`${t.title}: ${t.headline}`, `Cifras: ${JSON.stringify(t.numbers)}.`, fix ? `Paso propuesto: ${moveName(fix)}, nota de ${fix.before} a ${fix.after}.` : ""].filter(Boolean).join(" ");
}

const saidBlock = (said: string[]) => (said.length ? `ALREADY SAID (do not repeat; build on it):\n${said.slice(-16).map((s) => `- ${s}`).join("\n")}` : "");

/** Explaining one camp, block by block, from `from`. */
export function explainBrief(c: Case, campId: string, from: number, said: string[]) {
  const step = buildSteps(c).find((s) => s.id === campId);
  if (!step) return null;
  const beats = beatsFor(step, c);
  return [
    `PHASE: explain «${step.title}» step by step, in Spanish from Spain.`,
    `GOAL: ${names(c)} understands this part of their plan, at their pace.`,
    "PACE: one block at a time. Call show_block with the block's id, then tell that block in 1 to 3 short sentences in your own words (do not read it). Then STOP and let them look at the chart: a «Seguimos» button on screen is how they move on.",
    "DO NOT ask «¿seguimos?», «¿continuamos?» or similar after each block. Every two or three blocks at most, you may check understanding with a short, natural, varied question about the content itself (e.g. «¿Te cuadra?», «¿Lo ves en la barra?»). If they stay silent, do not insist: they are looking at the chart.",
    "MOVING ON: only show the next block when they press the button (it arrives as «Sí, seguimos.») or clearly say to go on («sigue», «vale, siguiente»). A question, a doubt or silence is not a go: stay on the same block. Never skip blocks. If a message says BLOCKED, stay on the block without asking.",
    "STAY ON THIS BLOCK: talk only about the block on screen and this camp. If they ask about something else, answer in one sentence (call lookup if you need figures) and come back to the block. If they did not follow, tell it again more simply (use its SIMPLER line).",
    "NO SPOILERS: if what they ask is covered by a later block, do not explain it now. Say in one sentence that you will see it in a moment (name it in a few words) and come back to the block on screen.",
    `ON SCREEN (blocks in order${from ? `; they already saw ${from}, start with ${beats[from].id}` : ""}):`,
    ...beats.map((b, i) => `- ${b.id}: ${b.say}${b.simpler ? ` | SIMPLER: ${b.simpler}` : ""}${i < from ? " (already seen)" : ""}`),
    `FIGURES (the only ones you may say here): ${figures(c, campId)}`,
    KNOWLEDGE[campId] ? `BACKGROUND (general knowledge, no figures): ${KNOWLEDGE[campId]}` : "",
    saidBlock(said),
    "DONE WHEN: you have told the last block and they have no more questions about it, or they ask to stop.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A free conversation about the plan, wherever they are. */
export function freeBrief(c: Case, campId: string | undefined, said: string[]) {
  const camp = campId ? buildSteps(c).find((s) => s.id === campId) : null;
  return [
    `PHASE: free questions about the plan${camp ? `; they are looking at «${camp.title}»` : ""}.`,
    "PACE: answer what they ask, briefly, then let them talk. If they ask nothing, offer to explain the camp they are on.",
    `FIGURES: ${["base", ...c.topics.map((t) => t.id), "summit"].map((id) => figures(c, id)).join(" ")}`,
    camp && KNOWLEDGE[camp.id] ? `BACKGROUND: ${KNOWLEDGE[camp.id]}` : "",
    saidBlock(said),
    "DONE WHEN: they say goodbye or want to end the call.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The lookup tool: figures and the plan's words on one topic. */
export function lookup(c: Case, topic: string) {
  const ids = TOPIC_OF[topic] ?? [];
  const out = ids.map((id) => figures(c, id)).filter(Boolean);
  return out.length ? out.join(" ") : "The plan does not cover this. Say so, and that their advisor can look at it.";
}

/** Who they are, for the agent's dynamic variables. */
export function persona(c: Case, said: string[]) {
  return {
    name: c.household.names.join(" y "),
    language_name: "Spanish (Spain)",
    household: `${names(c)}; ${c.household.couple ? "pareja" : "una persona"}${c.household.kids.length ? `, hijos: ${c.household.kids.join(", ")}` : ""}`,
    level: "basics",
    worry: "not known yet",
    motivation: "unknown",
    decision_style: "unknown",
    previous_conversation: said.length ? said.slice(-6).join(" ") : "none",
  };
}
