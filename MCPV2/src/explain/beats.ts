// "Explícame esto": a camp explained step by step, each step a line Cordi says and a visual
// that shows it. Built from the topic's numbers by rules per kind of topic, never from a fixed
// case, so any household Sherpas analyses gets its own explanation. A visual is only data
// (what to show); how it animates lives in Visual.tsx, so animations can grow without
// touching these rules.
import { pillarPoints, type Case, type Topic } from "@/data/cases";
import { BAND, byImpact, CAPS, EFFORT, fixFor, moveName } from "@/lib/copy";
import { fixRank, money, months, pickBy } from "@/lib/talk";
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
      say: `Lo primero, la nota. ${v("Tienes", "Tenéis")} un ${c.score.value} sobre 100, que es una salud financiera ${band.label.toLowerCase()}.`,
      visual: { kind: "figure", value: c.score.value, fmt: "pts", caption: "de 100 puntos posibles", tone: band.status },
      simpler: `Piensa en la nota como un examen de 100 puntos: ${v("has", "habéis")} sacado ${c.score.value}.`,
    },
    {
      id: "pillars",
      say: `Esa nota sale de sumar cinco partes. Cada barra es una de ellas: lo relleno es lo que ${v("llevas", "lleváis")}, y lo vacío, lo que aún se puede ganar.`,
      visual: { kind: "bars", fmt: "pts", items: pillars.map(({ p, got, of }) => ({ label: p.name, value: got, of, tone: p.score >= 70 ? "good" : p.score >= 40 ? "warn" : "bad" })) },
      simpler: "Son cinco asignaturas. La barra llena es la nota máxima de cada una.",
    },
    {
      id: "room",
      say: `Fíja${v("te", "os")} en ${room.p.name.toLowerCase()}: ${v("llevas", "lleváis")} ${room.got} de ${room.of}. Ahí quedan ${room.of - room.got} puntos sobre la mesa, más que en ninguna otra.`,
      visual: { kind: "bars", fmt: "pts", items: [{ label: room.p.name, value: room.got, of: room.of, tone: "warn" }] },
    },
    c.score.caps.length > 0 && {
      id: "caps",
      say: `Y un detalle importante: ${c.score.caps.length > 1 ? "hay dos cosas que ponen" : "hay una cosa que pone"} techo a la nota. Aunque todo lo demás mejore, mientras ${c.score.caps.length > 1 ? "sigan" : "siga"} ahí, la nota no despega.`,
      visual: { kind: "list", items: c.score.caps.map((k) => ({ text: CAPS[k] ?? k, tone: "bad" as Tone })) },
      simpler: "Es como un tope: mientras siga ahí, la nota no puede subir libremente.",
    },
    {
      id: "next",
      say: "Esta es la ruta completa. Iremos de lo que va mejor a lo que más cuesta, sin prisa.",
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
        say: `${v("Vas", "Vais")} por buen camino. Ahora el trabajo es mantenerlo.`,
        visual: { kind: "figure", value: c.score.value, fmt: "pts", caption: "de 100, y a mantenerlo", tone: "good" },
      },
    ];
  return [
    {
      id: "first",
      say: `Si solo ${v("pudieras", "pudierais")} hacer una cosa, sería esta: ${moveName(best).toLowerCase()}. La nota pasaría de ${best.before} a ${best.after}.`,
      visual: { kind: "score", from: best.before, to: best.after, label: moveName(best) },
      simpler: `Es el cambio que más sube la nota por el esfuerzo que cuesta.`,
    },
    {
      id: "all",
      say: "Aquí están todos los pasos que propone Sherpas, de más a menos impacto.",
      visual: { kind: "bars", fmt: "pts", items: moves.map((m) => ({ label: moveName(m), value: Math.max(0, m.after - m.before), tone: "good" as Tone })) },
    },
    {
      id: "effort",
      say: `No hace falta hacerlo todo de golpe. ${v("Mira", "Mirad")} cuánto cuesta cada uno: a veces lo fácil ya da mucho.`,
      visual: { kind: "list", items: moves.map((m) => ({ text: moveName(m), note: `${EFFORT[m.effort]}${m.liftsCap ? " · quita una barrera" : ""}`, tone: m.effort === "low" ? "good" : m.effort === "medium" ? "warn" : ("bad" as Tone) })) },
    },
    {
      id: "advisor",
      say: `${v("Tu", "Vuestro")} asesor tiene esta misma ruta. Lo ideal es revisarla juntos, elegir el primer paso y ponerle fecha.`,
      visual: { kind: "score", from: c.score.value, to: Math.min(100, c.score.value + moves.reduce((s, m) => s + Math.max(0, m.after - m.before), 0)), label: "Con todos los pasos" },
    },
  ];
}

