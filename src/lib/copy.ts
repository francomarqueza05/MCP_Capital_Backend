// Spanish wording for the labels Sherpas returns in English, and number formatting.
import type { Band, Case, Move, Status, Topic } from "@/data/cases";

export const BAND: Record<Band, { label: string; status: Status }> = {
  critical: { label: "Crítica", status: "bad" },
  vulnerable: { label: "Vulnerable", status: "bad" },
  stable: { label: "Estable", status: "warn" },
  strong: { label: "Fuerte", status: "good" },
};

export const MOVES: Record<string, string> = {
  "Raise mortality coverage": "Subir el seguro de vida",
  "Add life cover": "Contratar seguro de vida",
  "Close a coverage gap": "Cerrar un hueco de cobertura",
  "Add umbrella cover": "Contratar seguro ante demandas",
  "Raise annual savings": "Ahorrar más cada año",
  "Lower the withdrawal rate": "Sacar menos cada año de tus ahorros",
  "Raise growth allocation toward glide": "Invertir un poco más en acciones",
  "Reduce growth allocation toward glide": "Invertir un poco menos en acciones",
  "Reduce single-name concentration": "Repartir mejor tus inversiones",
  "Pay down revolving card": "Pagar la tarjeta de crédito",
};

export const CAPS: Record<string, string> = {
  "High revolving balance with high APR": "La deuda de la tarjeta",
  "Mortality coverage ratio below threshold with dependents": "La falta de seguro de vida con hijos",
};

export const EFFORT: Record<Move["effort"], string> = { low: "Poco esfuerzo", medium: "Esfuerzo medio", high: "Mucho esfuerzo" };

/** Which of the plan's moves belong to which topic, for "if you fix this" inside each topic. */
export const TOPIC_MOVES: Record<string, string[]> = {
  life: ["Raise mortality coverage", "Add life cover", "Close a coverage gap"],
  umbrella: ["Add umbrella cover"],
  debt: ["Pay down revolving card"],
  retirement: ["Raise annual savings", "Lower the withdrawal rate"],
  cashflow: ["Raise annual savings"],
  investments: ["Raise growth allocation toward glide", "Reduce growth allocation toward glide", "Reduce single-name concentration"],
};

export const moveName = (m: Move) => MOVES[m.title] ?? m.title;
export const fixFor = (c: Case, t: Topic) => c.moves.find((m) => (TOPIC_MOVES[t.id] ?? []).includes(m.title)) ?? null;
export const byImpact = (moves: Move[]) => [...moves].sort((a, b) => b.after - b.before - (a.after - a.before));

export const STATUS_WORD: Record<Status, string> = { bad: "Necesita atención", warn: "Conviene vigilarlo", good: "En buen camino" };

const es = (n: number, digits = 0) => n.toLocaleString("es-ES", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
export const money = (n: number) => `$${es(Math.round(Math.abs(n)))}`;
/** $1,43 M · $523 k · $450 */
export const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${es(a / 1e6, a >= 1e7 ? 0 : 2)} M`;
  if (a >= 1e4) return `$${es(Math.round(a / 1e3))} k`;
  return money(a);
};
export const num = es;

export const names = (c: Case) => {
  const n = c.household.names;
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} y ${n.at(-1)}` : n[0];
};
/** "tu" for one person, "vuestra" for a couple. */
export const yours = (c: Case) => (c.household.couple ? "vuestra" : "tu");
