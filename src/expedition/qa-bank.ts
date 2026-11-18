// The questions people tend to have at each camp, answered from the family's own numbers.
// Same rule as the rest of the summary: every figure comes from the case data, no AI, no
// guessing. Each answer can open follow-ups, so one tap starts a short conversation.
// Every question and answer exists in English and Spanish (tr).
import { pillarPoints, type Case, type Topic } from "@/data/cases";
import { BAND, byImpact, CAPS, EFFORT, fixFor, moveName, num, short } from "@/lib/copy";
import { tr } from "@/lib/lang";
import type { Step } from "./steps";

export type Question = {
  id: string;
  /** What the person taps. */
  q: string;
  /** What Cordi answers. */
  a: string;
  /** Follow-ups offered once this one is answered. */
  next?: string[];
};

/** Offered on every camp: the same idea again, with a picture instead of numbers. */
export const SIMPLER = "simple";

export function questionsFor(step: Step, c: Case): Question[] {
  const we = c.household.couple;
  const v = (one: string, two: string) => (we ? two : one);
  const qs = step.kind === "base" ? base(c, v) : step.kind === "summit" ? summit(c, v) : topic(step.topic as Topic, c, v);
  return qs.filter((q): q is Question => !!q);
}

/** The chips to show first: everything that isn't only a follow-up. */
export function firstQuestions(all: Question[]): Question[] {
  const followUps = new Set(all.flatMap((q) => q.next ?? []));
  return all.filter((q) => !followUps.has(q.id) || q.id === SIMPLER);
}

type V = (one: string, two: string) => string;
type Maybe = Question | false | null | undefined;

const simplerQ = () => tr("Explain it more simply", "Explícamelo más simple");

