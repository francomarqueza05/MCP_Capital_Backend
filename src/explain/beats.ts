// "Explain this": a camp explained step by step, each step a line Cordi says and a visual
// that shows it. Built from the topic's numbers by rules per kind of topic, never from a fixed
// case, so any household Sherpas analyses gets its own explanation. A visual is only data
// (what to show); how it animates lives in Visual.tsx, so animations can grow without
// touching these rules. Every line exists in English and Spanish (tr).
import { pillarPoints, type Case, type Topic } from "@/data/cases";
import { BAND, byImpact, CAPS, EFFORT, fixFor, moveName } from "@/lib/copy";
import { tr } from "@/lib/lang";
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
  const two = c.score.caps.length > 1;
  return [
    {
      id: "score",
      say: tr(
        `First, the score. You have ${c.score.value} out of 100, which is ${band.label.toLowerCase()} financial health.`,
        `Lo primero, la nota. ${v("Tienes", "Tenéis")} un ${c.score.value} sobre 100, que es una salud financiera ${band.label.toLowerCase()}.`,
      ),
      visual: { kind: "figure", value: c.score.value, fmt: "pts", caption: tr("out of 100 possible points", "de 100 puntos posibles"), tone: band.status },
      simpler: tr(`Think of the score as a test out of 100: you got ${c.score.value}.`, `Piensa en la nota como un examen de 100 puntos: ${v("has", "habéis")} sacado ${c.score.value}.`),
    },
    {
      id: "pillars",
      say: tr(
        `That score adds up five parts. Each bar is one of them: the filled part is what you have, and the empty part is what you can still earn.`,
        `Esa nota sale de sumar cinco partes. Cada barra es una de ellas: lo relleno es lo que ${v("llevas", "lleváis")}, y lo vacío, lo que aún se puede ganar.`,
      ),
      visual: { kind: "bars", fmt: "pts", items: pillars.map(({ p, got, of }) => ({ label: p.name, value: got, of, tone: p.score >= 70 ? "good" : p.score >= 40 ? "warn" : "bad" })) },
      simpler: tr("Five subjects. A full bar is the top mark in each one.", "Son cinco asignaturas. La barra llena es la nota máxima de cada una."),
    },
    {
      id: "room",
      say: tr(
        `Look at ${room.p.name.toLowerCase()}: you have ${room.got} of ${room.of}. That leaves ${room.of - room.got} points on the table, more than anywhere else.`,
        `Fíja${v("te", "os")} en ${room.p.name.toLowerCase()}: ${v("llevas", "lleváis")} ${room.got} de ${room.of}. Ahí quedan ${room.of - room.got} puntos sobre la mesa, más que en ninguna otra.`,
      ),
      visual: { kind: "bars", fmt: "pts", items: [{ label: room.p.name, value: room.got, of: room.of, tone: "warn" }] },
    },
    c.score.caps.length > 0 && {
      id: "caps",
      say: tr(
        `And one important detail: ${two ? "two things put" : "one thing puts"} a ceiling on the score. Even if everything else improves, while ${two ? "they're" : "it's"} there, the score won't take off.`,
        `Y un detalle importante: ${two ? "hay dos cosas que ponen" : "hay una cosa que pone"} techo a la nota. Aunque todo lo demás mejore, mientras ${two ? "sigan" : "siga"} ahí, la nota no despega.`,
      ),
      visual: { kind: "list", items: c.score.caps.map((k) => ({ text: CAPS[k] ?? k, tone: "bad" as Tone })) },
      simpler: tr("It's like a lid: while it's there, the score can't rise freely.", "Es como un tope: mientras siga ahí, la nota no puede subir libremente."),
    },
    {
      id: "next",
      say: tr("This is the whole route. We'll go from what's going best to what takes the most work, no rush.", "Esta es la ruta completa. Iremos de lo que va mejor a lo que más cuesta, sin prisa."),
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
        say: tr("You're on track. Now the job is keeping it that way.", `${v("Vas", "Vais")} por buen camino. Ahora el trabajo es mantenerlo.`),
        visual: { kind: "figure", value: c.score.value, fmt: "pts", caption: tr("out of 100, and holding", "de 100, y a mantenerlo"), tone: "good" },
      },
    ];
  return [
    {
      id: "first",
      say: tr(
        `If you could only do one thing, it would be this: ${moveName(best).toLowerCase()}. Your score would go from ${best.before} to ${best.after}.`,
        `Si solo ${v("pudieras", "pudierais")} hacer una cosa, sería esta: ${moveName(best).toLowerCase()}. La nota pasaría de ${best.before} a ${best.after}.`,
      ),
      visual: { kind: "score", from: best.before, to: best.after, label: moveName(best) },
      simpler: tr("It's the change that lifts the score most for the effort it takes.", "Es el cambio que más sube la nota por el esfuerzo que cuesta."),
    },
    {
      id: "all",
      say: tr("Here are all the steps Sherpas suggests, from most to least impact.", "Aquí están todos los pasos que propone Sherpas, de más a menos impacto."),
      visual: { kind: "bars", fmt: "pts", items: moves.map((m) => ({ label: moveName(m), value: Math.max(0, m.after - m.before), tone: "good" as Tone })) },
    },
    {
      id: "effort",
      say: tr(
        "You don't have to do it all at once. Look at what each one takes: sometimes the easy one already gives a lot.",
        `No hace falta hacerlo todo de golpe. ${v("Mira", "Mirad")} cuánto cuesta cada uno: a veces lo fácil ya da mucho.`,
      ),
      visual: {
        kind: "list",
        items: moves.map((m) => ({
          text: moveName(m),
          note: `${EFFORT[m.effort]}${m.liftsCap ? tr(" · removes a barrier", " · quita una barrera") : ""}`,
          tone: m.effort === "low" ? "good" : m.effort === "medium" ? "warn" : ("bad" as Tone),
        })),
      },
    },
    {
      id: "advisor",
      say: tr(
        "Now let's make it real: pick your first step, give it a date, and I'll remind you. Your advisor has this same route.",
        `Ahora, hagámoslo real: ${v("elige", "elegid")} el primer paso, ${v("ponle", "ponedle")} fecha y yo ${v("te", "os")} lo recuerdo. ${v("Tu", "Vuestro")} asesor tiene esta misma ruta.`,
      ),
      visual: {
        kind: "score",
        from: c.score.value,
        to: Math.min(100, c.score.value + moves.reduce((s, m) => s + Math.max(0, m.after - m.before), 0)),
        label: tr("With every step", "Con todos los pasos"),
      },
    },
  ];
}

