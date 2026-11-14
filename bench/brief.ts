// Benchmark 2: the advisor brief. After a conversation, a model turns what happened into a
// short note for the advisor. Not live, so quality matters more than speed.
import { caseIds, getCase } from "../src/cases/load";
import { advance, focusConcern, packet, startState } from "../src/engine/engine";
import { chat, inventedNumbers, judge, latamWords, mean, parseJson, stats } from "./lib";

const WORRIES: Record<string, string> = {
  "michael-carter": "Me preocupa poder comprar la casa el año que viene sin cargarme la jubilación",
  "timothy-melanie-weah": "Que los niños estén protegidos si nos pasa algo",
  "daniel-emily-johnson": "Pagar la universidad de los niños",
  "samantha-lewis": "Si estoy haciendo las cosas bien de cara a jubilarme",
};

export const BRIEF_PROMPT =
  "You write a short brief, in Spanish from Spain, for a financial advisor who will meet this family. " +
  "Use only the material. Never add figures that are not in it. " +
  'Reply only with JSON: {"resumen": "2 sentences", "preocupaciones": ["..."], "dudas": ["what they did not follow"], ' +
  '"siguientePaso": "the agreed step and whether they committed", "alertas": ["anything the advisor must not miss"]}';

/** What the advisor tool would send: who they are, what they said, how it went, what the plan says. */
export function briefMaterial(id: string) {
  const c = getCase(id)!;
  let s = startState(c, c.members[0]);
  s = advance(c, s, { answers: { worry: WORRIES[id], level: "Keep it simple" } }).state;
  const steps = [{ understood: true }, { understood: false }, { understood: true, emotion: "preocupado" }, { understood: true }];
  let k = 0;
  while (!s.done) s = advance(c, s, { ...steps[k++ % steps.length], answers: { accepted: k % 2 === 0 } }).state;
  const focus = focusConcern(c, s.profile);
  const facts = packet(c, { ...s, done: false, phase: s.plan.indexOf("focus"), depth: 1 }).facts;
  return [
    `Family: ${c.family}, ${c.place}. Score ${c.score.value}/100 (${c.score.band}).`,
    `Person: ${s.profile.name}. Detail wanted: ${s.profile.level}. Their worry, in their words: "${s.profile.worry}".`,
    `Motivation: ${c.persona.classification.D6}. Decision style: ${c.persona.classification.D5}.`,
    `Conversation: ${s.log.map((l) => `${l.phase}${l.understood === false ? " (did not follow)" : ""}${l.emotion ? ` (${l.emotion})` : ""}`).join(", ")}.`,
    `Main concern discussed: ${focus?.title}. ${focus?.text}`,
    `Figures discussed: ${facts.map((f) => `${f.label}: ${f.display}`).join("; ")}.`,
    `Plan recommendations: ${c.recommendations.join(" | ")}`,
  ].join("\n");
}

export async function benchBrief(models: string[], opts: { reps: number }) {
  const results = [];
  for (const model of models) {
    const times: number[] = [];
    let cost = 0;
    let badJson = 0;
    let errors = 0;
    let invented = 0;
    let mentionsWorry = 0;
    let total = 0;
    const latam = new Set<string>();
    const judged: Record<string, number | string>[] = [];
    for (const id of caseIds()) {
      const material = briefMaterial(id);
      for (let r = 0; r < opts.reps; r++) {
        const out = await chat(model, [
          { role: "system", content: BRIEF_PROMPT },
          { role: "user", content: material },
        ], 90_000);
        if (out.error) {
          errors++;
          continue;
        }
        total++;
        times.push(out.ms);
        cost += out.cost;
        const brief = parseJson<Record<string, unknown>>(out.text);
        if (!brief) {
          badJson++;
          continue;
        }
        const text = JSON.stringify(brief);
        if (inventedNumbers(text, material).length) invented++;
        if (/casa|vivienda|proteg|seguro|universidad|jubil/i.test(String(brief.resumen) + String(brief.preocupaciones))) mentionsWorry++;
        latamWords(text).forEach((w) => latam.add(w));
        if (r === 0) {
          const j = await judge(
            {
              faithful: "everything stated is supported by the material, no invented facts or figures",
              useful: "an advisor reading it in 30 seconds knows the worry, what was not understood, the step and the risks",
              spanish: "clear, natural Spanish from Spain",
            },
            `MATERIAL:\n${material}\n\nBRIEF:\n${text}`,
          );
          judged.push(j.scores);
        }
      }
    }
    const t = stats(times);
    const avg = (k: string) => mean(judged.map((s) => Number(s[k])).filter(Number.isFinite));
    results.push({
      model,
      runs: total,
      errors,
      badJson,
      inventedFiguresPct: total ? (100 * invented) / total : 0,
      mentionsWorryPct: total ? (100 * mentionsWorry) / total : 0,
      latamWords: [...latam],
      faithful: avg("faithful"),
      useful: avg("useful"),
      spanish: avg("spanish"),
      p50: t.p50,
      p95: t.p95,
      costPer1000: (cost / Math.max(1, times.length)) * 1000,
    });
    console.log(`  brief ${model}: done`);
  }
  return results;
}
