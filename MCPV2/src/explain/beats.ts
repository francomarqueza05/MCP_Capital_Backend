// "Explícame esto": a camp explained step by step, each step a line Cordi says and a visual
// that shows it. Built from the topic's numbers by rules per kind of topic, never from a fixed
// case, so any household Sherpas analyses gets its own explanation. A visual is only data
// (what to show); how it animates lives in Visual.tsx, so animations can grow without
// touching these rules.
import { pillarPoints, type Case, type Topic } from "@/data/cases";
import { BAND, byImpact, CAPS, EFFORT, fixFor, moveName, num, short } from "@/lib/copy";
import type { Step } from "@/expedition/steps";

export type Fmt = "money" | "months" | "pct" | "pts" | "years" | "plain";
export type Tone = "good" | "warn" | "bad" | "neutral";

export type Visual =
  /** The camp's own scene, as on its detail. */
  | { kind: "scene"; topic: Topic }
  /** One number, counted up. */
  | { kind: "figure"; value: number; fmt: Fmt; caption: string; tone?: Tone }
  /** A few amounts side by side, as bars on one scale. */
  | { kind: "bars"; items: { label: string; value: number; tone?: Tone; of?: number }[]; fmt: Fmt }
  /** Where a value sits against what's healthy. */
  | { kind: "range"; value: number; lo: number; hi: number; max: number; fmt: Fmt; label: string }
  /** The score before and after a step. */
  | { kind: "score"; from: number; to: number; label: string }
  /** A short list, revealed one by one. */
  | { kind: "list"; items: { text: string; note?: string; tone?: Tone }[] };

export type Beat = {
  id: string;
  /** What Cordi says. */
  say: string;
  visual: Visual;
  /** Said instead when the person says they didn't get it. */
  simpler?: string;
};

type V = (one: string, two: string) => string;

export function beatsFor(step: Step, c: Case): Beat[] {
  const we = c.household.couple;
  const v: V = (one, two) => (we ? two : one);
  const beats = step.kind === "base" ? base(c, v) : step.kind === "summit" ? summit(c, v) : step.topic ? topic(step.topic, c, v) : [];
  return beats.filter((b): b is Beat => !!b);
}

type Maybe = Beat | false | null | undefined;
const tone = (s: Topic["status"]): Tone => s;

function base(c: Case, v: V): Maybe[] {
  const band = BAND[c.score.band];
  const pillars = c.score.pillars.map((p) => ({ p, ...pillarPoints(p) }));
  const room = [...pillars].sort((a, b) => b.of - b.got - (a.of - a.got))[0];
  return [
    {
      id: "score",
      say: `${v("Tu", "Vuestra")} nota de salud financiera es ${c.score.value} de 100. Está en la franja «${band.label.toLowerCase()}».`,
      visual: { kind: "figure", value: c.score.value, fmt: "pts", caption: "de 100 puntos posibles", tone: band.status },
      simpler: `Piensa en la nota como un examen de 100 puntos: ${v("has", "habéis")} sacado ${c.score.value}.`,
    },
    {
      id: "pillars",
      say: `La nota suma cinco tramos. Cada barra muestra cuántos puntos ${v("llevas", "lleváis")} de los que se pueden sacar en ese tramo.`,
      visual: { kind: "bars", fmt: "pts", items: pillars.map(({ p, got, of }) => ({ label: p.name, value: got, of, tone: p.score >= 70 ? "good" : p.score >= 40 ? "warn" : "bad" })) },
      simpler: "Son cinco asignaturas. La barra llena es la nota máxima de cada una.",
    },
    {
      id: "room",
      say: `Donde más ${v("puedes", "podéis")} subir es en ${room.p.name.toLowerCase()}: ${v("llevas", "lleváis")} ${room.got} de ${room.of}. Quedan ${room.of - room.got} puntos por ganar.`,
      visual: { kind: "bars", fmt: "pts", items: [{ label: room.p.name, value: room.got, of: room.of, tone: "warn" }] },
    },
    c.score.caps.length > 0 && {
      id: "caps",
      say: `Ojo: ${c.score.caps.length > 1 ? "hay dos barreras" : "hay una barrera"} que ponen techo a la nota, aunque el resto vaya bien.`,
      visual: { kind: "list", items: c.score.caps.map((k) => ({ text: CAPS[k] ?? k, tone: "bad" as Tone })) },
      simpler: "Es como un tope: mientras siga ahí, la nota no puede subir libremente.",
    },
    {
      id: "next",
      say: "Ahora vamos tramo a tramo, empezando por el terreno firme.",
      visual: { kind: "list", items: c.topics.map((t) => ({ text: t.title, note: t.label, tone: tone(t.status) })) },
    },
  ];
}

