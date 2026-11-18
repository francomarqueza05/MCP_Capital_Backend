// The route, built from the family's analysis. Base camp is where they stand (the score);
// then every topic Sherpas looked at, from solid ground to the steepest stretches; the summit
// is the one move that lifts them most. Each step carries what Cordi says when it gets there.
// English says "you" to one person or two; Spanish switches between "tú" and "vosotros" (v()).
import { climbed, pillarPoints, type Case, type Status, type Topic } from "@/data/cases";
import { BAND, byImpact, CAPS, fixFor, moveName, num, short } from "@/lib/copy";
import { tr } from "@/lib/lang";
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
  const capList = c.score.caps.map((k) => (CAPS[k] ?? k).toLowerCase()).join(tr(" and ", " y "));
  const two = c.score.caps.length > 1;

  const base: Step = {
    sign: {
      fig: tr(`${c.score.value} of 100`, `${c.score.value} de 100`),
      note: capped
        ? tr(two ? "Two barriers hold the score back" : "One barrier holds the score back", two ? "Dos barreras frenan la nota" : "Una barrera frena la nota")
        : tr(`${band.label} score`, `Nota ${band.label.toLowerCase()}`),
    },
    id: "base",
    kind: "base",
    title: tr("Base camp", "Campamento base"),
    label: tr(`${c.score.value} of 100, ${band.label.toLowerCase()}`, `${c.score.value} de 100, ${band.label.toLowerCase()}`),
    status: band.status,
    say: capped
      ? tr(
          `This is where it all starts. Your score today is ${c.score.value} out of 100. With what you have it could be higher, but ${capList} ${two ? "put" : "puts"} a ceiling on it.`,
          `Aquí empieza todo. ${v("Tu", "Vuestra")} nota hoy es un ${c.score.value} sobre 100. Por lo que ${v("tienes", "tenéis")}, podría ser más alta, pero ${capList} ${two ? "le ponen" : "le pone"} un techo.`,
        )
      : tr(
          `This is where it all starts. Your score today is ${c.score.value} out of 100, and where you have the most room to climb is ${room.name.toLowerCase()}.`,
          `Aquí empieza todo. ${v("Tu", "Vuestra")} nota hoy es un ${c.score.value} sobre 100, y donde más margen ${v("tienes", "tenéis")} para subir es en ${room.name.toLowerCase()}.`,
        ),
  };

  // solid ground first, the hard stretches higher up, as on a real climb
  const topics = [...c.topics].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map<Step>((t) => {
    const fix = fixFor(c, t);
    const gain = fix && fix.after > fix.before ? fix.after - fix.before : 0;
    const after = gain
      ? ` ${pickBy(
          fixRank(c, t),
          tr(
            [`Fix this and your score goes from ${fix!.before} to ${fix!.after}.`, `This alone is worth ${gain} points.`, `There are ${gain} points waiting here.`],
            [`Arreglando esto, ${v("tu", "vuestra")} nota pasaría de ${fix!.before} a ${fix!.after}.`, `Solo con esto ${v("ganarías", "ganaríais")} ${gain} puntos.`, `Aquí hay ${gain} puntos esperando.`],
          ),
        )}`
      : "";
    return { id: t.id, kind: "topic", title: t.title, label: t.label, status: t.status, say: `${arrival(t, c, v)}${after}`, topic: t, sign: sign(t) };
  });

  const best = byImpact(c.moves)[0];
  const summit: Step = {
    sign: best
      ? { fig: tr(`+${best.after - best.before} points`, `+${best.after - best.before} puntos`), note: moveName(best) }
      : { fig: tr("Keep it up", "Mantener"), note: tr("You're on track", "Vas por buen camino") },
    id: "summit",
    kind: "summit",
    title: tr(we ? "Your first step together" : "Your first step", "Tu primer paso"),
    label: best ? moveName(best) : tr("Keep going", "Seguir así"),
    status: "goal",
    say: best
      ? tr(
          `And we're at the top. Of everything we've seen, what gets you furthest is to ${moveName(best).toLowerCase()}: your score would go from ${best.before} to ${best.after}.`,
          `Y llegamos arriba. De todo lo que hemos visto, lo que más ${v("te", "os")} acerca es ${moveName(best).toLowerCase()}: con eso, la nota pasaría de ${best.before} a ${best.after}.`,
        )
      : tr(`And we're at the top. You're on track; now it's about keeping it that way.`, `Y llegamos arriba. ${v("Vas", "Vais")} por buen camino; ahora se trata de mantenerlo.`),
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
      if (flow < 0)
        return tr(
          `There's a small leak here: every year ${money(-flow)} more goes out than comes in, and the difference comes out of savings.`,
          `Aquí hay una pequeña fuga: cada año sale ${money(-flow)} más de lo que entra, y la diferencia se paga tirando de ahorros.`,
        );
      const tight = flow < +n.income * 0.08;
      return tight
        ? tr(
            `Every year you have ${money(flow)} left over. It sounds like a lot, but for everything you want to do, it's a tight margin.`,
            `Cada año ${v("te", "os")} quedan ${money(flow)} libres. Parece mucho, pero para todo lo que ${v("quieres", "queréis")} hacer es un margen justo.`,
          )
        : tr(
            `Good news: every year you have ${money(flow)} to spare. That's the fuel for every other goal.`,
            `Buena noticia: cada año ${v("te", "os")} sobran ${money(flow)}. Es la gasolina para el resto de metas.`,
          );
    }
    case "emergency": {
      const m = +n.months;
      if (m < +n.min)
        return tr(
          `If your income stopped tomorrow, you could hold out for ${months(m)}. The safe range is ${n.min} to ${n.max}.`,
          `Si mañana ${v("dejaras", "dejarais")} de cobrar, ${v("tendrías", "tendríais")} para aguantar ${months(m)}. Lo sensato sería tener entre ${n.min} y ${n.max}.`,
        );
      if (m > +n.max)
        return tr(
          `You're more than covered here: ${months(m)} of expenses set aside, more than you need. Some of that money could be working elsewhere.`,
          `Aquí ${v("vas", "vais")} sobrado: ${months(m)} de gastos guardados, más de lo que hace falta. Parte de ese dinero podría estar trabajando en otras cosas.`,
        );
      return tr(`You have a good cushion: ${months(m)} of expenses set aside for surprises.`, `${v("Tienes", "Tenéis")} un buen colchón: ${months(m)} de gastos guardados para imprevistos.`);
    }
    case "near-goal":
      return tr(
        `${String(n.goal)} in ${n.when} is a great goal. But careful: as things stand, it would leave you with no cushion right after.`,
        `${String(n.goal)} en ${n.when} es una gran meta. Pero ojo: tal como está, ${v("te", "os")} dejaría sin colchón justo después.`,
      );
    case "debt":
      if (n.balance)
        return tr(
          `The cards weigh heavy: you owe ${money(+n.balance)}, and almost everything you pay each month goes to interest.`,
          `Las tarjetas pesan: ${v("debes", "debéis")} ${money(+n.balance)}, y casi todo lo que ${v("pagas", "pagáis")} cada mes se va en intereses.`,
        );
      return +n.dti <= 0.36
        ? tr(
            `Debt is under control. Of every 100 dollars you earn, ${Math.round(+n.dti * 100)} go to paying it, below the healthy limit.`,
            `Las deudas, bajo control. De cada 100 dólares que ${v("ganas", "ganáis")}, ${Math.round(+n.dti * 100)} van a pagarlas, por debajo del límite sano.`,
          )
        : tr(`Debt takes a lot: ${ofHundred(+n.dti)} dollars you earn.`, `Las deudas se llevan mucho: ${ofHundred(+n.dti)} dólares que ${v("ganas", "ganáis")}.`);
    case "retirement":
      if (n.runOut !== "Not applicable")
        return tr(`This is the steepest stretch. At today's pace, your savings would run out at ${n.runOut}.`, `Este es el tramo más empinado. Al ritmo de ahora, los ahorros se acabarían a los ${n.runOut} años.`);
      if (+n.gap > 0)
        return tr(
          `Retirement is the longest stretch of the route. To retire at ${n.retireAge}, as you want, you're ${money(+n.gap)} short.`,
          `La jubilación es el tramo más largo de la ruta. Para retirar${v("te", "os")} a los ${n.retireAge}, como ${v("quieres", "queréis")}, faltan ${money(+n.gap)}.`,
        );
      return tr(
        `Retirement is well on track: you'd have ${n.incomeShare} percent of what you'll spend covered.`,
        `La jubilación va bien encaminada: ${v("tendrías", "tendríais")} cubierto un ${n.incomeShare} por ciento de lo que ${v("gastarás", "gastaréis")}.`,
      );
    case "education": {
      const kids = c.household.kids;
      const whoEn = kids.length > 1 ? `for ${kids.slice(0, -1).join(", ")} and ${kids.at(-1)}` : kids.length ? `for ${kids[0]}` : "";
      const whoEs = kids.length > 1 ? `de ${kids.slice(0, -1).join(", ")} y ${kids.at(-1)}` : kids.length ? `de ${kids[0]}` : "";
      return +n.extraSave > 0
        ? tr(
            `College ${whoEn} is ${money(+n.gap)} short. With time on your side, putting aside ${money(+n.extraSave)} more a year closes it.`,
            `Para la universidad ${whoEs} faltan ${money(+n.gap)}. Con tiempo por delante, se cierra apartando ${money(+n.extraSave)} más al año.`,
          )
        : tr(`College ${whoEn} is ${money(+n.gap)} short, and nothing is set aside for it yet.`, `Para la universidad ${whoEs} faltan ${money(+n.gap)}, y ahora mismo no hay nada apartado para ello.`);
    }
    case "life": {
      const s = (+n.shortfall || 0) + (+n.coShortfall || 0);
      if (!s)
        return tr(
          `Nothing to worry about here: if something happened to you, life insurance would cover what the family needs.`,
          `Aquí no hay de qué preocuparse: si ${v("te", "os")} pasara algo, el seguro de vida cubriría lo que la familia necesita.`,
        );
      return c.household.couple
        ? tr(
            `A delicate subject, but an important one: if something happened to either of you, life insurance would fall far short. You're missing ${money(s)} of cover.`,
            `Un tema delicado pero importante: si a alguno de los dos le pasara algo, el seguro de vida se quedaría muy corto. Faltan ${money(s)} de cobertura.`,
          )
        : tr(
            `A delicate subject, but an important one: if something happened to you, life insurance would fall short. You're missing ${money(s)} of cover.`,
            `Un tema delicado pero importante: si te pasara algo, el seguro de vida se quedaría corto. Faltan ${money(s)} de cobertura.`,
          );
    }
    case "umbrella":
      return n.recommended
        ? tr(
            `Insurance almost nobody looks at: the kind that covers you if someone sues you. The recommendation is ${money(+n.recommended)}, and right now you have none.`,
            `Un seguro que casi nadie mira: el que ${v("te", "os")} cubre si alguien ${v("te", "os")} demanda. Lo recomendado es ${money(+n.recommended)}, y ahora mismo no ${v("tienes", "tenéis")} ninguno.`,
          )
        : tr(`Good: you have insurance that covers you if someone sues you.`, `Bien: ${v("tienes", "tenéis")} un seguro que ${v("te", "os")} cubre si alguien ${v("te", "os")} demanda.`);
    case "investments": {
      const d = +n.equity - +n.target;
      if (Math.abs(d) <= 3) return tr(`Your investments are well spread for your age and your goals.`, `Las inversiones están bien repartidas para ${v("tu", "vuestra")} edad y ${v("tus", "vuestras")} metas.`);
      return d < 0
        ? tr(
            `With investments you're driving with the brake on: ${n.equity} percent in stocks, when ${n.target} suits your age better.`,
            `En inversiones ${v("vas", "vais")} con el freno puesto: un ${n.equity} por ciento en acciones, cuando a ${v("tu", "vuestra")} edad encaja más un ${n.target}.`,
          )
        : tr(
            `With investments you're taking a bit more risk than fits: ${n.equity} percent in stocks, and the right mix is ${n.target}.`,
            `En inversiones ${v("vas", "vais")} con algo más de riesgo del que toca: un ${n.equity} por ciento en acciones, y lo que encaja es un ${n.target}.`,
          );
    }
  }
  return t.label;
}

