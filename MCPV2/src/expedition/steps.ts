// The route, built from the family's analysis. Base camp is where they stand (the score);
// then every topic Sherpas looked at, from solid ground to the steepest stretches; the summit
// is the one move that lifts them most. Each step carries what Cordi says when it gets there.
import { climbed, pillarPoints, type Case, type Status, type Topic } from "@/data/cases";
import { BAND, byImpact, CAPS, fixFor, moveName, num, short } from "@/lib/copy";
import { fixRank, money, months, ofHundred, pickBy } from "@/lib/talk";

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
      ? `Aquí empieza todo. ${v("Tu", "Vuestra")} nota hoy es un ${c.score.value} sobre 100. Por lo que ${v("tienes", "tenéis")}, podría ser más alta, pero ${c.score.caps.map((k) => (CAPS[k] ?? k).toLowerCase()).join(" y ")} ${c.score.caps.length > 1 ? "le ponen" : "le pone"} un techo.`
      : `Aquí empieza todo. ${v("Tu", "Vuestra")} nota hoy es un ${c.score.value} sobre 100, y donde más margen ${v("tienes", "tenéis")} para subir es en ${room.name.toLowerCase()}.`,
  };

  // solid ground first, the hard stretches higher up, as on a real climb
  const topics = [...c.topics].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map<Step>((t) => {
    const fix = fixFor(c, t);
    const gain = fix && fix.after > fix.before ? fix.after - fix.before : 0;
    const after = gain
      ? ` ${pickBy(fixRank(c, t), [
          `Arreglando esto, ${v("tu", "vuestra")} nota pasaría de ${fix!.before} a ${fix!.after}.`,
          `Solo con esto ${v("ganarías", "ganaríais")} ${gain} puntos.`,
          `Aquí hay ${gain} puntos esperando.`,
        ])}`
      : "";
    return { id: t.id, kind: "topic", title: t.title, label: t.label, status: t.status, say: `${arrival(t, c, v)}${after}`, topic: t, sign: sign(t) };
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
      ? `Y llegamos arriba. De todo lo que hemos visto, lo que más ${v("te", "os")} acerca es ${moveName(best).toLowerCase()}: con eso, la nota pasaría de ${best.before} a ${best.after}.`
      : `Y llegamos arriba. ${v("Vas", "Vais")} por buen camino; ahora se trata de mantenerlo.`,
  };

  return [base, ...topics, summit];
}

/**
 * What Cordi says on arriving at a camp: one or two plain sentences, different for each topic
 * and for how it's going, with the figures rounded the way a person would say them.
 */
function arrival(t: Topic, c: Case, v: (one: string, two: string) => string): string {
  const n = t.numbers as Record<string, number & string>;
  switch (t.id) {
    case "cashflow": {
      const flow = +n.flow;
      if (flow < 0) return `Aquí hay una pequeña fuga: cada año sale ${money(-flow)} más de lo que entra, y la diferencia se paga tirando de ahorros.`;
      const tight = flow < +n.income * 0.08;
      return tight
        ? `Cada año ${v("te", "os")} quedan ${money(flow)} libres. Parece mucho, pero para todo lo que ${v("quieres", "queréis")} hacer es un margen justo.`
        : `Buena noticia: cada año ${v("te", "os")} sobran ${money(flow)}. Es la gasolina para el resto de metas.`;
    }
    case "emergency": {
      const m = +n.months;
      if (m < +n.min) return `Si mañana ${v("dejaras", "dejarais")} de cobrar, ${v("tendrías", "tendríais")} para aguantar ${months(m)}. Lo sensato sería tener entre ${n.min} y ${n.max}.`;
      if (m > +n.max) return `Aquí ${v("vas", "vais")} sobrado: ${months(m)} de gastos guardados, más de lo que hace falta. Parte de ese dinero podría estar trabajando en otras cosas.`;
      return `${v("Tienes", "Tenéis")} un buen colchón: ${months(m)} de gastos guardados para imprevistos.`;
    }
    case "near-goal":
      return `${String(n.goal)} en ${n.when} es una gran meta. Pero ojo: tal como está, ${v("te", "os")} dejaría sin colchón justo después.`;
    case "debt":
      if (n.balance) return `Las tarjetas pesan: ${v("debes", "debéis")} ${money(+n.balance)}, y casi todo lo que ${v("pagas", "pagáis")} cada mes se va en intereses.`;
      return +n.dti <= 0.36
        ? `Las deudas, bajo control. De cada 100 dólares que ${v("ganas", "ganáis")}, ${Math.round(+n.dti * 100)} van a pagarlas, por debajo del límite sano.`
        : `Las deudas se llevan mucho: ${ofHundred(+n.dti)} dólares que ${v("ganas", "ganáis")}.`;
    case "retirement":
      if (n.runOut !== "Not applicable") return `Este es el tramo más empinado. Al ritmo de ahora, los ahorros se acabarían a los ${n.runOut} años.`;
      if (+n.gap > 0) return `La jubilación es el tramo más largo de la ruta. Para retirar${v("te", "os")} a los ${n.retireAge}, como ${v("quieres", "queréis")}, faltan ${money(+n.gap)}.`;
      return `La jubilación va bien encaminada: ${v("tendrías", "tendríais")} cubierto un ${n.incomeShare} por ciento de lo que ${v("gastarás", "gastaréis")}.`;
    case "education": {
      const kids = c.household.kids;
      const who = kids.length > 1 ? `de ${kids.slice(0, -1).join(", ")} y ${kids.at(-1)}` : kids.length ? `de ${kids[0]}` : "";
      return +n.extraSave > 0
        ? `Para la universidad ${who} faltan ${money(+n.gap)}. Con tiempo por delante, se cierra apartando ${money(+n.extraSave)} más al año.`
        : `Para la universidad ${who} faltan ${money(+n.gap)}, y ahora mismo no hay nada apartado para ello.`;
    }
    case "life": {
      const s = (+n.shortfall || 0) + (+n.coShortfall || 0);
      if (!s) return `Aquí no hay de qué preocuparse: si ${v("te", "os")} pasara algo, el seguro de vida cubriría lo que la familia necesita.`;
      return c.household.couple
        ? `Un tema delicado pero importante: si a alguno de los dos le pasara algo, el seguro de vida se quedaría muy corto. Faltan ${money(s)} de cobertura.`
        : `Un tema delicado pero importante: si te pasara algo, el seguro de vida se quedaría corto. Faltan ${money(s)} de cobertura.`;
    }
    case "umbrella":
      return n.recommended
        ? `Un seguro que casi nadie mira: el que ${v("te", "os")} cubre si alguien ${v("te", "os")} demanda. Lo recomendado es ${money(+n.recommended)}, y ahora mismo no ${v("tienes", "tenéis")} ninguno.`
        : `Bien: ${v("tienes", "tenéis")} un seguro que ${v("te", "os")} cubre si alguien ${v("te", "os")} demanda.`;
    case "investments": {
      const d = +n.equity - +n.target;
      if (Math.abs(d) <= 3) return `Las inversiones están bien repartidas para ${v("tu", "vuestra")} edad y ${v("tus", "vuestras")} metas.`;
      return d < 0
        ? `En inversiones ${v("vas", "vais")} con el freno puesto: un ${n.equity} por ciento en acciones, cuando a ${v("tu", "vuestra")} edad encaja más un ${n.target}.`
        : `En inversiones ${v("vas", "vais")} con algo más de riesgo del que toca: un ${n.equity} por ciento en acciones, y lo que encaja es un ${n.target}.`;
    }
  }
  return t.label;
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
