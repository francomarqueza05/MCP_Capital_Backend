// Wording for the labels Sherpas returns, in the page's language, and number formatting.
import type { Band, Case, Move, Status, Topic } from "@/data/cases";
import { isEs } from "./lang";

/** A table in both languages that reads in the current one, so callers index it as before. */
export const bi = <T extends object>(en: T, es: T): T =>
  new Proxy((Array.isArray(en) ? [] : {}) as T, {
    get: (_, k) => Reflect.get(isEs() ? es : en, k),
    has: (_, k) => Reflect.has(isEs() ? es : en, k),
    ownKeys: () => Reflect.ownKeys(isEs() ? es : en),
    getOwnPropertyDescriptor: (_, k) => Reflect.getOwnPropertyDescriptor(isEs() ? es : en, k),
  });

export const BAND: Record<Band, { label: string; status: Status }> = bi(
  {
    critical: { label: "Critical", status: "bad" },
    vulnerable: { label: "Vulnerable", status: "bad" },
    stable: { label: "Stable", status: "warn" },
    strong: { label: "Strong", status: "good" },
  },
  {
    critical: { label: "Crítica", status: "bad" },
    vulnerable: { label: "Vulnerable", status: "bad" },
    stable: { label: "Estable", status: "warn" },
    strong: { label: "Fuerte", status: "good" },
  },
);

export const MOVES: Record<string, string> = bi(
  {
    "Raise mortality coverage": "Raise your life cover",
    "Add life cover": "Get life cover",
    "Close a coverage gap": "Close a gap in your cover",
    "Add umbrella cover": "Get umbrella cover",
    "Raise annual savings": "Save more each year",
    "Lower the withdrawal rate": "Draw less from your savings each year",
    "Raise growth allocation toward glide": "Invest a bit more in stocks",
    "Reduce growth allocation toward glide": "Invest a bit less in stocks",
    "Reduce single-name concentration": "Spread your investments out",
    "Pay down revolving card": "Pay off the credit card",
  },
  {
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
  },
);

export const CAPS: Record<string, string> = bi(
  {
    "High revolving balance with high APR": "The credit card debt",
    "Mortality coverage ratio below threshold with dependents": "Too little life cover with children",
  },
  {
    "High revolving balance with high APR": "La deuda de la tarjeta",
    "Mortality coverage ratio below threshold with dependents": "La falta de seguro de vida con hijos",
  },
);

export const EFFORT: Record<Move["effort"], string> = bi(
  { low: "Low effort", medium: "Some effort", high: "High effort" },
  { low: "Poco esfuerzo", medium: "Esfuerzo medio", high: "Mucho esfuerzo" },
);

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

export const STATUS_WORD: Record<Status, string> = bi(
  { bad: "Needs attention", warn: "Worth watching", good: "On track" },
  { bad: "Necesita atención", warn: "Conviene vigilarlo", good: "En buen camino" },
);

const fmtN = (n: number, digits = 0) => n.toLocaleString(isEs() ? "es-ES" : "en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
export const money = (n: number) => `$${fmtN(Math.round(Math.abs(n)))}`;
/** $1.43M · $523k · $450 (in Spanish: $1,43 M · $523 k) */
export const short = (n: number) => {
  const a = Math.abs(n);
  const gap = isEs() ? " " : "";
  if (a >= 1e6) return `$${fmtN(a / 1e6, a >= 1e7 ? 0 : 2)}${gap}M`;
  if (a >= 1e4) return `$${fmtN(Math.round(a / 1e3))}${gap}k`;
  return money(a);
};
export const num = fmtN;

/** "Daniel and Emily" / "Daniel y Emily". */
export const names = (c: Case) => {
  const n = c.household.names;
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} ${isEs() ? "y" : "and"} ${n.at(-1)}` : n[0];
};
/** "your" in English; "tu" for one person or "vuestra" for a couple in Spanish. */
export const yours = (c: Case) => (isEs() ? (c.household.couple ? "vuestra" : "tu") : "your");
