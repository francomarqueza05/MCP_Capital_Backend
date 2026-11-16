// The route, built from the family's analysis. Base camp is where they stand (the score);
// then every topic Sherpas looked at, from solid ground to the steepest stretches; the summit
// is the one move that lifts them most. Each step carries what Cordi says when it gets there.
import { climbed, pillarPoints, type Case, type Status, type Topic } from "@/data/cases";
import { BAND, byImpact, CAPS, fixFor, moveName, num, short } from "@/lib/copy";

export type Step = {
  id: string;
  kind: "base" | "topic" | "summit";
  title: string;
  label: string;
  status: Status | "goal";
  /** What Cordi says on arrival. */
  say: string;
  /** The camp's sign on the overview: its one telling figure and what it means. */
  sign: { fig: string; note: string };
  topic?: Topic;
};

const ORDER: Record<Status, number> = { good: 0, warn: 1, bad: 2 };

export function buildSteps(c: Case): Step[] {
  const we = c.household.couple;
  const v = (one: string, two: string) => (we ? two : one);
  const band = BAND[c.score.band];
  const total = climbed(c);
  const capped = c.score.caps.length > 0 && total - c.score.value >= 3;
  const room = [...c.score.pillars].sort((a, b) => {
    const pa = pillarPoints(a);
    const pb = pillarPoints(b);
    return pb.of - pb.got - (pa.of - pa.got);
  })[0];

  const base: Step = {
    sign: { fig: `${c.score.value} de 100`, note: capped ? `${c.score.caps.length > 1 ? "Dos barreras frenan" : "Una barrera frena"} la nota` : `Nota ${band.label.toLowerCase()}` },
    id: "base",
    kind: "base",
    title: "Campamento base",
    label: `${c.score.value} de 100, ${band.label.toLowerCase()}`,
    status: band.status,
    say: capped
      ? `${v("Tu", "Vuestra")} nota es ${c.score.value} de 100. ${v("Has", "Habéis")} sumado ${total} puntos, pero ${c.score.caps.map((k) => (CAPS[k] ?? k).toLowerCase()).join(" y ")} ${c.score.caps.length > 1 ? "frenan" : "frena"} la subida. Vamos tramo a tramo.`
      : `${v("Tu", "Vuestra")} nota es ${c.score.value} de 100. Donde más ${v("puedes", "podéis")} subir es en ${room.name.toLowerCase()}. Vamos tramo a tramo.`,
  };

  // solid ground first, the hard stretches higher up, as on a real climb
  const topics = [...c.topics].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map<Step>((t) => {
    const fix = fixFor(c, t);
    const lead = t.status === "good" ? "Aquí el terreno es firme." : t.status === "warn" ? "Este tramo pide atención." : "Este es un tramo difícil.";
    const after = fix && fix.after > fix.before ? ` Si lo ${v("resuelves", "resolvéis")}, la nota sube de ${fix.before} a ${fix.after}.` : "";
    return { id: t.id, kind: "topic", title: t.title, label: t.label, status: t.status, say: `${lead} ${t.headline}${after}`, topic: t, sign: sign(t) };
  });

  const best = byImpact(c.moves)[0];
  const summit: Step = {
    sign: best ? { fig: `+${best.after - best.before} puntos`, note: moveName(best) } : { fig: "Mantener", note: "Vas por buen camino" },
    id: "summit",
    kind: "summit",
    title: "Tu primer paso",
    label: best ? moveName(best) : "Seguir así",
    status: "goal",
    say: best
      ? `La cima empieza por un paso: ${moveName(best).toLowerCase()}. Con eso, ${v("tu", "vuestra")} nota pasaría de ${best.before} a ${best.after}.`
      : `${v("Vas", "Vais")} por buen camino. El siguiente paso es mantenerlo.`,
  };

  return [base, ...topics, summit];
}

/** One figure and a few words for each topic, for its sign on the overview. */
function sign(t: Topic): Step["sign"] {
  const n = t.numbers as Record<string, number & string>;
  switch (t.id) {
    case "emergency":
      return { fig: `${num(+n.months, 1)} meses`, note: `de colchón; lo ideal, ${n.min} a ${n.max}` };
    case "near-goal":
      return { fig: `${num(+n.after, 1)} meses`, note: `de colchón tras ${String(n.goal ?? "la compra").toLowerCase()}` };
    case "debt":
      return n.balance ? { fig: short(+n.balance), note: "en tarjetas que casi no bajan" } : { fig: `${Math.round(+n.dti * 100)}%`, note: "del sueldo va a deudas" };
    case "retirement":
      if (n.runOut !== "Not applicable") return { fig: `A los ${n.runOut}`, note: "se acabarían los ahorros" };
      if (+n.gap > 0) return { fig: short(+n.gap), note: `faltan para jubilarte a los ${n.retireAge}` };
      return { fig: `${n.incomeShare}%`, note: "de los gastos, cubiertos" };
    case "cashflow":
      return +n.flow < 0 ? { fig: `−${short(+n.flow)}`, note: "al año, pagados con ahorros" } : { fig: `+${short(+n.flow)}`, note: "al año para tus metas" };
    case "education":
      return { fig: short(+n.gap), note: "faltan para la universidad" };
    case "life": {
      const s = (+n.shortfall || 0) + (+n.coShortfall || 0);
      return s ? { fig: short(s), note: "de seguro de vida faltan" } : { fig: "Cubierto", note: "tu familia está protegida" };
    }
    case "umbrella":
      return n.recommended ? { fig: short(+n.recommended), note: "de cobertura, sin contratar" } : { fig: short(+n.current), note: "de cobertura ante demandas" };
    case "investments":
      return { fig: `${n.equity}% en acciones`, note: `lo que encaja: ${n.target}%` };
  }
  return { fig: t.label, note: "" };
}