/** One figure and a few words for each topic, for its sign on the overview. */
function sign(t: Topic): Step["sign"] {
  const n = t.numbers as Record<string, number & string>;
  switch (t.id) {
    case "emergency":
      return tr(
        { fig: `${num(+n.months, 1)} months`, note: `of cushion; ideally ${n.min} to ${n.max}` },
        { fig: `${num(+n.months, 1)} meses`, note: `de colchón; lo ideal, ${n.min} a ${n.max}` },
      );
    case "near-goal":
      return tr(
        { fig: `${num(+n.after, 1)} months`, note: `of cushion after ${String(n.goal ?? "the purchase").toLowerCase()}` },
        { fig: `${num(+n.after, 1)} meses`, note: `de colchón tras ${String(n.goal ?? "la compra").toLowerCase()}` },
      );
    case "debt":
      return n.balance
        ? { fig: short(+n.balance), note: tr("on cards that barely go down", "en tarjetas que casi no bajan") }
        : { fig: `${Math.round(+n.dti * 100)}%`, note: tr("of income goes to debt", "del sueldo va a deudas") };
    case "retirement":
      if (n.runOut !== "Not applicable") return { fig: tr(`At ${n.runOut}`, `A los ${n.runOut}`), note: tr("savings would run out", "se acabarían los ahorros") };
      if (+n.gap > 0) return { fig: short(+n.gap), note: tr(`short of retiring at ${n.retireAge}`, `faltan para jubilarte a los ${n.retireAge}`) };
      return { fig: `${n.incomeShare}%`, note: tr("of expenses covered", "de los gastos, cubiertos") };
    case "cashflow":
      return +n.flow < 0
        ? { fig: `−${short(+n.flow)}`, note: tr("a year, paid from savings", "al año, pagados con ahorros") }
        : { fig: `+${short(+n.flow)}`, note: tr("a year for your goals", "al año para tus metas") };
    case "education":
      return { fig: short(+n.gap), note: tr("short for college", "faltan para la universidad") };
    case "life": {
      const s = (+n.shortfall || 0) + (+n.coShortfall || 0);
      return s
        ? { fig: short(s), note: tr("of life cover missing", "de seguro de vida faltan") }
        : { fig: tr("Covered", "Cubierto"), note: tr("your family is protected", "tu familia está protegida") };
    }
    case "umbrella":
      return n.recommended
        ? { fig: short(+n.recommended), note: tr("of cover, not taken out", "de cobertura, sin contratar") }
        : { fig: short(+n.current), note: tr("of cover against lawsuits", "de cobertura ante demandas") };
    case "investments":
      return { fig: tr(`${n.equity}% in stocks`, `${n.equity}% en acciones`), note: tr(`the right mix: ${n.target}%`, `lo que encaja: ${n.target}%`) };
  }
  return { fig: t.label, note: "" };
}