function summit(c: Case, v: V): Maybe[] {
  const moves = byImpact(c.moves);
  const best = moves[0];
  if (!best)
    return [
      {
        id: "keep",
        say: `${v("Vas", "Vais")} por buen camino. El siguiente paso es mantenerlo.`,
        visual: { kind: "figure", value: c.score.value, fmt: "pts", caption: "de 100, y a mantenerlo", tone: "good" },
      },
    ];
  return [
    {
      id: "first",
      say: `El primer paso es ${moveName(best).toLowerCase()}. Con eso, la nota pasaría de ${best.before} a ${best.after}.`,
      visual: { kind: "score", from: best.before, to: best.after, label: moveName(best) },
      simpler: `Es el cambio que más sube la nota por el esfuerzo que cuesta.`,
    },
    {
      id: "all",
      say: "Estos son todos los pasos que propone Sherpas, ordenados por lo que suben la nota.",
      visual: { kind: "bars", fmt: "pts", items: moves.map((m) => ({ label: moveName(m), value: Math.max(0, m.after - m.before), tone: "good" as Tone })) },
    },
    {
      id: "effort",
      say: "No hace falta hacerlo todo a la vez. Fíjate en el esfuerzo de cada uno.",
      visual: { kind: "list", items: moves.map((m) => ({ text: moveName(m), note: `${EFFORT[m.effort]}${m.liftsCap ? " · quita una barrera" : ""}`, tone: m.effort === "low" ? "good" : m.effort === "medium" ? "warn" : ("bad" as Tone) })) },
    },
    {
      id: "advisor",
      say: `${v("Tu", "Vuestro")} asesor de Sherpas tiene esta misma ruta. El siguiente paso es ${v("hablarla", "hablarla")} juntos y empezar por el primero.`,
      visual: { kind: "score", from: c.score.value, to: Math.min(100, c.score.value + moves.reduce((s, m) => s + Math.max(0, m.after - m.before), 0)), label: "Con todos los pasos" },
    },
  ];
}

