// Turning a Sherpas move into something a family can actually do this week: a few concrete
// sub-steps, what changes in their life (from the case's own figures, nothing invented), and a
// calendar entry. The steps are general know-how per kind of move, not advice on products.
import type { Case, Move, Topic } from "@/data/cases";
import { moveName, TOPIC_MOVES } from "@/lib/copy";
import { tr } from "@/lib/lang";
import { money } from "@/lib/talk";

/** The topic a move belongs to. */
export const topicOf = (c: Case, m: Move): Topic | undefined => c.topics.find((t) => (TOPIC_MOVES[t.id] ?? []).includes(m.title));

/** How to do it, in three or four small steps. */
export function howTo(m: Move): string[] {
  switch (m.title) {
    case "Pay down revolving card":
      return tr(
        ["Move part of your spare cash to the card with the highest interest", "Set up an automatic monthly payment above the minimum", "Stop using that card until it's at zero", "Check the balance on the next statement"],
        ["Pasa parte del dinero que te sobra a la tarjeta con el interés más alto", "Programa un pago mensual automático por encima del mínimo", "Deja de usar esa tarjeta hasta que esté a cero", "Comprueba el saldo en el siguiente extracto"],
      );
    case "Raise mortality coverage":
    case "Add life cover":
    case "Close a coverage gap":
      return tr(
        ["Ask your advisor for the amount of cover you need", "Get quotes for term life insurance from two or three insurers", "Pick the term until your youngest finishes college", "Sign, and tell your partner where the policy is"],
        ["Pide a tu asesor la cobertura exacta que necesitas", "Pide presupuestos de seguro de vida temporal a dos o tres aseguradoras", "Elige un plazo hasta que el pequeño termine la universidad", "Firma, y cuenta a tu pareja dónde está la póliza"],
      );
    case "Add umbrella cover":
      return tr(
        ["Call the insurer of your home or car: they usually offer it", "Ask for a quote for the recommended amount", "Check it sits on top of your home and car policies", "Sign it: it usually costs little a year"],
        ["Llama a la aseguradora de tu casa o coche: suelen ofrecerlo", "Pide precio para la cobertura recomendada", "Comprueba que va por encima de tus seguros de casa y coche", "Contrátalo: suele costar poco al año"],
      );
    case "Raise annual savings":
      return tr(
        ["Pick the amount to put aside each month", "Raise your 401(k) contribution, or set an automatic transfer on payday", "Cut one recurring expense to make room for it", "Check in three months that it's still going in"],
        ["Elige cuánto apartar cada mes", "Sube tu aportación al 401(k), o programa una transferencia el día de cobro", "Recorta un gasto fijo para hacerle sitio", "Comprueba en tres meses que sigue entrando"],
      );
    case "Lower the withdrawal rate":
      return tr(
        ["Write down what you'll really spend each year once retired", "Plan to draw closer to 4% a year from savings", "Look at working a little longer or part-time as a bridge", "Go over the new numbers with your advisor"],
        ["Apunta lo que de verdad gastarás cada año ya jubilado", "Planea sacar cerca de un 4% al año de los ahorros", "Valora trabajar algo más o a media jornada como puente", "Repasa las nuevas cifras con tu asesor"],
      );
    case "Raise growth allocation toward glide":
    case "Reduce growth allocation toward glide":
      return tr(
        ["Look at what share of your investments is in stocks today", "Ask your advisor for the mix that fits your age", "Rebalance new contributions first, then the rest", "Set a yearly reminder to check the mix again"],
        ["Mira qué parte de tus inversiones está hoy en acciones", "Pide a tu asesor la mezcla que encaja con tu edad", "Reequilibra primero con las nuevas aportaciones, luego el resto", "Pon un recordatorio anual para revisar la mezcla"],
      );
    case "Reduce single-name concentration":
      return tr(
        ["List the positions that weigh the most", "Decide with your advisor how much to move into broad funds", "Move it in a few steps, watching the taxes", "Check the sector weights again in six months"],
        ["Haz una lista de las posiciones que más pesan", "Decide con tu asesor cuánto pasar a fondos amplios", "Muévelo en varios pasos, cuidando los impuestos", "Revisa el peso de cada sector en seis meses"],
      );
  }
  return tr(["Talk it over with your advisor", "Pick a date to start", "Check that it worked"], ["Háblalo con tu asesor", "Elige una fecha para empezar", "Comprueba que funcionó"]);
}

