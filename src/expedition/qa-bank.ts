// The questions people tend to have at each camp, answered from the family's own numbers.
// Same rule as the rest of the summary: every figure comes from the case data, no AI, no
// guessing. Each answer can open follow-ups, so one tap starts a short conversation.
import { pillarPoints, type Case, type Topic } from "@/data/cases";
import { BAND, byImpact, CAPS, EFFORT, fixFor, moveName, num, short } from "@/lib/copy";
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
  return [
    {
      id: "how",
      q: "¿Cómo se calcula la nota?",
      a: `Suma cinco tramos: ${c.score.pillars.map((p) => p.name.toLowerCase()).join(", ")}. Cada uno da un máximo de puntos según lo bien que ${v("estás", "estáis")} en ese tema, y entre todos llegan a 100.`,
      next: ["room", "weak"],
    },
    {
      id: "good",
      q: `¿Un ${c.score.value} es ${v("bueno o malo", "bueno o malo")}?`,
      a: `Está en la franja «${band.label.toLowerCase()}». ${band.status === "good" ? "Es una base sólida: toca afinar, no rescatar." : band.status === "warn" ? "No hay alarma, pero hay tramos que conviene arreglar antes de que pesen." : "Hay tramos que hoy os dejan expuestos ante un imprevisto; la buena noticia es que varios se arreglan con poco esfuerzo."}`.replace("os dejan", v("te dejan", "os dejan")),
      next: ["room"],
    },
    {
      id: "room",
      q: "¿Dónde puedo subir más?",
      a: `En ${room.name.toLowerCase()}: ${v("llevas", "lleváis")} ${rp.got} de ${rp.of} puntos, así que ahí quedan ${rp.of - rp.got} por ganar. Es el tramo con más margen.`,
    },
    {
      id: "weak",
      q: "¿Cuál es mi punto más débil?",
      a: `${weakest.name}, con ${weakest.score} sobre 100 dentro de su tramo. Lo verás con calma en su campamento.`,
    },
    caps.length > 0 && {
      id: "caps",
      q: "¿Qué es una barrera?",
      a: `Hay situaciones que ponen techo a la nota aunque el resto vaya bien. ${v("Tú tienes", "Vosotros tenéis")} ${caps.length > 1 ? "dos" : "una"}: ${caps.join(" y ")}. Mientras ${caps.length > 1 ? "sigan" : "siga"} ahí, la nota no puede subir libremente.`,
    },
    {
      id: SIMPLER,
      q: "Explícamelo más simple",
      a: `Piensa en la nota como el estado de forma antes de subir una montaña. Un ${c.score.value} quiere decir que ${band.status === "good" ? "estás en forma para la subida" : band.status === "warn" ? "puedes subir, pero con alguna mochila de más" : "conviene entrenar algunos tramos antes de la subida"}. Cada campamento te enseña uno.`.replace("estás", v("estás", "estáis")).replace("puedes", v("puedes", "podéis")),
    },
  ];
}

function summit(c: Case, v: V): Maybe[] {
  const moves = byImpact(c.moves);
  const best = moves[0];
  if (!best) return [{ id: SIMPLER, q: "Explícamelo más simple", a: `${v("Vas", "Vais")} por buen camino: lo importante ahora es no perder lo que ya ${v("tienes", "tenéis")}.` }];
  const easy = moves.find((m) => m.effort === "low");
  return [
    {
      id: "why-first",
      q: "¿Por qué empezar por este paso?",
      a: `Porque es el que más mueve la nota: de ${best.before} a ${best.after}${best.liftsCap ? ", y además quita una barrera" : ""}. ${EFFORT[best.effort]}.`,
      next: ["easy", "all"],
    },
    easy && easy !== best && {
      id: "easy",
      q: "¿Hay algo fácil para empezar ya?",
      a: `Sí: ${moveName(easy).toLowerCase()}. Pide poco esfuerzo y la nota pasaría de ${easy.before} a ${easy.after}.`,
    },
    {
      id: "all",
      q: "¿Qué pasa si lo hago todo?",
      a: `Cada paso suma por su lado: ${moves.map((m) => `${moveName(m).toLowerCase()} (+${m.after - m.before})`).join(", ")}. No hace falta hacerlo todo a la vez; ${v("tu", "vuestro")} asesor ${v("te", "os")} ayuda a ordenarlo.`,
    },
    {
      id: "advisor",
      q: "¿Qué hago ahora?",
      a: `Habla${v("", "d")} con ${v("tu", "vuestro")} asesor de Sherpas y empezad por el primer paso. Lo que ${v("has", "habéis")} visto aquí es la misma ruta con la que trabaja.`.replace("empezad", v("empieza", "empezad")),
    },
    {
      id: SIMPLER,
      q: "Explícamelo más simple",
      a: `La cima no se sube de un salto. Este primer paso es el tramo que más altura ${v("te", "os")} da por el esfuerzo que cuesta.`,
    },
  ];
}

