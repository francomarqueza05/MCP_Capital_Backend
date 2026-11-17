// Cordi on the map (not inside an explanation): a guide, not a second explainer. It orients,
// recaps, defines terms in general, prepares the talk with the advisor, and for anything not
// explained yet it doesn't explain: it offers to take them to that camp. Figures it may give:
// what the map itself shows on every flag, plus the detail of what has been explained already.
// Once every camp is explained (or the summit), questions are free.
import type { Case } from "@/data/cases";
import { BAND, names } from "@/lib/copy";
import { buildSteps } from "@/expedition/steps";
import { beatsFor } from "@/explain/beats";
import { figures } from "./brief";
import { KNOWLEDGE } from "./knowledge";

export type Known = {
  seen?: Record<string, number>;
  done?: Record<string, true>;
  marks?: Record<string, "yes" | "meh" | "no">;
};

const MARK = { yes: "lo entendió", meh: "más o menos", no: "no lo entendió" } as const;

/** Every camp, with what the map shows and how far it has been explained. */
export function mapState(c: Case, k: Known) {
  const steps = buildSteps(c);
  const allDone = steps.every((s) => k.done?.[s.id]) || Boolean(k.done?.summit);
  const lines = steps.map((s, i) => {
    const beats = beatsFor(s, c);
    const seen = k.done?.[s.id] ? beats.length : Math.min(beats.length, k.seen?.[s.id] ?? 0);
    const state = k.done?.[s.id] ? "EXPLICADO" : seen ? `A MEDIAS (visto ${seen} de ${beats.length} pasos)` : "SIN EXPLICAR";
    const mark = k.marks?.[s.id] ? `, ${MARK[k.marks[s.id]]}` : "";
    const head = `${i === 0 ? "Campamento base" : i === steps.length - 1 ? "Cima" : `Campamento ${i}`} [id ${s.id}] «${s.title}» — en el mapa: ${s.sign.fig} (${s.sign.note}); ${s.label}. Estado: ${state}${mark}.`;
    // detail only for what has been explained
    const detail = allDone || k.done?.[s.id] ? `\n   Detalle explicado: ${figures(c, s.id)}` : seen ? `\n   Pasos vistos: ${beats.slice(0, seen).map((b) => b.say).join(" ")}` : "";
    return head + detail;
  });
  return { allDone, text: lines.join("\n"), ids: steps.map((s) => s.id) };
}

export function mapPrompt(c: Case, k: Known, opts: { camp?: string; said?: string[] }) {
  const we = c.household.couple;
  const st = mapState(c, k);
  return [
    "Eres Cordi, la guía de Cordada. Ahora estáis en el MAPA de la montaña, fuera de una explicación. Tu papel aquí es de guía: orientar, repasar y llevar a cada campamento. Las explicaciones con sus gráficos se hacen dentro de cada campamento, no aquí.",
    `Español de España, cálido y claro, ${we ? "tratando de vosotros (es una pareja)" : "tratando de tú"}. 1 a 3 frases, como mucho 55 palabras. Sin listas ni markdown.`,
    `No saludes ni uses su nombre al empezar: ya estáis hablando. Cifras SIEMPRE con números en formato español ($18.000, 52 de 100), nunca con letras. Al proponer ir, pregunta así: ${we ? "«¿Vamos allí?», «¿Os lo explico allí?»" : "«¿Vamos allí?», «¿Te lo explico allí?»"}.`,
    "",
    "QUÉ HACES AQUÍ",
    "- Orientar: por dónde empezar, qué es más urgente (los tramos en rojo, el primer paso de la cima), sin explicar el detalle.",
    "- Repasar: lo ya visto, lo que queda, cómo va cada bandera.",
    "- Definir conceptos en general (qué es el DTI, qué es un seguro paraguas) SIN dar sus cifras si ese campamento no está explicado.",
    "- Preparar la conversación con el asesor: qué preguntarle, sobre todo de lo que no entendió.",
    "- Responder libremente sobre los campamentos EXPLICADOS, y relacionarlos entre sí.",
    st.allDone
      ? "- Ya se ha explicado todo: puedes responder cualquier pregunta del plan con todas sus cifras."
      : "- Si la pregunta necesita el detalle de un campamento SIN EXPLICAR o A MEDIAS: NO lo expliques ni des cifras que el mapa no muestra. Di en una frase que eso lo veréis en ese campamento (nómbralo) y propón ir. Puedes citar solo lo que el mapa muestra de él.",
    "",
    `LA FAMILIA: ${names(c)}. Nota de salud financiera: ${c.score.value}/100, franja ${BAND[c.score.band].label} (visible en el mapa).`,
    "",
    "EL MAPA, CAMPAMENTO A CAMPAMENTO",
    st.text,
    opts.camp ? `\nAhora mismo está mirando: ${opts.camp}.` : "",
    opts.said?.length ? `\nLO QUE YA LE HAS DICHO (no lo repitas):\n${opts.said.slice(-16).map((x) => `- ${x}`).join("\n")}` : "",
    "",
    "FORMATO DE RESPUESTA: SOLO JSON.",
    `{"text": "lo que dice Cordi", "go": "<id del campamento al que proponer ir, o null>"}`,
    `Pon "go" cuando propongas ir a un campamento para explicarlo (ids válidos: ${st.ids.join(", ")}). Si no propones ir, "go": null.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** For the voice agent on the map: the same rule as a phase brief. */
export function mapBrief(c: Case, k: Known, camp: string | undefined, said: string[]) {
  const st = mapState(c, k);
  return [
    `PHASE: map guide${camp ? `; they are looking at «${camp}»` : ""}. You are NOT explaining a camp now: explanations with their visuals happen inside each camp.`,
    "PACE: answer briefly, then let them talk.",
    "WHAT YOU DO: orient (where to start, what is most urgent), recap what was seen, define terms in general, help prepare questions for the advisor, answer freely about camps marked EXPLICADO.",
    st.allDone
      ? "Everything has been explained: answer any question about the plan."
      : "If a question needs the detail of a camp marked SIN EXPLICAR or A MEDIAS: do not explain it and do not give figures the map does not show. Say they will see it in that camp and suggest pressing «Explícame esto» there. lookup returns only what has been explained.",
    `MAP (the only figures you may say, plus the detail of explained camps):\n${st.text}`,
    said.length ? `ALREADY SAID (do not repeat):\n${said.slice(-12).map((x) => `- ${x}`).join("\n")}` : "",
    "DONE WHEN: they say goodbye or want to end the call.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** lookup on the map: figures only for what has been explained. */
export function mapLookup(c: Case, k: Known, ids: string[], full: (id: string) => string) {
  const st = mapState(c, k);
  if (st.allDone) return ids.map(full).filter(Boolean).join(" ");
  const ok = ids.filter((id) => k.done?.[id]);
  const not = ids.filter((id) => !k.done?.[id]);
  return [
    ok.map(full).join(" "),
    not.length ? `Not explained yet: ${not.join(", ")}. Do not give its detail; suggest they open that camp and press «Explícame esto».` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export { KNOWLEDGE };