/** What changes in their life if they do it, from the case's figures (null when unclear). */
export function lifeChange(c: Case, m: Move): string | null {
  const t = topicOf(c, m);
  const n = (t?.numbers ?? {}) as Record<string, number & string>;
  switch (m.title) {
    case "Pay down revolving card":
      return n.interest
        ? tr(`About ${money(+n.interest)} a month stops going to interest and starts staying with you.`, `Unos ${money(+n.interest)} al mes dejan de irse en intereses y se quedan contigo.`)
        : null;
    case "Raise mortality coverage":
    case "Add life cover":
    case "Close a coverage gap": {
      const s = (+n.shortfall || 0) + (+n.coShortfall || 0);
      return s ? tr(`If the worst happened, your family would have ${money(s)} more to keep the house and their plans.`, `Si pasara lo peor, tu familia tendría ${money(s)} más para mantener la casa y sus planes.`) : null;
    }
    case "Add umbrella cover":
      return n.recommended ? tr(`A lawsuit could no longer reach your home or savings: ${money(+n.recommended)} of cover stands in front.`, `Una demanda ya no podría llegar a tu casa ni a tus ahorros: ${money(+n.recommended)} de cobertura se ponen delante.`) : null;
    case "Raise annual savings":
      return n.extraSave ? tr(`About ${money(+n.extraSave / 12)} more a month closes the gap Sherpas sees for ${t?.title.toLowerCase()}.`, `Unos ${money(+n.extraSave / 12)} más al mes cierran el hueco que Sherpas ve en ${t?.title.toLowerCase()}.`) : null;
    case "Lower the withdrawal rate":
      return n.runOut && n.runOut !== "Not applicable" ? tr(`Your savings would last beyond ${n.runOut}, the age they'd run out today.`, `Tus ahorros durarían más allá de los ${n.runOut}, la edad a la que hoy se acabarían.`) : null;
    case "Raise growth allocation toward glide":
    case "Reduce growth allocation toward glide":
      return n.equity ? tr(`Your money goes from ${n.equity}% to about ${n.target}% in stocks: the mix that fits your age.`, `Tu dinero pasa de un ${n.equity}% a cerca de un ${n.target}% en acciones: la mezcla de tu edad.`) : null;
    case "Reduce single-name concentration":
      return tr("One bad year in one sector would no longer drag everything down with it.", "Un mal año de un solo sector ya no arrastraría todo lo demás.");
  }
  return null;
}

/** A calendar file for the step, with the sub-steps in it and a reminder the day before. */
export function icsFor(c: Case, m: Move, due: string): string {
  const d = due.replace(/-/g, "");
  const next = new Date(`${due}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const esc = (s: string) => s.replace(/[\\,;]/g, (x) => `\\${x}`).replace(/\n/g, "\\n");
  const body = [lifeChange(c, m), ...howTo(m).map((s, i) => `${i + 1}. ${s}`), tr("Cordi will ask you how it went.", "Cordi te preguntará cómo fue.")].filter(Boolean).join("\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cordada//First step//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:cordada-${c.id}-${d}@cordada`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc(`${tr("First step", "Primer paso")}: ${moveName(m)}`)}`,
    `DESCRIPTION:${esc(body)}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`${tr("Tomorrow", "Mañana")}: ${moveName(m)}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Saves the calendar file. */
export function downloadIcs(c: Case, m: Move, due: string) {
  const blob = new Blob([icsFor(c, m, due)], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cordada-${tr("first-step", "primer-paso")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