function topic(t: Topic, c: Case, v: V): Maybe[] {
  const n = t.numbers as Record<string, number & string>;
  const fix = fixFor(c, t);
  const fixQ: Maybe = fix && fix.after > fix.before && {
    id: "fix",
    q: "¿Qué propone Sherpas?",
    a: `${moveName(fix)}. ${EFFORT[fix.effort]}, y la nota pasaría de ${fix.before} a ${fix.after}.`,
  };
  const simple = (a: string): Question => ({ id: SIMPLER, q: "Explícamelo más simple", a });

  switch (t.id) {
    case "cashflow": {
      const flow = +n.flow;
      return [
        {
          id: "what",
          q: "¿Qué es el flujo de caja?",
          a: `Lo que entra en un año menos lo que sale. ${v("Ingresas", "Ingresáis")} ${short(+n.income)} al año; ${flow < 0 ? `salen ${short(flow)} más de lo que entra, y esa diferencia se paga con ahorros.` : `${v("te", "os")} quedan ${short(flow)} libres para metas.`}`,
          next: ["rate"],
        },
        {
          id: "rate",
          q: "¿Ahorro suficiente?",
          a: `${v("Ahorras", "Ahorráis")} un ${Math.round(+n.saveRate * 100)}% de lo que ${v("ganas", "ganáis")}. ${+n.saveRate >= 0.2 ? "Es un buen ritmo." : "Lo habitual es apuntar al 15–20%."}`,
        },
        flow < 0 && {
          id: "neg",
          q: "¿Es grave gastar más de lo que entra?",
          a: `Un año suelto, no. Pero si se repite, cada año ${v("te", "os")} come ${short(flow)} de ahorros que estaban para otras metas, como la jubilación.`,
        },
        fixQ,
        simple(flow < 0 ? "Es como un cubo con una pequeña fuga: el agua que entra no llega a llenarlo, y vas tirando del depósito." : "Es el agua que sobra cada año en el cubo: puedes llevarla a donde más falte."),
      ];
    }
    case "emergency":
      return [
        {
          id: "what",
          q: "¿Qué es el colchón de emergencia?",
          a: `Dinero a mano para vivir si los ingresos paran de golpe: una baja, un despido. ${v("Cubres", "Cubrís")} ${num(+n.months, 1)} meses de gastos.`,
          next: ["why"],
        },
        {
          id: "why",
          q: `¿Por qué ${n.min} a ${n.max} meses?`,
          a: `Es lo que se recomienda para ${v("tu", "vuestra")} situación: cuanto más depende la casa de un solo sueldo o más gastos fijos hay, más colchón hace falta.`,
        },
        +n.months > +n.max && {
          id: "too-much",
          q: "¿Tener de más es malo?",
          a: `No es peligroso, pero ${num(+n.months - +n.max, 1)} meses de más parados en la cuenta no crecen. Esa parte podría trabajar en otras metas.`,
        },
        +n.after < +n.months && {
          id: "after",
          q: "¿Y después de los gastos previstos?",
          a: `Tras los gastos que ya ${v("tienes", "tenéis")} planeados, el colchón quedaría en ${num(+n.after, 1)} meses.`,
        },
        simple(+n.months < +n.min ? "Es la rueda de repuesto. Ahora mismo la tuya está medio deshinchada." : "Es la rueda de repuesto. La tuya está de sobra, quizá demasiado."),
      ];
    case "near-goal":
      return [
        {
          id: "what",
          q: "¿Qué pasa con mi colchón?",
          a: `${String(n.goal)} (${n.when}) cuesta ${short(+n.amount)}. Si sale del colchón, pasaría de ${num(+n.months, 1)} meses a ${num(+n.after, 1)}.`,
          next: ["risk"],
        },
        {
          id: "risk",
          q: "¿Por qué es un riesgo?",
          a: `Porque justo después de la compra no quedaría reserva: cualquier imprevisto habría que pagarlo con deuda.`,
        },
        simple("Es como gastar la rueda de repuesto en el viaje: llegas, pero sin plan B si pinchas."),
      ];
    case "debt":
      if (n.balance)
        return [
          {
            id: "what",
            q: "¿Por qué la deuda no baja?",
            a: `${v("Debes", "Debéis")} ${short(+n.balance)} en tarjetas. ${v("Pagas", "Pagáis")} ${short(+n.monthly)} al mes, pero ${short(+n.interest)} se van en intereses: la deuda apenas baja.`,
            next: ["first"],
          },
          {
            id: "first",
            q: "¿Qué pago primero?",
            a: "La tarjeta con el interés más alto. Cada dólar que va ahí es el que más intereses ahorra.",
          },
          n.capped === "true" && {
            id: "cap",
            q: "¿Por qué frena mi nota?",
            a: "Una deuda de tarjeta alta con interés alto pone techo a la nota: mientras siga, el resto de mejoras luce menos.",
          },
          fixQ,
          simple("Es como subir por una escalera mecánica que baja: caminas, pero casi no avanzas."),
        ];
      return [
        {
          id: "what",
          q: "¿Qué es el DTI?",
          a: `Qué parte del sueldo se va en pagar deudas cada mes. En ${v("tu", "vuestro")} caso, un ${Math.round(+n.dti * 100)}%. Hasta un 36% se considera sano.`,
        },
        simple("De cada 100 que entran, una parte ya está comprometida. La tuya es pequeña: vas holgado."),
      ];
    case "retirement": {
      const runs = n.runOut !== "Not applicable";
      return [
        {
          id: "what",
          q: runs ? "¿Por qué se acabarían mis ahorros?" : +n.gap > 0 ? "¿Qué significa el hueco?" : "¿Estoy bien para jubilarme?",
          a: runs
            ? `Al ritmo previsto, ${v("sacarías", "sacaríais")} cada año un ${num(+n.draw, 1)}% de los ahorros. Es más de lo que crecen, y a los ${n.runOut} se agotarían.`
            : +n.gap > 0
              ? `Para jubilar${v("te", "os")} a los ${n.retireAge} como ${v("planeas", "planeáis")} harían falta ${short(+n.gap)} más de lo que llegaréis a tener (${short(+n.projected)}).`.replace("llegaréis", v("llegarás", "llegaréis"))
              : `Sí: lo previsto cubre un ${n.incomeShare}% de los gastos de jubilado.`,
          next: ["fix-how"],
        },
        (runs || +n.gap > 0) && {
          id: "fix-how",
          q: "¿Cuánto tendría que ahorrar?",
          a: +n.extraSave > 0 ? `Unos ${short(+n.extraSave)} más al año, o retrasar algo la jubilación, o una mezcla de las dos.` : `No es tanto ahorrar más como sacar menos cada año: bajar del ${num(+n.draw, 1)}% hacia un 4% alarga mucho los ahorros.`,
        },
        {
          id: "share",
          q: "¿Qué parte de mis gastos cubro?",
          a: `Un ${n.incomeShare}% de lo que ${v("gastarías", "gastaríais")} de jubilado quedaría cubierto con lo previsto.`,
        },
        fixQ,
        simple(runs ? "Es una despensa que vacías más rápido de lo que la llenas: aguanta un tiempo, pero no toda la vida." : +n.gap > 0 ? "Es como llenar un depósito para un viaje largo: ahora mismo no llega hasta el destino." : "El depósito llega al destino con margen."),
      ];
    }
    case "education":
      return [
        {
          id: "what",
          q: "¿Cuánto cuesta la universidad?",
          a: `Calculado para ${c.household.kids.length > 1 ? "vuestros hijos" : "la universidad prevista"}: ${short(+n.need)} en total. Hay ${short(+n.have)} ahorrados, así que faltan ${short(+n.gap)}.`,
          next: ["how"],
        },
        {
          id: "how",
          q: "¿Cómo lo cubro?",
          a: +n.extraSave > 0 ? `Apartando unos ${short(+n.extraSave)} más al año, con tiempo, se llega.` : "Con el ahorro actual repartido de otra forma; vale la pena revisarlo con el asesor.",
        },
        simple("Es una hucha con fecha: cuanto antes empiezas a llenarla, menos cuesta cada mes."),
      ];
    case "life": {
      const people = (n.people as unknown as { name: string; has: number; need: number }[]) ?? [];
      return [
        {
          id: "what",
          q: "¿Para qué sirve el seguro de vida?",
          a: `Para que, si alguien falta, la familia pueda seguir con su vida: casa, estudios, gastos. ${people.map((p) => `${p.name} tiene ${short(p.has)} y necesitaría ${short(p.need)}`).join("; ")}.`,
          next: ["how-much"],
        },
        {
          id: "how-much",
          q: "¿Cómo se calcula lo que necesito?",
          a: "Sumando los años de ingresos que la familia dejaría de recibir, las deudas pendientes y metas como la universidad, y restando lo que ya hay ahorrado.",
        },
        fixQ,
        simple("Es el paraguas de la familia. Ahora mismo cubre solo a una parte de los que están debajo."),
      ];
    }
    case "umbrella":
      return [
        {
          id: "what",
          q: "¿Qué es un seguro ante demandas?",
          a: `Una póliza «paraguas» que cubre lo que no cubren los seguros de casa y coche si alguien ${v("te", "os")} demanda. ${n.recommended ? `Lo recomendado son ${short(+n.recommended)}.` : `${v("Tienes", "Tenéis")} ${short(+n.current)}.`}`,
          next: ["need"],
        },
        {
          id: "need",
          q: "¿De verdad lo necesito?",
          a: "Cuanto más patrimonio, más hay en juego en una demanda. Suele costar poco al año para lo que protege.",
        },
        fixQ,
        simple("Es un paraguas grande encima de los otros seguros, por si llueve más fuerte de lo que cubren."),
      ];
    case "investments":
      return [
        {
          id: "what",
          q: "¿Qué significa ese porcentaje?",
          a: `Qué parte de ${v("tus", "vuestras")} inversiones está en acciones: hoy, un ${n.equity}%. Para ${v("tu", "vuestra")} edad y metas, lo que encaja es un ${n.target}%.`,
          next: ["risk"],
        },
        {
          id: "risk",
          q: +n.equity < +n.target ? "¿Por qué tener más en acciones?" : "¿Por qué tener menos en acciones?",
          a: +n.equity < +n.target ? "Las acciones suben y bajan más, pero a largo plazo crecen más. Con poco en acciones, el dinero puede quedarse corto para metas lejanas." : "Con demasiado en acciones, una mala racha de bolsa pesa más de lo que conviene a estas alturas.",
        },
        n.sector && {
          id: "sector",
          q: "¿Qué es la concentración?",
          a: `Mucho dinero en un mismo sector (${n.sector === "Technology" ? "tecnología" : n.sector}) hace que un mal año de ese sector afecte a todo.${n.leveraged ? ` Además hay un fondo apalancado (${n.leveraged}), que amplifica subidas y bajadas.` : ""}`,
        },
        fixQ,
        simple("Es la mezcla de la mochila: más peso en acciones da más impulso, pero también más vaivén en la subida."),
      ];
  }
  return [];
}