/** How Cordi opens each topic's explanation: what it is, in plain words, before any figure. */
function opener(t: Topic, c: Case, v: V): string {
  const n = t.numbers as Record<string, number & string>;
  switch (t.id) {
    case "cashflow":
      return "Empecemos por lo básico: lo que entra y lo que sale cada año. Todo lo demás depende de esto.";
    case "emergency":
      return "Vamos con el colchón: el dinero que tienes a mano para cuando algo se tuerce.".replace("tienes", v("tienes", "tenéis"));
    case "near-goal":
      return `Hablemos de ${String(n.goal).toLowerCase()}. Es una buena meta; lo que vamos a mirar es cómo encaja con el resto.`;
    case "debt":
      return "Ahora, las deudas. No todas son malas; lo que importa es cuánto pesan y cuánto cuestan.";
    case "retirement":
      return "La jubilación. Es el tramo más largo, y justo por eso lo que se haga hoy cuenta muchísimo.";
    case "education":
      return c.household.kids.length ? `Pensemos en los estudios de ${c.household.kids.join(" y ")}.` : "Pensemos en los estudios.";
    case "life":
      return "Este tema no es agradable, pero es de los que más importan: el seguro de vida.";
    case "umbrella":
      return "Este es un seguro del que poca gente ha oído hablar, y que puede ahorrar un disgusto enorme.";
    case "investments":
      return `Vamos a mirar cómo ${v("tienes", "tenéis")} invertido el dinero.`;
  }
  return `Vamos con ${t.title.toLowerCase()}.`;
}