function base(c: Case, v: V): Maybe[] {
  const band = BAND[c.score.band];
  const weakest = [...c.score.pillars].sort((a, b) => a.score - b.score)[0];
  const room = [...c.score.pillars].sort((a, b) => {
    const pa = pillarPoints(a);
    const pb = pillarPoints(b);
    return pb.of - pb.got - (pa.of - pa.got);
  })[0];
  const rp = pillarPoints(room);
  const caps = c.score.caps.map((k) => (CAPS[k] ?? k).toLowerCase());
  const pillarList = c.score.pillars.map((p) => p.name.toLowerCase()).join(", ");
  return [
    {
      id: "how",
      q: tr("How is the score calculated?", "¿Cómo se calcula la nota?"),
      a: tr(
        `It adds up five parts: ${pillarList}. Each gives up to a set number of points depending on how well you're doing there, and together they make 100.`,
        `Suma cinco tramos: ${pillarList}. Cada uno da un máximo de puntos según lo bien que ${v("estás", "estáis")} en ese tema, y entre todos llegan a 100.`,
      ),
      next: ["room", "weak"],
    },
    {
      id: "good",
      q: tr(`Is ${c.score.value} good or bad?`, `¿Un ${c.score.value} es bueno o malo?`),
      a: tr(
        `It's in the "${band.label.toLowerCase()}" band. ${band.status === "good" ? "It's a solid base: time to fine-tune, not rescue." : band.status === "warn" ? "No alarm, but some stretches are worth fixing before they weigh on you." : "Some stretches leave you exposed to a surprise today; the good news is several can be fixed with little effort."}`,
        `Está en la franja «${band.label.toLowerCase()}». ${band.status === "good" ? "Es una base sólida: toca afinar, no rescatar." : band.status === "warn" ? "No hay alarma, pero hay tramos que conviene arreglar antes de que pesen." : `Hay tramos que hoy ${v("te dejan", "os dejan")} expuestos ante un imprevisto; la buena noticia es que varios se arreglan con poco esfuerzo.`}`,
      ),
      next: ["room"],
    },
    {
      id: "room",
      q: tr("Where can I climb the most?", "¿Dónde puedo subir más?"),
      a: tr(
        `In ${room.name.toLowerCase()}: you have ${rp.got} of ${rp.of} points, so ${rp.of - rp.got} are still there to earn. It's the stretch with the most room.`,
        `En ${room.name.toLowerCase()}: ${v("llevas", "lleváis")} ${rp.got} de ${rp.of} puntos, así que ahí quedan ${rp.of - rp.got} por ganar. Es el tramo con más margen.`,
      ),
    },
    {
      id: "weak",
      q: tr("What's my weakest point?", "¿Cuál es mi punto más débil?"),
      a: tr(`${weakest.name}, at ${weakest.score} out of 100 within its part. You'll see it calmly at its camp.`, `${weakest.name}, con ${weakest.score} sobre 100 dentro de su tramo. Lo verás con calma en su campamento.`),
    },
    caps.length > 0 && {
      id: "caps",
      q: tr("What's a barrier?", "¿Qué es una barrera?"),
      a: tr(
        `Some situations put a ceiling on the score even if everything else is fine. You have ${caps.length > 1 ? "two" : "one"}: ${caps.join(" and ")}. While ${caps.length > 1 ? "they're" : "it's"} there, the score can't rise freely.`,
        `Hay situaciones que ponen techo a la nota aunque el resto vaya bien. ${v("Tú tienes", "Vosotros tenéis")} ${caps.length > 1 ? "dos" : "una"}: ${caps.join(" y ")}. Mientras ${caps.length > 1 ? "sigan" : "siga"} ahí, la nota no puede subir libremente.`,
      ),
    },
    {
      id: SIMPLER,
      q: simplerQ(),
      a: tr(
        `Think of the score as your fitness before climbing a mountain. A ${c.score.value} means ${band.status === "good" ? "you're fit for the climb" : band.status === "warn" ? "you can climb, but with some extra weight in the backpack" : "it's worth training a few stretches before the climb"}. Each camp shows you one.`,
        `Piensa en la nota como el estado de forma antes de subir una montaña. Un ${c.score.value} quiere decir que ${band.status === "good" ? `${v("estás", "estáis")} en forma para la subida` : band.status === "warn" ? `${v("puedes", "podéis")} subir, pero con alguna mochila de más` : "conviene entrenar algunos tramos antes de la subida"}. Cada campamento te enseña uno.`,
      ),
    },
  ];
}

function summit(c: Case, v: V): Maybe[] {
  const moves = byImpact(c.moves);
  const best = moves[0];
  if (!best)
    return [
      {
        id: SIMPLER,
        q: simplerQ(),
        a: tr("You're on track: what matters now is not losing what you already have.", `${v("Vas", "Vais")} por buen camino: lo importante ahora es no perder lo que ya ${v("tienes", "tenéis")}.`),
      },
    ];
  const easy = moves.find((m) => m.effort === "low");
  return [
    {
      id: "why-first",
      q: tr("Why start with this step?", "¿Por qué empezar por este paso?"),
      a: tr(
        `Because it moves the score the most: from ${best.before} to ${best.after}${best.liftsCap ? ", and it removes a barrier too" : ""}. ${EFFORT[best.effort]}.`,
        `Porque es el que más mueve la nota: de ${best.before} a ${best.after}${best.liftsCap ? ", y además quita una barrera" : ""}. ${EFFORT[best.effort]}.`,
      ),
      next: ["easy", "all"],
    },
    easy &&
      easy !== best && {
        id: "easy",
        q: tr("Is there something easy to start right away?", "¿Hay algo fácil para empezar ya?"),
        a: tr(
          `Yes: ${moveName(easy).toLowerCase()}. It takes little effort and your score would go from ${easy.before} to ${easy.after}.`,
          `Sí: ${moveName(easy).toLowerCase()}. Pide poco esfuerzo y la nota pasaría de ${easy.before} a ${easy.after}.`,
        ),
      },
    {
      id: "all",
      q: tr("What if I do everything?", "¿Qué pasa si lo hago todo?"),
      a: tr(
        `Each step adds on its own: ${moves.map((m) => `${moveName(m).toLowerCase()} (+${m.after - m.before})`).join(", ")}. You don't have to do it all at once; your advisor helps you put it in order.`,
        `Cada paso suma por su lado: ${moves.map((m) => `${moveName(m).toLowerCase()} (+${m.after - m.before})`).join(", ")}. No hace falta hacerlo todo a la vez; ${v("tu", "vuestro")} asesor ${v("te", "os")} ayuda a ordenarlo.`,
      ),
    },
    {
      id: "advisor",
      q: tr("What do I do now?", "¿Qué hago ahora?"),
      a: tr(
        "Commit to the first step below: pick a date and add it to your calendar. I'll check in with you, and your Sherpas advisor works from this same route.",
        `${v("Comprométete", "Comprometeos")} con el primer paso de abajo: ${v("elige", "elegid")} una fecha y ${v("añádela", "añadidla")} al calendario. Yo ${v("te", "os")} pregunto cómo va, y ${v("tu", "vuestro")} asesor de Sherpas trabaja con esta misma ruta.`,
      ),
    },
    {
      id: SIMPLER,
      q: simplerQ(),
      a: tr(
        "You don't climb to the summit in one jump. This first step is the stretch that gains you the most height for the effort.",
        `La cima no se sube de un salto. Este primer paso es el tramo que más altura ${v("te", "os")} da por el esfuerzo que cuesta.`,
      ),
    },
  ];
}

