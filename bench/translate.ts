// Benchmark 1: translating what the family sees into Spanish (Spain).
// Same prompt and batching as production (one batch per phase packet), every case and phase.
import { caseIds, getCase } from "../src/cases/load";
import { advance, packet, startState, type Packet } from "../src/engine/engine";
import { screenStrings } from "../src/i18n/packet";
import { TRANSLATE_PROMPT, figures } from "../src/i18n/translate";
import { chat, judge, latamWords, mean, parseJson, stats } from "./lib";

/** The English strings of every packet of a full conversation, per case. */
export function translationBatches(): string[][] {
  const batches: string[][] = [];
  for (const id of caseIds()) {
    const c = getCase(id)!;
    let s = startState(c, c.members[0]);
    const packets: Packet[] = [packet(c, s)];
    s = advance(c, s, { answers: { worry: "retirement", level: "Keep it simple" } }).state;
    while (!s.done) {
      packets.push(packet(c, s));
      s = advance(c, s, { understood: true, answers: { accepted: true } }).state;
    }
    for (const p of packets) batches.push(screenStrings(structuredClone(p)).map((x) => x.get()));
  }
  return batches.filter((b) => b.length);
}

export async function benchTranslate(models: string[], opts: { judgeSample: number }) {
  const batches = translationBatches();
  const results = [];
  for (const model of models) {
    const times: number[] = [];
    let cost = 0;
    let strings = 0;
    let figuresKept = 0;
    let badJson = 0;
    let errors = 0;
    const latam = new Set<string>();
    const samples: string[] = [];
    for (const [i, batch] of batches.entries()) {
      const r = await chat(model, [
        { role: "system", content: TRANSLATE_PROMPT },
        { role: "user", content: JSON.stringify(batch) },
      ]);
      if (r.error) {
        errors++;
        continue;
      }
      times.push(r.ms);
      cost += r.cost;
      const out = parseJson<string[]>(r.text);
      if (!Array.isArray(out) || out.length !== batch.length) {
        badJson++;
        continue;
      }
      batch.forEach((en, k) => {
        strings++;
        if (typeof out[k] === "string" && figures(out[k]) === figures(en)) figuresKept++;
        latamWords(String(out[k])).forEach((w) => latam.add(w));
      });
      if (i % Math.max(1, Math.floor(batches.length / opts.judgeSample)) === 0 && samples.length < opts.judgeSample)
        samples.push(batch.map((en, k) => `EN: ${en}\nES: ${out[k]}`).join("\n"));
    }
    const judged = [];
    for (const sample of samples) {
      const j = await judge(
        {
          fidelity: "the Spanish says exactly what the English says, figures and names unchanged",
          natural: "reads like natural, warm Spanish from Spain (tú, peninsular vocabulary), not a literal translation",
        },
        sample,
      );
      judged.push(j.scores);
    }
    const t = stats(times);
    results.push({
      model,
      batches: batches.length,
      errors,
      badJson,
      figuresKeptPct: strings ? (100 * figuresKept) / strings : 0,
      latamWords: [...latam],
      fidelity: mean(judged.map((s) => Number(s.fidelity)).filter(Number.isFinite)),
      natural: mean(judged.map((s) => Number(s.natural)).filter(Number.isFinite)),
      p50: t.p50,
      p95: t.p95,
      costPer1000Batches: (cost / Math.max(1, times.length)) * 1000,
    });
    console.log(`  translate ${model}: done`);
  }
  return results;
}