function topic(t: Topic, c: Case, v: V): Maybe[] {
  const n = t.numbers as Record<string, number & string>;
  const fix = fixFor(c, t);
  const intro: Beat = { id: "intro", say: `${t.title}. ${t.headline}`, visual: { kind: "scene", topic: t } };
  const fixBeat: Maybe = fix &&
    fix.after > fix.before && {
      id: "fix",
      say: `Lo que propone Sherpas: ${moveName(fix).toLowerCase()}. ${EFFORT[fix.effort]}, y la nota subiría de ${fix.before} a ${fix.after}.`,
      visual: { kind: "score", from: fix.before, to: fix.after, label: moveName(fix) },
    };
  const st = tone(t.status);

  switch (t.id) {
    case "emergency":
      return [
        intro,
        {
          id: "what",
          say: `El colchón es el dinero a mano para vivir si los ingresos paran de golpe. ${v("Cubres", "Cubrís")} ${num(+n.months, 1)} meses de gastos.`,
          visual: { kind: "figure", value: +n.months, fmt: "months", caption: "meses de gastos cubiertos", tone: st },
          simpler: "Es la rueda de repuesto: lo que te deja seguir si pinchas.",
        },
        {
          id: "range",
          say: `Lo recomendado para ${v("ti", "vosotros")} es entre ${n.min} y ${n.max} meses. ${+n.months < +n.min ? "Ahora mismo se queda corto." : +n.months > +n.max ? "Tienes de más: esa parte podría trabajar en otras metas." : "Estás justo en la zona sana."}`,
          visual: { kind: "range", value: +n.months, lo: +n.min, hi: +n.max, max: Math.max(+n.max * 1.6, +n.months * 1.15), fmt: "months", label: "Meses de colchón" },
        },
        +n.after < +n.months && {
          id: "after",
          say: `Después de los gastos que ya ${v("tienes", "tenéis")} previstos, quedaría en ${num(+n.after, 1)} meses.`,
          visual: { kind: "bars", fmt: "months", items: [{ label: "Hoy", value: +n.months, tone: st }, { label: "Tras los gastos previstos", value: +n.after, tone: "bad" }] },
        },
      ];
    case "near-goal":
      return [
        intro,
        {
          id: "cost",
          say: `${String(n.goal)}, en ${n.when}, cuesta ${short(+n.amount)}.`,
          visual: { kind: "figure", value: +n.amount, fmt: "money", caption: String(n.goal), tone: "neutral" },
        },
        {
          id: "after",
          say: `Si sale del colchón, pasaría de ${num(+n.months, 1)} meses a ${num(+n.after, 1)}. Sin reserva justo después de la compra.`,
          visual: { kind: "bars", fmt: "months", items: [{ label: "Antes", value: +n.months, tone: "warn" }, { label: "Después", value: +n.after, tone: "bad" }] },
          simpler: "Es como gastar la rueda de repuesto en el viaje: llegas, pero sin plan B.",
        },
      ];
    case "debt":
      if (n.balance)
        return [
          intro,
          {
            id: "balance",
            say: `${v("Debes", "Debéis")} ${short(+n.balance)} en tarjetas de crédito.`,
            visual: { kind: "figure", value: +n.balance, fmt: "money", caption: "de deuda en tarjetas", tone: "bad" },
          },
          {
            id: "split",
            say: `Cada mes ${v("pagas", "pagáis")} ${short(+n.monthly)}, pero ${short(+n.interest)} se van en intereses. Solo ${short(+n.monthly - +n.interest)} bajan la deuda de verdad.`,
            visual: { kind: "bars", fmt: "money", items: [{ label: "Pago al mes", value: +n.monthly, tone: "neutral" }, { label: "Se va en intereses", value: +n.interest, tone: "bad" }, { label: "Baja la deuda", value: +n.monthly - +n.interest, tone: "good" }] },
            simpler: "Es como subir por una escalera mecánica que baja: caminas, pero casi no avanzas.",
          },
          fixBeat,
        ];
      return [
        intro,
        {
          id: "dti",
          say: `De cada 100 que ${v("ganas", "ganáis")}, ${Math.round(+n.dti * 100)} se van en deudas. Hasta 36 se considera sano.`,
          visual: { kind: "range", value: +n.dti * 100, lo: 0, hi: 36, max: 60, fmt: "pct", label: "Del sueldo a deudas" },
        },
      ];
    case "cashflow": {
      const flow = +n.flow;
      const income = +n.income;
      return [
        intro,
        {
          id: "flow",
          say: `Al año ${v("entran", "entran")} ${short(income)}. ${flow < 0 ? `Salen ${short(flow)} más de lo que entra, y la diferencia se paga con ahorros.` : `Después de todo, ${v("te", "os")} quedan ${short(flow)} libres.`}`,
          visual: { kind: "bars", fmt: "money", items: [{ label: "Entra", value: income, tone: "good" }, { label: "Sale", value: income - flow, tone: flow < 0 ? "bad" : "neutral" }] },
          simpler: flow < 0 ? "Es un cubo con una pequeña fuga: tiras del depósito para llenarlo." : "Es el agua que sobra cada año en el cubo.",
        },
        {
          id: "rate",
          say: `${v("Ahorras", "Ahorráis")} un ${Math.round(+n.saveRate * 100)}% de lo que ${v("ganas", "ganáis")}. Lo habitual es apuntar al 15 a 20%.`,
          visual: { kind: "range", value: +n.saveRate * 100, lo: 15, hi: 30, max: 40, fmt: "pct", label: "Tasa de ahorro" },
        },
        fixBeat,
      ];
    }
    case "retirement": {
      const runs = n.runOut !== "Not applicable";
      return [
        intro,
        runs
          ? {
              id: "runout",
              say: `Al ritmo previsto, ${v("sacarías", "sacaríais")} un ${num(+n.draw, 1)}% de los ahorros cada año. Es más de lo que crecen: a los ${n.runOut} años se acabarían.`,
              visual: { kind: "figure", value: +n.runOut, fmt: "years", caption: "años: se acabarían los ahorros", tone: "bad" },
              simpler: "Es una despensa que vacías más rápido de lo que la llenas.",
            }
          : +n.gap > 0 && {
              id: "gap",
              say: `Para jubilar${v("te", "os")} a los ${n.retireAge} harían falta ${short(+n.projected + +n.gap)}. Al ritmo actual ${v("llegarías", "llegaríais")} a ${short(+n.projected)}.`,
              visual: { kind: "bars", fmt: "money", items: [{ label: "Lo que hace falta", value: +n.projected + +n.gap, tone: "neutral" }, { label: "Lo que tendréis".replace("tendréis", v("tendrás", "tendréis")), value: +n.projected, tone: "bad" }] },
              simpler: "Es un depósito para un viaje largo: ahora mismo no llega hasta el destino.",
            },
        {
          id: "share",
          say: `Con lo previsto, quedaría cubierto un ${n.incomeShare}% de lo que ${v("gastarías", "gastaríais")} de jubilado.`,
          visual: { kind: "range", value: +n.incomeShare, lo: 80, hi: 100, max: 100, fmt: "pct", label: "Gastos de jubilado cubiertos" },
        },
        +n.extraSave > 0 && {
          id: "extra",
          say: `Para cerrar el hueco harían falta unos ${short(+n.extraSave)} más de ahorro al año.`,
          visual: { kind: "figure", value: +n.extraSave, fmt: "money", caption: "más de ahorro al año", tone: "warn" },
        },
        fixBeat,
      ];
    }
    case "education":
      return [
        intro,
        {
          id: "gap",
          say: `La universidad costará ${short(+n.need)}. Hay ${short(+n.have)} ahorrados, así que faltan ${short(+n.gap)}.`,
          visual: { kind: "bars", fmt: "money", items: [{ label: "Hace falta", value: +n.need, tone: "neutral" }, { label: "Ahorrado", value: +n.have, tone: "good" }, { label: "Falta", value: +n.gap, tone: "bad" }] },
          simpler: "Es una hucha con fecha: cuanto antes se llena, menos cuesta cada mes.",
        },
        +n.extraSave > 0 && {
          id: "extra",
          say: `Apartando unos ${short(+n.extraSave)} más al año, se llega a tiempo.`,
          visual: { kind: "figure", value: +n.extraSave, fmt: "money", caption: "más al año para la universidad", tone: "warn" },
        },
      ];
    case "life": {
      const people = (n.people as unknown as { name: string; has: number; need: number }[]) ?? [];
      return [
        intro,
        {
          id: "why",
          say: "El seguro de vida sirve para que, si alguien falta, la familia pueda seguir con su vida: la casa, los estudios, los gastos.",
          visual: { kind: "list", items: [{ text: "La casa" }, { text: "Los estudios" }, { text: "Los gastos del día a día" }] },
          simpler: "Es el paraguas de la familia.",
        },
        ...people.map<Beat>((p, i) => ({
          id: `person-${i}`,
          say: `${p.name} tiene ${short(p.has)} de cobertura y necesitaría ${short(p.need)}.${p.need > p.has ? ` Faltan ${short(p.need - p.has)}.` : " Está bien cubierto."}`,
          visual: { kind: "bars", fmt: "money", items: [{ label: "Necesitaría", value: p.need, tone: "neutral" }, { label: "Tiene", value: p.has, tone: p.has >= p.need ? "good" : "bad" }] },
        })),
        fixBeat,
      ];
    }
    case "umbrella":
      return [
        intro,
        {
          id: "what",
          say: `Es un seguro «paraguas»: cubre lo que no cubren los de casa y coche si alguien ${v("te", "os")} demanda.`,
          visual: { kind: "list", items: [{ text: "Seguro de casa" }, { text: "Seguro de coche" }, { text: "Paraguas por encima de los dos", tone: "good" }] },
          simpler: "Un paraguas grande encima de los otros seguros, por si llueve más fuerte.",
        },
        {
          id: "amount",
          say: n.recommended ? `Lo recomendado son ${short(+n.recommended)} de cobertura, y ahora no ${v("tienes", "tenéis")} ninguna.` : `${v("Tienes", "Tenéis")} ${short(+n.current)} de cobertura. Bien cubierto.`,
          visual: { kind: "figure", value: +(n.recommended || n.current), fmt: "money", caption: n.recommended ? "de cobertura recomendada" : "de cobertura actual", tone: n.recommended ? "bad" : "good" },
        },
        fixBeat,
      ];
    case "investments":
      return [
        intro,
        {
          id: "mix",
          say: `Hoy un ${n.equity}% de ${v("tus", "vuestras")} inversiones está en acciones. Para ${v("tu", "vuestra")} edad y metas, lo que encaja es un ${n.target}%.`,
          visual: { kind: "range", value: +n.equity, lo: +n.target - 3, hi: +n.target + 3, max: 100, fmt: "pct", label: "En acciones" },
          simpler: "Es la mezcla de la mochila: más acciones dan más impulso, y más vaivén.",
        },
        n.sector && {
          id: "sector",
          say: `Mucho está en un mismo sector, ${n.sector === "Technology" ? "tecnología" : n.sector}: un mal año ahí afecta a todo.${n.leveraged ? ` Y hay un fondo apalancado, ${n.leveraged}, que amplifica subidas y bajadas.` : ""}`,
          visual: { kind: "list", items: [{ text: n.sector === "Technology" ? "Tecnología" : String(n.sector), note: "sector con mucho peso", tone: "warn" }, ...(n.leveraged ? [{ text: String(n.leveraged), note: "fondo apalancado", tone: "bad" as Tone }] : [])] },
        },
        fixBeat,
      ];
  }
  // a topic these rules don't know yet still gets explained, from what every topic carries
  return [intro, { id: "label", say: t.label, visual: { kind: "list", items: [{ text: t.title, note: t.label, tone: st }] } }, fixBeat];
}