function topic(t: Topic, c: Case, v: V): Maybe[] {
  const n = t.numbers as Record<string, number & string>;
  const fix = fixFor(c, t);
  const fixQ: Maybe = fix &&
    fix.after > fix.before && {
      id: "fix",
      q: tr("What does Sherpas suggest?", "¿Qué propone Sherpas?"),
      a: tr(`${moveName(fix)}. ${EFFORT[fix.effort]}, and your score would go from ${fix.before} to ${fix.after}.`, `${moveName(fix)}. ${EFFORT[fix.effort]}, y la nota pasaría de ${fix.before} a ${fix.after}.`),
    };
  const simple = (en: string, es: string): Question => ({ id: SIMPLER, q: simplerQ(), a: tr(en, es) });

  switch (t.id) {
    case "cashflow": {
      const flow = +n.flow;
      return [
        {
          id: "what",
          q: tr("What is cash flow?", "¿Qué es el flujo de caja?"),
          a: tr(
            `What comes in during a year minus what goes out. You bring in ${short(+n.income)} a year; ${flow < 0 ? `${short(flow)} more goes out than comes in, and the difference is paid from savings.` : `${short(flow)} is left free for goals.`}`,
            `Lo que entra en un año menos lo que sale. ${v("Ingresas", "Ingresáis")} ${short(+n.income)} al año; ${flow < 0 ? `salen ${short(flow)} más de lo que entra, y esa diferencia se paga con ahorros.` : `${v("te", "os")} quedan ${short(flow)} libres para metas.`}`,
          ),
          next: ["rate"],
        },
        {
          id: "rate",
          q: tr("Am I saving enough?", "¿Ahorro suficiente?"),
          a: tr(
            `You save ${Math.round(+n.saveRate * 100)}% of what you earn. ${+n.saveRate >= 0.2 ? "That's a good pace." : "The usual target is 15–20%."}`,
            `${v("Ahorras", "Ahorráis")} un ${Math.round(+n.saveRate * 100)}% de lo que ${v("ganas", "ganáis")}. ${+n.saveRate >= 0.2 ? "Es un buen ritmo." : "Lo habitual es apuntar al 15–20%."}`,
          ),
        },
        flow < 0 && {
          id: "neg",
          q: tr("Is spending more than comes in serious?", "¿Es grave gastar más de lo que entra?"),
          a: tr(
            `For a single year, no. But if it repeats, every year it eats ${short(flow)} of savings that were meant for other goals, like retirement.`,
            `Un año suelto, no. Pero si se repite, cada año ${v("te", "os")} come ${short(flow)} de ahorros que estaban para otras metas, como la jubilación.`,
          ),
        },
        fixQ,
        flow < 0
          ? simple("It's like a bucket with a small leak: what comes in doesn't fill it, and you keep drawing from the tank.", "Es como un cubo con una pequeña fuga: el agua que entra no llega a llenarlo, y vas tirando del depósito.")
          : simple("It's the water left in the bucket each year: you can carry it wherever it's needed most.", "Es el agua que sobra cada año en el cubo: puedes llevarla a donde más falte."),
      ];
    }
    case "emergency":
      return [
        {
          id: "what",
          q: tr("What's an emergency cushion?", "¿Qué es el colchón de emergencia?"),
          a: tr(
            `Money at hand to live on if income stops suddenly: sick leave, a layoff. You cover ${num(+n.months, 1)} months of expenses.`,
            `Dinero a mano para vivir si los ingresos paran de golpe: una baja, un despido. ${v("Cubres", "Cubrís")} ${num(+n.months, 1)} meses de gastos.`,
          ),
          next: ["why"],
        },
        {
          id: "why",
          q: tr(`Why ${n.min} to ${n.max} months?`, `¿Por qué ${n.min} a ${n.max} meses?`),
          a: tr(
            "It's what's recommended for your situation: the more the household depends on one salary or the more fixed costs there are, the bigger the cushion needs to be.",
            `Es lo que se recomienda para ${v("tu", "vuestra")} situación: cuanto más depende la casa de un solo sueldo o más gastos fijos hay, más colchón hace falta.`,
          ),
        },
        +n.months > +n.max && {
          id: "too-much",
          q: tr("Is having too much bad?", "¿Tener de más es malo?"),
          a: tr(
            `It's not dangerous, but ${num(+n.months - +n.max, 1)} extra months sitting in the account don't grow. That part could be working on other goals.`,
            `No es peligroso, pero ${num(+n.months - +n.max, 1)} meses de más parados en la cuenta no crecen. Esa parte podría trabajar en otras metas.`,
          ),
        },
        +n.after < +n.months && {
          id: "after",
          q: tr("And after the planned expenses?", "¿Y después de los gastos previstos?"),
          a: tr(`After the expenses you already have planned, the cushion would be ${num(+n.after, 1)} months.`, `Tras los gastos que ya ${v("tienes", "tenéis")} planeados, el colchón quedaría en ${num(+n.after, 1)} meses.`),
        },
        +n.months < +n.min
          ? simple("It's the spare tyre. Right now yours is half flat.", "Es la rueda de repuesto. Ahora mismo la tuya está medio deshinchada.")
          : simple("It's the spare tyre. Yours is more than enough, maybe too much.", "Es la rueda de repuesto. La tuya está de sobra, quizá demasiado."),
      ];
    case "near-goal":
      return [
        {
          id: "what",
          q: tr("What happens to my cushion?", "¿Qué pasa con mi colchón?"),
          a: tr(
            `${String(n.goal)} (${n.when}) costs ${short(+n.amount)}. If it comes out of the cushion, it would go from ${num(+n.months, 1)} months to ${num(+n.after, 1)}.`,
            `${String(n.goal)} (${n.when}) cuesta ${short(+n.amount)}. Si sale del colchón, pasaría de ${num(+n.months, 1)} meses a ${num(+n.after, 1)}.`,
          ),
          next: ["risk"],
        },
        {
          id: "risk",
          q: tr("Why is it a risk?", "¿Por qué es un riesgo?"),
          a: tr("Because right after the purchase there'd be no reserve: any surprise would have to be paid with debt.", "Porque justo después de la compra no quedaría reserva: cualquier imprevisto habría que pagarlo con deuda."),
        },
        simple("It's like using the spare tyre for the trip: you get there, but with no plan B if you get a flat.", "Es como gastar la rueda de repuesto en el viaje: llegas, pero sin plan B si pinchas."),
      ];
    case "debt":
      if (n.balance)
        return [
          {
            id: "what",
            q: tr("Why isn't the debt going down?", "¿Por qué la deuda no baja?"),
            a: tr(
              `You owe ${short(+n.balance)} on cards. You pay ${short(+n.monthly)} a month, but ${short(+n.interest)} goes to interest: the debt barely moves.`,
              `${v("Debes", "Debéis")} ${short(+n.balance)} en tarjetas. ${v("Pagas", "Pagáis")} ${short(+n.monthly)} al mes, pero ${short(+n.interest)} se van en intereses: la deuda apenas baja.`,
            ),
            next: ["first"],
          },
          {
            id: "first",
            q: tr("What do I pay first?", "¿Qué pago primero?"),
            a: tr("The card with the highest interest. Every dollar that goes there saves the most interest.", "La tarjeta con el interés más alto. Cada dólar que va ahí es el que más intereses ahorra."),
          },
          n.capped === "true" && {
            id: "cap",
            q: tr("Why does it hold my score back?", "¿Por qué frena mi nota?"),
            a: tr(
              "High card debt at high interest puts a ceiling on the score: while it's there, every other improvement shows less.",
              "Una deuda de tarjeta alta con interés alto pone techo a la nota: mientras siga, el resto de mejoras luce menos.",
            ),
          },
          fixQ,
          simple("It's like walking up an escalator that's going down: you walk, but you barely move.", "Es como subir por una escalera mecánica que baja: caminas, pero casi no avanzas."),
        ];
      return [
        {
          id: "what",
          q: tr("What is DTI?", "¿Qué es el DTI?"),
          a: tr(
            `The share of income that goes to debt payments each month. In your case, ${Math.round(+n.dti * 100)}%. Up to 36% counts as healthy.`,
            `Qué parte del sueldo se va en pagar deudas cada mes. En ${v("tu", "vuestro")} caso, un ${Math.round(+n.dti * 100)}%. Hasta un 36% se considera sano.`,
          ),
        },
        simple("Of every 100 that comes in, part is already spoken for. Yours is small: you have room to breathe.", "De cada 100 que entran, una parte ya está comprometida. La tuya es pequeña: vas holgado."),
      ];
    case "retirement": {
      const runs = n.runOut !== "Not applicable";
      return [
        {
          id: "what",
          q: runs
            ? tr("Why would my savings run out?", "¿Por qué se acabarían mis ahorros?")
            : +n.gap > 0
              ? tr("What does the gap mean?", "¿Qué significa el hueco?")
              : tr("Am I OK to retire?", "¿Estoy bien para jubilarme?"),
          a: runs
            ? tr(
                `At the planned pace, you'd take out ${num(+n.draw, 1)}% of your savings each year. That's more than they grow, and at ${n.runOut} they'd be gone.`,
                `Al ritmo previsto, ${v("sacarías", "sacaríais")} cada año un ${num(+n.draw, 1)}% de los ahorros. Es más de lo que crecen, y a los ${n.runOut} se agotarían.`,
              )
            : +n.gap > 0
              ? tr(
                  `To retire at ${n.retireAge} as you plan, you'd need ${short(+n.gap)} more than you'll end up with (${short(+n.projected)}).`,
                  `Para jubilar${v("te", "os")} a los ${n.retireAge} como ${v("planeas", "planeáis")} harían falta ${short(+n.gap)} más de lo que ${v("llegarás", "llegaréis")} a tener (${short(+n.projected)}).`,
                )
              : tr(`Yes: what's planned covers ${n.incomeShare}% of your retirement expenses.`, `Sí: lo previsto cubre un ${n.incomeShare}% de los gastos de jubilado.`),
          next: ["fix-how"],
        },
        (runs || +n.gap > 0) && {
          id: "fix-how",
          q: tr("How much would I need to save?", "¿Cuánto tendría que ahorrar?"),
          a:
            +n.extraSave > 0
              ? tr(`About ${short(+n.extraSave)} more a year, or retiring a bit later, or a mix of both.`, `Unos ${short(+n.extraSave)} más al año, o retrasar algo la jubilación, o una mezcla de las dos.`)
              : tr(
                  `It's less about saving more than taking out less each year: going from ${num(+n.draw, 1)}% toward 4% makes savings last much longer.`,
                  `No es tanto ahorrar más como sacar menos cada año: bajar del ${num(+n.draw, 1)}% hacia un 4% alarga mucho los ahorros.`,
                ),
        },
        {
          id: "share",
          q: tr("What share of my expenses is covered?", "¿Qué parte de mis gastos cubro?"),
          a: tr(`${n.incomeShare}% of what you'd spend in retirement would be covered by what's planned.`, `Un ${n.incomeShare}% de lo que ${v("gastarías", "gastaríais")} de jubilado quedaría cubierto con lo previsto.`),
        },
        fixQ,
        runs
          ? simple("It's a pantry you empty faster than you fill: it lasts a while, but not a lifetime.", "Es una despensa que vacías más rápido de lo que la llenas: aguanta un tiempo, pero no toda la vida.")
          : +n.gap > 0
            ? simple("It's like filling a fuel tank for a long trip: right now it doesn't reach the destination.", "Es como llenar un depósito para un viaje largo: ahora mismo no llega hasta el destino.")
            : simple("The tank reaches the destination with room to spare.", "El depósito llega al destino con margen."),
      ];
    }
    case "education":
      return [
        {
          id: "what",
          q: tr("How much does college cost?", "¿Cuánto cuesta la universidad?"),
          a: tr(
            `Worked out for ${c.household.kids.length > 1 ? "your children" : "the planned college"}: ${short(+n.need)} in total. ${short(+n.have)} is saved, so ${short(+n.gap)} is missing.`,
            `Calculado para ${c.household.kids.length > 1 ? "vuestros hijos" : "la universidad prevista"}: ${short(+n.need)} en total. Hay ${short(+n.have)} ahorrados, así que faltan ${short(+n.gap)}.`,
          ),
          next: ["how"],
        },
        {
          id: "how",
          q: tr("How do I cover it?", "¿Cómo lo cubro?"),
          a:
            +n.extraSave > 0
              ? tr(`Putting aside about ${short(+n.extraSave)} more a year, with time, gets you there.`, `Apartando unos ${short(+n.extraSave)} más al año, con tiempo, se llega.`)
              : tr("By sharing out current savings differently; worth going over with your advisor.", "Con el ahorro actual repartido de otra forma; vale la pena revisarlo con el asesor."),
        },
        simple("It's a piggy bank with a deadline: the sooner you start filling it, the less each month costs.", "Es una hucha con fecha: cuanto antes empiezas a llenarla, menos cuesta cada mes."),
      ];
    case "life": {
      const people = (n.people as unknown as { name: string; has: number; need: number }[]) ?? [];
      return [
        {
          id: "what",
          q: tr("What is life insurance for?", "¿Para qué sirve el seguro de vida?"),
          a: tr(
            `So that if someone is gone, the family can carry on with their life: the house, school, expenses. ${people.map((p) => `${p.name} has ${short(p.has)} and would need ${short(p.need)}`).join("; ")}.`,
            `Para que, si alguien falta, la familia pueda seguir con su vida: casa, estudios, gastos. ${people.map((p) => `${p.name} tiene ${short(p.has)} y necesitaría ${short(p.need)}`).join("; ")}.`,
          ),
          next: ["how-much"],
        },
        {
          id: "how-much",
          q: tr("How is what I need calculated?", "¿Cómo se calcula lo que necesito?"),
          a: tr(
            "By adding the years of income the family would stop receiving, the debts still owed and goals like college, minus what's already saved.",
            "Sumando los años de ingresos que la familia dejaría de recibir, las deudas pendientes y metas como la universidad, y restando lo que ya hay ahorrado.",
          ),
        },
        fixQ,
        simple("It's the family's umbrella. Right now it only covers some of the people under it.", "Es el paraguas de la familia. Ahora mismo cubre solo a una parte de los que están debajo."),
      ];
    }
    case "umbrella":
      return [
        {
          id: "what",
          q: tr("What is umbrella insurance?", "¿Qué es un seguro ante demandas?"),
          a: tr(
            `An "umbrella" policy that covers what home and car insurance don't if someone sues you. ${n.recommended ? `The recommendation is ${short(+n.recommended)}.` : `You have ${short(+n.current)}.`}`,
            `Una póliza «paraguas» que cubre lo que no cubren los seguros de casa y coche si alguien ${v("te", "os")} demanda. ${n.recommended ? `Lo recomendado son ${short(+n.recommended)}.` : `${v("Tienes", "Tenéis")} ${short(+n.current)}.`}`,
          ),
          next: ["need"],
        },
        {
          id: "need",
          q: tr("Do I really need it?", "¿De verdad lo necesito?"),
          a: tr("The more you own, the more is at stake in a lawsuit. It usually costs little a year for what it protects.", "Cuanto más patrimonio, más hay en juego en una demanda. Suele costar poco al año para lo que protege."),
        },
        fixQ,
        simple("A big umbrella over the other policies, in case it rains harder than they cover.", "Es un paraguas grande encima de los otros seguros, por si llueve más fuerte de lo que cubren."),
      ];
    case "investments": {
      const sector = n.sector === "Technology" ? tr("technology", "tecnología") : String(n.sector);
      return [
        {
          id: "what",
          q: tr("What does that percentage mean?", "¿Qué significa ese porcentaje?"),
          a: tr(
            `How much of your investments is in stocks: today, ${n.equity}%. For your age and goals, the right mix is ${n.target}%.`,
            `Qué parte de ${v("tus", "vuestras")} inversiones está en acciones: hoy, un ${n.equity}%. Para ${v("tu", "vuestra")} edad y metas, lo que encaja es un ${n.target}%.`,
          ),
          next: ["risk"],
        },
        {
          id: "risk",
          q: +n.equity < +n.target ? tr("Why have more in stocks?", "¿Por qué tener más en acciones?") : tr("Why have less in stocks?", "¿Por qué tener menos en acciones?"),
          a:
            +n.equity < +n.target
              ? tr(
                  "Stocks go up and down more, but over the long run they grow more. With little in stocks, the money may fall short for faraway goals.",
                  "Las acciones suben y bajan más, pero a largo plazo crecen más. Con poco en acciones, el dinero puede quedarse corto para metas lejanas.",
                )
              : tr("With too much in stocks, a bad run in the market weighs more than it should at this stage.", "Con demasiado en acciones, una mala racha de bolsa pesa más de lo que conviene a estas alturas."),
        },
        n.sector && {
          id: "sector",
          q: tr("What is concentration?", "¿Qué es la concentración?"),
          a: tr(
            `A lot of money in one sector (${sector}) means a bad year there hits everything.${n.leveraged ? ` There's also a leveraged fund (${n.leveraged}), which amplifies rises and falls.` : ""}`,
            `Mucho dinero en un mismo sector (${sector}) hace que un mal año de ese sector afecte a todo.${n.leveraged ? ` Además hay un fondo apalancado (${n.leveraged}), que amplifica subidas y bajadas.` : ""}`,
          ),
        },
        fixQ,
        simple("It's what's in the backpack: more weight in stocks gives more push, but more sway on the climb.", "Es la mezcla de la mochila: más peso en acciones da más impulso, pero también más vaivén en la subida."),
      ];
    }
  }
  return [];
}