/** How Cordi opens each topic's explanation: what it is, in plain words, before any figure. */
function opener(t: Topic, c: Case, v: V): string {
  const n = t.numbers as Record<string, number & string>;
  switch (t.id) {
    case "cashflow":
      return tr("Let's start with the basics: what comes in and what goes out each year. Everything else depends on this.", "Empecemos por lo básico: lo que entra y lo que sale cada año. Todo lo demás depende de esto.");
    case "emergency":
      return tr("Now the cushion: the money you have at hand for when something goes wrong.", `Vamos con el colchón: el dinero que ${v("tienes", "tenéis")} a mano para cuando algo se tuerce.`);
    case "near-goal":
      return tr(
        `Let's talk about ${String(n.goal).toLowerCase()}. It's a good goal; what we'll look at is how it fits with the rest.`,
        `Hablemos de ${String(n.goal).toLowerCase()}. Es una buena meta; lo que vamos a mirar es cómo encaja con el resto.`,
      );
    case "debt":
      return tr("Now, debt. Not all debt is bad; what matters is how heavy it is and what it costs.", "Ahora, las deudas. No todas son malas; lo que importa es cuánto pesan y cuánto cuestan.");
    case "retirement":
      return tr("Retirement. It's the longest stretch, and that's exactly why what you do today counts so much.", "La jubilación. Es el tramo más largo, y justo por eso lo que se haga hoy cuenta muchísimo.");
    case "education":
      return c.household.kids.length
        ? tr(`Let's think about college for ${c.household.kids.join(" and ")}.`, `Pensemos en los estudios de ${c.household.kids.join(" y ")}.`)
        : tr("Let's think about college.", "Pensemos en los estudios.");
    case "life":
      return tr("This topic isn't pleasant, but it's one of the ones that matter most: life insurance.", "Este tema no es agradable, pero es de los que más importan: el seguro de vida.");
    case "umbrella":
      return tr("This is insurance few people have heard of, and it can save you a huge headache.", "Este es un seguro del que poca gente ha oído hablar, y que puede ahorrar un disgusto enorme.");
    case "investments":
      return tr("Let's look at how your money is invested.", `Vamos a mirar cómo ${v("tienes", "tenéis")} invertido el dinero.`);
  }
  return tr(`Let's look at ${t.title.toLowerCase()}.`, `Vamos con ${t.title.toLowerCase()}.`);
}

