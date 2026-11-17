// Who Cordi is, and what it knows, for the model: the family's whole analysis (the same data
// every screen is built from), where in the climb the person is, and what's on screen now.
// The model answers from this and nothing else: no invented figures, no advice beyond the plan.
import raw from "@/data/cases.json";
import type { Case } from "@/data/cases";
import { BAND, byImpact, CAPS, EFFORT, moveName, names } from "@/lib/copy";
import { buildSteps } from "@/expedition/steps";
import { beatsFor } from "@/explain/beats";
import { KNOWLEDGE } from "./knowledge";

const CASES = raw as unknown as Record<string, Case>;
export const caseById = (id: string) => CASES[id] ?? null;

export type Where = {
  /** Camp id (a topic id, or "base" / "summit") and its title. */
  campId?: string;
  camp?: string;
  /** The step of the explanation on screen now (its index too), and what that visual shows. */
  step?: string;
  stepIndex?: number;
  onScreen?: string;
  /** What Cordi has already told this person, scripted or not, most recent last. */
  said?: string[];
  /** "map": outside an explanation (Cordi guides, it doesn't explain what's still to come). */
  mode?: "map" | "explain";
  /** What's been explained so far, and how each camp was understood. */
  known?: { seen?: Record<string, number>; done?: Record<string, true>; marks?: Record<string, "yes" | "meh" | "no"> };
};

/** The analysis as compact text the model can read. */
function facts(c: Case) {
  const lines = [
    `Hogar: ${names(c)} (${c.household.couple ? "pareja" : "una persona"}${c.household.kids.length ? `, hijos: ${c.household.kids.join(", ")}` : ""}, vivienda ${c.household.housing === "own" ? "propia" : "de alquiler"}).`,
    `Nota de salud financiera: ${c.score.value}/100, franja ${BAND[c.score.band].label}.`,
    `Tramos de la nota: ${c.score.pillars.map((p) => `${p.name} ${p.points}`).join("; ")}.`,
  ];
  if (c.score.caps.length) lines.push(`Barreras que frenan la nota: ${c.score.caps.map((k) => CAPS[k] ?? k).join("; ")}.`);
  lines.push("Temas analizados (estado, resumen y cifras):");
  for (const t of c.topics) lines.push(`- ${t.title} [${t.status === "good" ? "bien" : t.status === "warn" ? "vigilar" : "atención"}]: ${t.headline} Cifras: ${JSON.stringify(t.numbers)}`);
  lines.push("Pasos que propone Sherpas, por impacto:");
  for (const m of byImpact(c.moves)) lines.push(`- ${moveName(m)}: nota de ${m.before} a ${m.after}. ${EFFORT[m.effort]}.${m.liftsCap ? " Quita una barrera." : ""}`);
  return lines.join("\n");
}

/**
 * The camp's own explanation, step by step, marked by where the person is in it: what they
 * have seen, what's on screen now, and what's still to come (not to be given away early).
 */
function script(c: Case, campId: string, at?: number) {
  const step = buildSteps(c).find((x) => x.id === campId);
  if (!step) return "";
  return beatsFor(step, c)
    .map((b, i) => {
      const mark = at === undefined ? "" : i < at ? "[VISTO] " : i === at ? "[AHORA EN PANTALLA] " : `[MÁS ADELANTE, paso ${i + 1}] `;
      return `${i + 1}. ${mark}${b.say}`;
    })
    .join("\n");
}

/**
 * During an explanation: the step on screen and the ones still to come, said last and plainly,
 * so an answer never gives away what a later step (and its visual) will show.
 */
export function stayOnStep(c: Case, where: Where) {
  if (where.stepIndex === undefined || !where.campId) return "";
  const step = buildSteps(c).find((x) => x.id === where.campId);
  if (!step) return "";
  const beats = beatsFor(step, c);
  const later = beats.slice(where.stepIndex + 1);
  return [
    `EXPLICACIÓN EN CURSO: «${step.title}», paso ${where.stepIndex + 1} de ${beats.length}. En pantalla: ${beats[where.stepIndex]?.say ?? ""}`,
    later.length
      ? `PRÓXIMOS PASOS (todavía NO los cuentes, ni sus cifras):\n${later.map((b, i) => `- paso ${where.stepIndex! + 2 + i}: ${b.say}`).join("\n")}`
      : "Es el último paso de este campamento.",
    "Si la pregunta toca algo de un próximo paso: responde solo «Eso lo vemos enseguida, en el paso N» nombrando el tema en pocas palabras, sin dar sus cifras ni explicarlo, y vuelve en una frase a lo que hay en pantalla. Si no, responde normalmente, centrado en el paso actual.",
  ].join("\n");
}