function topic(t: Topic, c: Case, v: V): Maybe[] {
  const n = t.numbers as Record<string, number & string>;
  const fix = fixFor(c, t);
  const intro: Beat = { id: "intro", say: opener(t, c, v), visual: { kind: "scene", topic: t } };
  const fixBeat: Maybe = fix &&
    fix.after > fix.before && {
      id: "fix",
      say: pickBy(fixRank(c, t), [
        `¿Y qué se puede hacer? Sherpas propone ${moveName(fix).toLowerCase()}. ${EFFORT[fix.effort]}, y la nota subiría de ${fix.before} a ${fix.after}.`,
        `La propuesta para este tramo: ${moveName(fix).toLowerCase()}. Con eso, de ${fix.before} a ${fix.after} puntos. ${EFFORT[fix.effort]}.`,
        `Aquí la solución es ${moveName(fix).toLowerCase()}. Pide ${EFFORT[fix.effort].toLowerCase()}, y la nota pasaría de ${fix.before} a ${fix.after}.`,
      ]),
      visual: { kind: "score", from: fix.before, to: fix.after, label: moveName(fix) },
    };
  const st = tone(t.status);

  switch (t.id) {
    case "emergency":
      return [
        intro,
        {
          id: "what",
          say: `Si los ingresos se cortaran mañana, ${v("podrías", "podríais")} vivir ${months(+n.months)} con lo que ${v("tienes", "tenéis")} guardado.`,
          visual: { kind: "figure", value: +n.months, fmt: "months", caption: "meses de gastos cubiertos", tone: st },
          simpler: "Es la rueda de repuesto: lo que te deja seguir si pinchas.",
        },
        {
          id: "range",
          say: `Para ${v("tu", "vuestra")} situación, lo prudente es tener entre ${n.min} y ${n.max} meses. ${+n.months < +n.min ? "Ahora mismo se queda bastante corto." : +n.months > +n.max ? "Vas por encima: esa parte de más podría estar creciendo en otro sitio.".replace("Vas", v("Vas", "Vais")) : "Estás justo en la zona buena.".replace("Estás", v("Estás", "Estáis"))}`,
          visual: { kind: "range", value: +n.months, lo: +n.min, hi: +n.max, max: Math.max(+n.max * 1.6, +n.months * 1.15), fmt: "months", label: "Meses de colchón" },
        },
        +n.after < +n.months && {
          id: "after",
          say: `Y con los gastos que ya ${v("tienes", "tenéis")} en el horizonte, bajaría a ${months(+n.after)}.`,
          visual: { kind: "bars", fmt: "months", items: [{ label: "Hoy", value: +n.months, tone: st }, { label: "Tras los gastos previstos", value: +n.after, tone: "bad" }] },
        },
      ];
    case "near-goal":
      return [
        intro,
        {
          id: "cost",
          say: `${String(n.goal)}, para ${n.when}, supone ${money(+n.amount)}.`,
          visual: { kind: "figure", value: +n.amount, fmt: "money", caption: String(n.goal), tone: "neutral" },
        },
        {
          id: "after",
          say: `Si ese dinero sale del colchón, ${v("pasarías", "pasaríais")} de ${months(+n.months)} a ${+n.after ? months(+n.after) : "nada"}. Es decir, sin red justo cuando más gastos nuevos aparecen.`,
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
            say: `En las tarjetas hay ${money(+n.balance)} pendientes.`,
            visual: { kind: "figure", value: +n.balance, fmt: "money", caption: "de deuda en tarjetas", tone: "bad" },
          },
          {
            id: "split",
            say: `Y aquí está el problema: de los ${money(+n.monthly)} que ${v("pagas", "pagáis")} al mes, ${money(+n.interest)} son intereses. La deuda solo baja ${money(+n.monthly - +n.interest)} al mes.`,
            visual: { kind: "bars", fmt: "money", items: [{ label: "Pago al mes", value: +n.monthly, tone: "neutral" }, { label: "Se va en intereses", value: +n.interest, tone: "bad" }, { label: "Baja la deuda", value: +n.monthly - +n.interest, tone: "good" }] },
            simpler: "Es como subir por una escalera mecánica que baja: caminas, pero casi no avanzas.",
          },
          fixBeat,
        ];
      return [
        intro,
        {
          id: "dti",
          say: `De cada 100 dólares que ${v("ganas", "ganáis")}, ${Math.round(+n.dti * 100)} van a deudas. Hasta 36 se considera sano${+n.dti <= 0.36 ? ", así que aquí no hay de qué preocuparse" : ""}.`,
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
          say: `Entran ${money(income)} al año. ${flow < 0 ? `Pero salen ${money(-flow)} más, y ese hueco se tapa con ahorros.` : `Pagado todo, quedan ${money(flow)}.`}`,
          visual: { kind: "bars", fmt: "money", items: [{ label: "Entra", value: income, tone: "good" }, { label: "Sale", value: income - flow, tone: flow < 0 ? "bad" : "neutral" }] },
          simpler: flow < 0 ? "Es un cubo con una pequeña fuga: tiras del depósito para llenarlo." : "Es el agua que sobra cada año en el cubo.",
        },
        {
          id: "rate",
          say: `${v("Estás ahorrando", "Estáis ahorrando")} ${Math.round(+n.saveRate * 100)} de cada 100 dólares. Lo recomendable es entre 15 y 20.`,
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
              say: `Tal como está el plan, cada año ${v("sacarías", "sacaríais")} más de lo que los ahorros crecen. La cuenta llegaría a cero a los ${n.runOut} años.`,
              visual: { kind: "figure", value: +n.runOut, fmt: "years", caption: "años: se acabarían los ahorros", tone: "bad" },
              simpler: "Es una despensa que vacías más rápido de lo que la llenas.",
            }
          : +n.gap > 0 && {
              id: "gap",
              say: `Para jubilar${v("te", "os")} a los ${n.retireAge} harían falta ${money(+n.projected + +n.gap)}. Al ritmo de ahora, ${v("llegarías", "llegaríais")} a ${money(+n.projected)}.`,
              visual: { kind: "bars", fmt: "money", items: [{ label: "Lo que hace falta", value: +n.projected + +n.gap, tone: "neutral" }, { label: v("Lo que tendrás", "Lo que tendréis"), value: +n.projected, tone: "bad" }] },
              simpler: "Es un depósito para un viaje largo: ahora mismo no llega hasta el destino.",
            },
        {
          id: "share",
          say: +n.incomeShare >= 80 ? `Eso cubriría ${n.incomeShare} de cada 100 dólares que ${v("gastarás", "gastaréis")} en la jubilación. Muy bien.` : `Dicho de otra forma: de cada 100 dólares que ${v("gastarás", "gastaréis")} en la jubilación, solo ${n.incomeShare} estarían cubiertos.`,
          visual: { kind: "range", value: +n.incomeShare, lo: 80, hi: 100, max: 100, fmt: "pct", label: "Gastos de jubilado cubiertos" },
        },
        +n.extraSave > 0 && {
          id: "extra",
          say: `Para cerrar ese hueco haría falta ahorrar ${money(+n.extraSave)} más al año.`,
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
          say: +n.have > 0 ? `La universidad costará ${money(+n.need)}. Ya hay ${money(+n.have)} guardados, así que faltan ${money(+n.gap)}.` : `La universidad costará ${money(+n.need)}, y de momento no hay nada guardado para ello.`,
          visual: { kind: "bars", fmt: "money", items: [{ label: "Hace falta", value: +n.need, tone: "neutral" }, { label: "Ahorrado", value: +n.have, tone: "good" }, { label: "Falta", value: +n.gap, tone: "bad" }] },
          simpler: "Es una hucha con fecha: cuanto antes se llena, menos cuesta cada mes.",
        },
        +n.extraSave > 0 && {
          id: "extra",
          say: `La buena noticia: apartando ${money(+n.extraSave)} más al año, se llega a tiempo.`,
          visual: { kind: "figure", value: +n.extraSave, fmt: "money", caption: "más al año para la universidad", tone: "warn" },
        },
      ];
    case "life": {
      const people = (n.people as unknown as { name: string; has: number; need: number }[]) ?? [];
      return [
        intro,
        {
          id: "why",
          say: "Sirve para una cosa: que si alguien falta, la familia pueda seguir adelante. La casa, los estudios, el día a día.",
          visual: { kind: "list", items: [{ text: "La casa" }, { text: "Los estudios" }, { text: "Los gastos del día a día" }] },
          simpler: "Es el paraguas de la familia.",
        },
        ...people.map<Beat>((p, i) => ({
          id: `person-${i}`,
          say:
            p.need > p.has
              ? `${i ? "En el caso de" : "Empecemos por"} ${p.name}: tiene ${money(p.has)} de seguro y harían falta ${money(p.need)}.`
              : `${p.name} tiene ${money(p.has)} de seguro, más de lo que hace falta. Bien cubierto.`,
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
          say: `Se llama seguro paraguas: si alguien ${v("te", "os")} demanda y la cifra supera lo que cubren los seguros de casa y coche, este cubre el resto.`,
          visual: { kind: "list", items: [{ text: "Seguro de casa" }, { text: "Seguro de coche" }, { text: "Paraguas por encima de los dos", tone: "good" }] },
          simpler: "Un paraguas grande encima de los otros seguros, por si llueve más fuerte.",
        },
        {
          id: "amount",
          say: n.recommended ? `Para ${v("tu", "vuestra")} situación se recomienda ${money(+n.recommended)} de cobertura. Y suele ser bastante barato.` : `${v("Tienes", "Tenéis")} ${money(+n.current)} de cobertura. Más que suficiente.`,
          visual: { kind: "figure", value: +(n.recommended || n.current), fmt: "money", caption: n.recommended ? "de cobertura recomendada" : "de cobertura actual", tone: n.recommended ? "bad" : "good" },
        },
        fixBeat,
      ];
    case "investments":
      return [
        intro,
        {
          id: "mix",
          say: `Ahora mismo, ${n.equity} de cada 100 dólares invertidos están en acciones. Para ${v("tu", "vuestra")} edad y lo que ${v("quieres", "queréis")} conseguir, lo que encaja es ${n.target}.`,
          visual: { kind: "range", value: +n.equity, lo: +n.target - 3, hi: +n.target + 3, max: 100, fmt: "pct", label: "En acciones" },
          simpler: "Es la mezcla de la mochila: más acciones dan más impulso, y más vaivén.",
        },
        n.sector && {
          id: "sector",
          say: `Además, mucho está concentrado en ${n.sector === "Technology" ? "tecnología" : n.sector}. Si ese sector tiene un mal año, lo nota todo.${n.leveraged ? ` Y hay un fondo apalancado, ${n.leveraged}, que multiplica tanto las subidas como las caídas.` : ""}`,
          visual: { kind: "list", items: [{ text: n.sector === "Technology" ? "Tecnología" : String(n.sector), note: "sector con mucho peso", tone: "warn" }, ...(n.leveraged ? [{ text: String(n.leveraged), note: "fondo apalancado", tone: "bad" as Tone }] : [])] },
        },
        fixBeat,
      ];
  }
  // a topic these rules don't know yet still gets explained, from what every topic carries
  return [intro, { id: "label", say: t.label, visual: { kind: "list", items: [{ text: t.title, note: t.label, tone: st }] } }, fixBeat];
}