function topic(t: Topic, c: Case, v: V): Maybe[] {
  const n = t.numbers as Record<string, number & string>;
  const fix = fixFor(c, t);
  const intro: Beat = { id: "intro", say: opener(t, c, v), visual: { kind: "scene", topic: t } };
  const fixBeat: Maybe = fix &&
    fix.after > fix.before && {
      id: "fix",
      say: pickBy(
        fixRank(c, t),
        tr(
          [
            `So what can you do? Sherpas suggests you ${moveName(fix).toLowerCase()}. ${EFFORT[fix.effort]}, and your score would rise from ${fix.before} to ${fix.after}.`,
            `The plan for this stretch: ${moveName(fix).toLowerCase()}. That takes you from ${fix.before} to ${fix.after} points. ${EFFORT[fix.effort]}.`,
            `The fix here is to ${moveName(fix).toLowerCase()}. It takes ${EFFORT[fix.effort].toLowerCase()}, and your score would go from ${fix.before} to ${fix.after}.`,
          ],
          [
            `¿Y qué se puede hacer? Sherpas propone ${moveName(fix).toLowerCase()}. ${EFFORT[fix.effort]}, y la nota subiría de ${fix.before} a ${fix.after}.`,
            `La propuesta para este tramo: ${moveName(fix).toLowerCase()}. Con eso, de ${fix.before} a ${fix.after} puntos. ${EFFORT[fix.effort]}.`,
            `Aquí la solución es ${moveName(fix).toLowerCase()}. Pide ${EFFORT[fix.effort].toLowerCase()}, y la nota pasaría de ${fix.before} a ${fix.after}.`,
          ],
        ),
      ),
      visual: { kind: "score", from: fix.before, to: fix.after, label: moveName(fix) },
    };
  const st = tone(t.status);

  switch (t.id) {
    case "emergency":
      return [
        intro,
        {
          id: "what",
          say: tr(
            `If your income stopped tomorrow, you could live ${months(+n.months)} on what you have saved.`,
            `Si los ingresos se cortaran mañana, ${v("podrías", "podríais")} vivir ${months(+n.months)} con lo que ${v("tienes", "tenéis")} guardado.`,
          ),
          visual: { kind: "figure", value: +n.months, fmt: "months", caption: tr("months of expenses covered", "meses de gastos cubiertos"), tone: st },
          simpler: tr("It's the spare tyre: what keeps you going if you get a flat.", "Es la rueda de repuesto: lo que te deja seguir si pinchas."),
        },
        {
          id: "range",
          say: tr(
            `For your situation, the safe amount is ${n.min} to ${n.max} months. ${+n.months < +n.min ? "Right now it falls well short." : +n.months > +n.max ? "You're above it: that extra could be growing somewhere else." : "You're right in the good zone."}`,
            `Para ${v("tu", "vuestra")} situación, lo prudente es tener entre ${n.min} y ${n.max} meses. ${+n.months < +n.min ? "Ahora mismo se queda bastante corto." : +n.months > +n.max ? `${v("Vas", "Vais")} por encima: esa parte de más podría estar creciendo en otro sitio.` : `${v("Estás", "Estáis")} justo en la zona buena.`}`,
          ),
          visual: { kind: "range", value: +n.months, lo: +n.min, hi: +n.max, max: Math.max(+n.max * 1.6, +n.months * 1.15), fmt: "months", label: tr("Months of cushion", "Meses de colchón") },
        },
        +n.after < +n.months && {
          id: "after",
          say: tr(`And with the expenses already on your horizon, it would drop to ${months(+n.after)}.`, `Y con los gastos que ya ${v("tienes", "tenéis")} en el horizonte, bajaría a ${months(+n.after)}.`),
          visual: {
            kind: "bars",
            fmt: "months",
            items: [
              { label: tr("Today", "Hoy"), value: +n.months, tone: st },
              { label: tr("After planned expenses", "Tras los gastos previstos"), value: +n.after, tone: "bad" },
            ],
          },
        },
      ];
    case "near-goal":
      return [
        intro,
        {
          id: "cost",
          say: tr(`${String(n.goal)}, for ${n.when}, means ${money(+n.amount)}.`, `${String(n.goal)}, para ${n.when}, supone ${money(+n.amount)}.`),
          visual: { kind: "figure", value: +n.amount, fmt: "money", caption: String(n.goal), tone: "neutral" },
        },
        {
          id: "after",
          say: tr(
            `If that money comes out of the cushion, you'd go from ${months(+n.months)} to ${+n.after ? months(+n.after) : "nothing"}. In other words, no safety net right when new expenses show up.`,
            `Si ese dinero sale del colchón, ${v("pasarías", "pasaríais")} de ${months(+n.months)} a ${+n.after ? months(+n.after) : "nada"}. Es decir, sin red justo cuando más gastos nuevos aparecen.`,
          ),
          visual: {
            kind: "bars",
            fmt: "months",
            items: [
              { label: tr("Before", "Antes"), value: +n.months, tone: "warn" },
              { label: tr("After", "Después"), value: +n.after, tone: "bad" },
            ],
          },
          simpler: tr("It's like using the spare tyre for the trip: you get there, but with no plan B.", "Es como gastar la rueda de repuesto en el viaje: llegas, pero sin plan B."),
        },
      ];
    case "debt":
      if (n.balance)
        return [
          intro,
          {
            id: "balance",
            say: tr(`There's ${money(+n.balance)} outstanding on the cards.`, `En las tarjetas hay ${money(+n.balance)} pendientes.`),
            visual: { kind: "figure", value: +n.balance, fmt: "money", caption: tr("of credit card debt", "de deuda en tarjetas"), tone: "bad" },
          },
          {
            id: "split",
            say: tr(
              `And here's the problem: of the ${money(+n.monthly)} you pay each month, ${money(+n.interest)} is interest. The debt only goes down ${money(+n.monthly - +n.interest)} a month.`,
              `Y aquí está el problema: de los ${money(+n.monthly)} que ${v("pagas", "pagáis")} al mes, ${money(+n.interest)} son intereses. La deuda solo baja ${money(+n.monthly - +n.interest)} al mes.`,
            ),
            visual: {
              kind: "bars",
              fmt: "money",
              items: [
                { label: tr("Monthly payment", "Pago al mes"), value: +n.monthly, tone: "neutral" },
                { label: tr("Goes to interest", "Se va en intereses"), value: +n.interest, tone: "bad" },
                { label: tr("Lowers the debt", "Baja la deuda"), value: +n.monthly - +n.interest, tone: "good" },
              ],
            },
            simpler: tr("It's like walking up an escalator that's going down: you walk, but you barely move.", "Es como subir por una escalera mecánica que baja: caminas, pero casi no avanzas."),
          },
          fixBeat,
        ];
      return [
        intro,
        {
          id: "dti",
          say: tr(
            `Of every 100 dollars you earn, ${Math.round(+n.dti * 100)} go to debt. Up to 36 counts as healthy${+n.dti <= 0.36 ? ", so nothing to worry about here" : ""}.`,
            `De cada 100 dólares que ${v("ganas", "ganáis")}, ${Math.round(+n.dti * 100)} van a deudas. Hasta 36 se considera sano${+n.dti <= 0.36 ? ", así que aquí no hay de qué preocuparse" : ""}.`,
          ),
          visual: { kind: "range", value: +n.dti * 100, lo: 0, hi: 36, max: 60, fmt: "pct", label: tr("Of income to debt", "Del sueldo a deudas") },
        },
      ];
    case "cashflow": {
      const flow = +n.flow;
      const income = +n.income;
      return [
        intro,
        {
          id: "flow",
          say: tr(
            `${money(income)} comes in a year. ${flow < 0 ? `But ${money(-flow)} more goes out, and that hole is filled from savings.` : `With everything paid, ${money(flow)} is left.`}`,
            `Entran ${money(income)} al año. ${flow < 0 ? `Pero salen ${money(-flow)} más, y ese hueco se tapa con ahorros.` : `Pagado todo, quedan ${money(flow)}.`}`,
          ),
          visual: {
            kind: "bars",
            fmt: "money",
            items: [
              { label: tr("In", "Entra"), value: income, tone: "good" },
              { label: tr("Out", "Sale"), value: income - flow, tone: flow < 0 ? "bad" : "neutral" },
            ],
          },
          simpler:
            flow < 0
              ? tr("It's a bucket with a small leak: you top it up from the tank.", "Es un cubo con una pequeña fuga: tiras del depósito para llenarlo.")
              : tr("It's the water left over in the bucket each year.", "Es el agua que sobra cada año en el cubo."),
        },
        {
          id: "rate",
          say: tr(
            `You're saving ${Math.round(+n.saveRate * 100)} of every 100 dollars. The recommendation is 15 to 20.`,
            `${v("Estás ahorrando", "Estáis ahorrando")} ${Math.round(+n.saveRate * 100)} de cada 100 dólares. Lo recomendable es entre 15 y 20.`,
          ),
          visual: { kind: "range", value: +n.saveRate * 100, lo: 15, hi: 30, max: 40, fmt: "pct", label: tr("Savings rate", "Tasa de ahorro") },
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
              say: tr(
                `As the plan stands, each year you'd take out more than your savings grow. The account would hit zero at ${n.runOut}.`,
                `Tal como está el plan, cada año ${v("sacarías", "sacaríais")} más de lo que los ahorros crecen. La cuenta llegaría a cero a los ${n.runOut} años.`,
              ),
              visual: { kind: "figure", value: +n.runOut, fmt: "years", caption: tr("years old: savings would run out", "años: se acabarían los ahorros"), tone: "bad" },
              simpler: tr("It's a pantry you empty faster than you fill it.", "Es una despensa que vacías más rápido de lo que la llenas."),
            }
          : +n.gap > 0 && {
              id: "gap",
              say: tr(
                `To retire at ${n.retireAge} you'd need ${money(+n.projected + +n.gap)}. At today's pace, you'd reach ${money(+n.projected)}.`,
                `Para jubilar${v("te", "os")} a los ${n.retireAge} harían falta ${money(+n.projected + +n.gap)}. Al ritmo de ahora, ${v("llegarías", "llegaríais")} a ${money(+n.projected)}.`,
              ),
              visual: {
                kind: "bars",
                fmt: "money",
                items: [
                  { label: tr("What you need", "Lo que hace falta"), value: +n.projected + +n.gap, tone: "neutral" },
                  { label: tr("What you'll have", v("Lo que tendrás", "Lo que tendréis")), value: +n.projected, tone: "bad" },
                ],
              },
              simpler: tr("It's a fuel tank for a long trip: right now it doesn't reach the destination.", "Es un depósito para un viaje largo: ahora mismo no llega hasta el destino."),
            },
        {
          id: "share",
          say:
            +n.incomeShare >= 80
              ? tr(`That would cover ${n.incomeShare} of every 100 dollars you'll spend in retirement. Very good.`, `Eso cubriría ${n.incomeShare} de cada 100 dólares que ${v("gastarás", "gastaréis")} en la jubilación. Muy bien.`)
              : tr(
                  `Put another way: of every 100 dollars you'll spend in retirement, only ${n.incomeShare} would be covered.`,
                  `Dicho de otra forma: de cada 100 dólares que ${v("gastarás", "gastaréis")} en la jubilación, solo ${n.incomeShare} estarían cubiertos.`,
                ),
          visual: { kind: "range", value: +n.incomeShare, lo: 80, hi: 100, max: 100, fmt: "pct", label: tr("Retirement expenses covered", "Gastos de jubilado cubiertos") },
        },
        +n.extraSave > 0 && {
          id: "extra",
          say: tr(`Closing that gap would take saving ${money(+n.extraSave)} more a year.`, `Para cerrar ese hueco haría falta ahorrar ${money(+n.extraSave)} más al año.`),
          visual: { kind: "figure", value: +n.extraSave, fmt: "money", caption: tr("more saved a year", "más de ahorro al año"), tone: "warn" },
        },
        fixBeat,
      ];
    }
    case "education":
      return [
        intro,
        {
          id: "gap",
          say:
            +n.have > 0
              ? tr(
                  `College will cost ${money(+n.need)}. There's already ${money(+n.have)} saved, so ${money(+n.gap)} is missing.`,
                  `La universidad costará ${money(+n.need)}. Ya hay ${money(+n.have)} guardados, así que faltan ${money(+n.gap)}.`,
                )
              : tr(`College will cost ${money(+n.need)}, and for now nothing is saved for it.`, `La universidad costará ${money(+n.need)}, y de momento no hay nada guardado para ello.`),
          visual: {
            kind: "bars",
            fmt: "money",
            items: [
              { label: tr("Needed", "Hace falta"), value: +n.need, tone: "neutral" },
              { label: tr("Saved", "Ahorrado"), value: +n.have, tone: "good" },
              { label: tr("Missing", "Falta"), value: +n.gap, tone: "bad" },
            ],
          },
          simpler: tr("It's a piggy bank with a deadline: the sooner you fill it, the less each month costs.", "Es una hucha con fecha: cuanto antes se llena, menos cuesta cada mes."),
        },
        +n.extraSave > 0 && {
          id: "extra",
          say: tr(`The good news: putting aside ${money(+n.extraSave)} more a year gets you there in time.`, `La buena noticia: apartando ${money(+n.extraSave)} más al año, se llega a tiempo.`),
          visual: { kind: "figure", value: +n.extraSave, fmt: "money", caption: tr("more a year for college", "más al año para la universidad"), tone: "warn" },
        },
      ];
    case "life": {
      const people = (n.people as unknown as { name: string; has: number; need: number }[]) ?? [];
      return [
        intro,
        {
          id: "why",
          say: tr(
            "It's there for one thing: so that if someone is gone, the family can carry on. The house, school, day-to-day life.",
            "Sirve para una cosa: que si alguien falta, la familia pueda seguir adelante. La casa, los estudios, el día a día.",
          ),
          visual: {
            kind: "list",
            items: tr([{ text: "The house" }, { text: "School and college" }, { text: "Day-to-day expenses" }], [{ text: "La casa" }, { text: "Los estudios" }, { text: "Los gastos del día a día" }]),
          },
          simpler: tr("It's the family's umbrella.", "Es el paraguas de la familia."),
        },
        ...people.map<Beat>((p, i) => ({
          id: `person-${i}`,
          say:
            p.need > p.has
              ? tr(
                  `${i ? "As for" : "Let's start with"} ${p.name}: ${money(p.has)} of cover, and ${money(p.need)} would be needed.`,
                  `${i ? "En el caso de" : "Empecemos por"} ${p.name}: tiene ${money(p.has)} de seguro y harían falta ${money(p.need)}.`,
                )
              : tr(`${p.name} has ${money(p.has)} of cover, more than needed. Well covered.`, `${p.name} tiene ${money(p.has)} de seguro, más de lo que hace falta. Bien cubierto.`),
          visual: {
            kind: "bars",
            fmt: "money",
            items: [
              { label: tr("Would need", "Necesitaría"), value: p.need, tone: "neutral" },
              { label: tr("Has", "Tiene"), value: p.has, tone: p.has >= p.need ? "good" : "bad" },
            ],
          },
        })),
        fixBeat,
      ];
    }
    case "umbrella":
      return [
        intro,
        {
          id: "what",
          say: tr(
            "It's called umbrella insurance: if someone sues you and the amount goes beyond what your home and car insurance cover, this covers the rest.",
            `Se llama seguro paraguas: si alguien ${v("te", "os")} demanda y la cifra supera lo que cubren los seguros de casa y coche, este cubre el resto.`,
          ),
          visual: {
            kind: "list",
            items: tr(
              [{ text: "Home insurance" }, { text: "Car insurance" }, { text: "Umbrella over both", tone: "good" as Tone }],
              [{ text: "Seguro de casa" }, { text: "Seguro de coche" }, { text: "Paraguas por encima de los dos", tone: "good" as Tone }],
            ),
          },
          simpler: tr("A big umbrella over the other policies, in case it rains harder.", "Un paraguas grande encima de los otros seguros, por si llueve más fuerte."),
        },
        {
          id: "amount",
          say: n.recommended
            ? tr(`For your situation, ${money(+n.recommended)} of cover is recommended. And it's usually quite cheap.`, `Para ${v("tu", "vuestra")} situación se recomienda ${money(+n.recommended)} de cobertura. Y suele ser bastante barato.`)
            : tr(`You have ${money(+n.current)} of cover. More than enough.`, `${v("Tienes", "Tenéis")} ${money(+n.current)} de cobertura. Más que suficiente.`),
          visual: {
            kind: "figure",
            value: +(n.recommended || n.current),
            fmt: "money",
            caption: n.recommended ? tr("of cover recommended", "de cobertura recomendada") : tr("of current cover", "de cobertura actual"),
            tone: n.recommended ? "bad" : "good",
          },
        },
        fixBeat,
      ];
    case "investments": {
      const sector = n.sector === "Technology" ? tr("technology", "tecnología") : String(n.sector);
      return [
        intro,
        {
          id: "mix",
          say: tr(
            `Right now, ${n.equity} of every 100 dollars invested are in stocks. For your age and what you want to achieve, the right mix is ${n.target}.`,
            `Ahora mismo, ${n.equity} de cada 100 dólares invertidos están en acciones. Para ${v("tu", "vuestra")} edad y lo que ${v("quieres", "queréis")} conseguir, lo que encaja es ${n.target}.`,
          ),
          visual: { kind: "range", value: +n.equity, lo: +n.target - 3, hi: +n.target + 3, max: 100, fmt: "pct", label: tr("In stocks", "En acciones") },
          simpler: tr("It's what's in the backpack: more stocks give more push, and more sway.", "Es la mezcla de la mochila: más acciones dan más impulso, y más vaivén."),
        },
        n.sector && {
          id: "sector",
          say: tr(
            `Also, a lot is concentrated in ${sector}. If that sector has a bad year, everything feels it.${n.leveraged ? ` And there's a leveraged fund, ${n.leveraged}, that multiplies both the rises and the falls.` : ""}`,
            `Además, mucho está concentrado en ${sector}. Si ese sector tiene un mal año, lo nota todo.${n.leveraged ? ` Y hay un fondo apalancado, ${n.leveraged}, que multiplica tanto las subidas como las caídas.` : ""}`,
          ),
          visual: {
            kind: "list",
            items: [
              { text: sector[0].toUpperCase() + sector.slice(1), note: tr("a sector with a lot of weight", "sector con mucho peso"), tone: "warn" },
              ...(n.leveraged ? [{ text: String(n.leveraged), note: tr("leveraged fund", "fondo apalancado"), tone: "bad" as Tone }] : []),
            ],
          },
        },
        fixBeat,
      ];
    }
  }
  // a topic these rules don't know yet still gets explained, from what every topic carries
  return [intro, { id: "label", say: t.label, visual: { kind: "list", items: [{ text: t.title, note: t.label, tone: st }] } }, fixBeat];
}