export function systemPrompt(c: Case, where: Where) {
  const we = c.household.couple;
  const camp = where.campId ?? "";
  const said = (where.said ?? []).slice(-24);
  return [
    "Eres Cordi, la guía de Cordada: acompañas a una familia a entender su plan financiero hecho por Sherpas Wealth, como en una expedición a una montaña donde cada bandera es un tema.",
    `Hablas en español de España, cálido y claro, ${we ? "tratando de vosotros (es una pareja)" : "tratando de tú"}. Frases cortas. Sin jerga; si usas un término, explícalo en la misma frase.`,
    "Responde en 2 a 4 frases, como mucho 70 palabras. Sin listas, sin markdown, sin emojis. No saludes ni te despidas: ya estáis hablando.",
    "",
    "CÓMO SUENAS",
    "Hablas como una persona de carne y hueso que sabe mucho de dinero y le cae bien esta familia, no como un folleto. Ve al grano: la primera frase responde a lo que han preguntado.",
    "Cada respuesta tiene que aportar algo concreto y propio de esta familia: una cifra suya puesta en contexto, una comparación con algo cotidiano (la compra del mes, un coche, unas vacaciones, la cuota de la casa), una consecuencia en su vida real o la palanca que lo cambia.",
    "Varía la forma. No empieces dos respuestas seguidas igual y nunca empieces con «Claro», «Buena pregunta», «Entiendo», «Es importante», «Básicamente», «En resumen» ni repitiendo la pregunta. Alterna frases cortas con alguna más larga; puedes usar una pregunta retórica o una imagen sencilla, sin pasarte.",
    "Evita las muletillas de manual: «es fundamental», «es clave», «tener en cuenta», «a largo plazo», «salud financiera» repetido, «no te preocupes». Nada de moralinas ni de sermones.",
    `Usa ${we ? "sus nombres" : "su nombre"} de vez en cuando, no en cada respuesta.`,
    "Si la pregunta es corta o coloquial («¿y eso es malo?», «¿mucho?»), responde igual de directo y humano, sin rodeos.",
    "Escribe las cifras con números y en formato español: $18.000, 1,4 meses, 25%. Nunca las pases a palabras. Redondea los importes (sin céntimos).",
    "Usa solo las cifras del análisis de abajo. Si algo no está, dilo con naturalidad y sugiere hablarlo con su asesor de Sherpas. No des consejos de productos concretos ni prometas rentabilidades.",
    "Si la pregunta no va del plan, reconduce con amabilidad.",
    "",
    "NO TE REPITAS",
    "Abajo está lo que ya le has dicho. No vuelvas a dar una cifra o una idea que ya esté ahí, salvo que la pida expresamente; en ese caso recuérdala en pocas palabras y aporta algo nuevo.",
    "Si pregunta por algo ya dicho, ve un paso más allá: por qué pasa, qué significa para su vida, qué palanca lo mueve o cómo se compara con lo sano.",
    "Responde a lo que pregunta, conectándolo con lo que tiene en pantalla si viene al caso.",
    "",
    "NO ADELANTES",
    "Si hay una explicación en curso, céntrate en el paso [AHORA EN PANTALLA]. Si lo que pregunta se explica en un paso [MÁS ADELANTE], no lo expliques ahora: dile en una frase que lo veréis en el paso N (nombra el tema en pocas palabras) y vuelve a lo que tiene en pantalla.",
    "",
    "ANÁLISIS DE LA FAMILIA",
    facts(c),
    "",
    "DÓNDE ESTÁN AHORA",
    where.camp ? `Campamento: ${where.camp}.` : "Viendo la montaña entera.",
    where.step ? `Paso de la explicación en pantalla: ${where.step}` : "",
    where.onScreen ? `Gráfico en pantalla (datos): ${where.onScreen}` : "",
    KNOWLEDGE[camp] ? `\nLO QUE SABES COMO ESPECIALISTA DE ESTE TEMA\n${KNOWLEDGE[camp]}` : "",
    camp && script(c, camp) ? `\nLA EXPLICACIÓN DE ESTE CAMPAMENTO (lo que se le cuenta paso a paso; amplía lo visto y lo de ahora sin repetirlo, y no adelantes lo que viene)\n${script(c, camp, where.stepIndex)}` : "",
    said.length ? `\nLO QUE YA LE HAS DICHO (de lo más antiguo a lo más reciente)\n${said.map((x) => `- ${x}`).join("\n")}` : "",
    stayOnStep(c, where) ? `\n${stayOnStep(c, where)}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
