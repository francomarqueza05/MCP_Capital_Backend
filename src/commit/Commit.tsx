"use client";
// At the summit, the plan becomes a promise: the first step, picked (the biggest lift comes
// first), what it changes in their life, how to do it in small steps, a date, and, for a
// couple, both saying "I'm in". Then a calendar entry, the steps to tick off, and "Done!",
// which Cordi celebrates and turns into the next step. The same card is what they find when
// they come back on day 3 or day 30.
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { Case, Move } from "@/data/cases";
import { byImpact, EFFORT, moveName } from "@/lib/copy";
import { lang, tr } from "@/lib/lang";
import { useStore } from "@/lib/store";
import { speak, tones } from "@/lib/audio";
import { orb } from "@/orb/engine";
import { showBubble } from "@/stage/stage";
import { downloadIcs, howTo, lifeChange } from "./howto";
import { daysUntil, finishPlan, isoDay, memory, now, setPlan } from "./memory";

const EASE = [0.16, 1, 0.3, 1] as const;
const DAY = 86_400_000;

/** Cordi says it out loud and in its bubble. */
export function cordiSays(text: string, ms = 5200) {
  showBubble(text, ms);
  void speak(text);
}

export const dateLabel = (due: string) =>
  new Date(`${due}T12:00:00`).toLocaleDateString(lang() === "es" ? "es-ES" : "en-US", { weekday: "long", month: "long", day: "numeric" });

export function Commit({ c }: { c: Case }) {
  const moves = useMemo(() => byImpact(c.moves).filter((m) => m.after > m.before), [c]);
  const saved = useStore(memory, (m) => m.saved);
  const plan = saved?.plan ?? null;
  const history = saved?.history ?? [];
  const doneTitles = new Set(history.map((h) => h.move));
  const open = moves.filter((m) => !doneTitles.has(m.title));
  const [pick, setPick] = useState<string | null>(null);
  const chosen = open.find((m) => m.title === (pick ?? plan?.move)) ?? open[0];
  const [due, setDue] = useState<string | null>(null);
  const [agreed, setAgreed] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const people = c.household.names;
  const we = c.household.couple;

  if (!moves.length) return null;
  const allDone = !open.length;

  // ---------------------------------------------------------------- all done
  if (allDone)
    return (
      <motion.section className="commit commit-done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <p className="commit-kicker">⛳ {tr("Every step done", "Todos los pasos hechos")}</p>
        <h3 className="commit-title">{tr("You climbed the whole route.", "Habéis subido toda la ruta.")}</h3>
        <p className="commit-life">{tr("Your advisor can now look at the next goals with you.", "Tu asesor puede mirar ya contigo las siguientes metas.")}</p>
      </motion.section>
    );

  // ---------------------------------------------------------------- committed
  if (plan && !editing) {
    const m = moves.find((x) => x.title === plan.move) ?? chosen;
    const steps = howTo(m);
    const left = daysUntil(plan.due);
    const tick = (i: number) => {
      tones.tap();
      setPlan((p) => (p ? { ...p, ticks: p.ticks.includes(i) ? p.ticks.filter((x) => x !== i) : [...p.ticks, i] } : p));
    };
    const done = () => {
      tones.soft();
      orb.flashEmo("happy", 2600);
      orb.hop(0.9);
      finishPlan();
      const nextMove = open.find((x) => x.title !== m.title);
      cordiSays(
        nextMove
          ? tr(
              `You did it! Your score goes from ${m.before} to ${m.after}. Next on the route: ${moveName(nextMove).toLowerCase()}.`,
              `¡Lo ${we ? "habéis" : "has"} hecho! La nota pasa de ${m.before} a ${m.after}. Lo siguiente en la ruta: ${moveName(nextMove).toLowerCase()}.`,
            )
          : tr(`You did it! Your score goes from ${m.before} to ${m.after}.`, `¡Lo ${we ? "habéis" : "has"} hecho! La nota pasa de ${m.before} a ${m.after}.`),
        7000,
      );
    };
    return (
      <motion.section className="commit is-set" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <p className="commit-kicker">
          🤝 {tr("Committed", we ? "Comprometidos" : "Comprometido")} · {left > 0 ? tr(`${left} days left`, `quedan ${left} días`) : left === 0 ? tr("today", "hoy") : tr(`${-left} days late`, `${-left} días de retraso`)}
        </p>
        <h3 className="commit-title">{moveName(m)}</h3>
        <p className="commit-when">
          {tr("By", "Para el")} {dateLabel(plan.due)}
          {we && plan.agreed.length ? ` · ${plan.agreed.join(" + ")}` : ""}
        </p>
        <ol className="commit-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <button className={plan.ticks.includes(i) ? "commit-tick on" : "commit-tick"} onClick={() => tick(i)} aria-pressed={plan.ticks.includes(i)}>
                <span className="commit-box" aria-hidden>
                  {plan.ticks.includes(i) ? "✓" : ""}
                </span>
                {s}
              </button>
            </li>
          ))}
        </ol>
        <div className="commit-actions">
          <button className="act act-main" onClick={done}>
            {tr("Done! I did it", we ? "¡Hecho! Lo hicimos" : "¡Hecho! Lo hice")}
          </button>
          <button className="act act-quiet" onClick={() => downloadIcs(c, m, plan.due)}>
            📅 {tr("Add to my calendar", "Añadir al calendario")}
          </button>
          <button className="commit-link" onClick={() => setEditing(true)}>
            {tr("Change step or date", "Cambiar paso o fecha")}
          </button>
        </div>
      </motion.section>
    );
  }

  // ---------------------------------------------------------------- choosing
  const today = now();
  const options = [
    { id: "week", label: tr("This week", "Esta semana"), d: isoDay(today + 5 * DAY) },
    { id: "two", label: tr("In 2 weeks", "En 2 semanas"), d: isoDay(today + 14 * DAY) },
    { id: "month", label: tr("This month", "Este mes"), d: isoDay(today + 30 * DAY) },
  ];
  const life = lifeChange(c, chosen);
  const ready = Boolean(due) && (!we || people.every((p) => agreed.includes(p)));
  const commit = () => {
    if (!ready || !due) return;
    tones.soft();
    orb.flashEmo("happy", 2200);
    orb.hop(0.7);
    setPlan(() => ({ move: chosen.title, due, at: now(), agreed: we ? agreed : people, ticks: [] }));
    setEditing(false);
    cordiSays(
      tr(
        `Deal. ${moveName(chosen)}, by ${dateLabel(due)}. Add it to your calendar, and I'll ask you how it went when you come back.`,
        `Trato hecho. ${moveName(chosen)}, para el ${dateLabel(due)}. ${we ? "Añadidlo" : "Añádelo"} al calendario, y cuando ${we ? "volváis" : "vuelvas"} ${we ? "os" : "te"} pregunto cómo fue.`,
      ),
      7000,
    );
  };

  return (
    <motion.section className="commit" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.9, ease: EASE }}>
      <p className="commit-kicker">{tr("Make it real", "Hazlo real")}</p>
      <h3 className="commit-title">{tr("Pick your first step", we ? "Elegid vuestro primer paso" : "Elige tu primer paso")}</h3>

      <div className="commit-moves" role="radiogroup" aria-label={tr("Steps", "Pasos")}>
        {open.map((m: Move, i) => (
          <button key={m.title} role="radio" aria-checked={m.title === chosen.title} className={m.title === chosen.title ? "commit-move on" : "commit-move"} onClick={() => (tones.tap(), setPick(m.title))}>
            <span className="commit-gain">+{m.after - m.before}</span>
            <span className="commit-name">
              {moveName(m)}
              {i === 0 && <small className="commit-badge">{tr("Biggest lift", "El que más sube")}</small>}
            </span>
            <span className="commit-effort">{EFFORT[m.effort]}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={chosen.title} className="commit-detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
          {life && <p className="commit-life">{life}</p>}
          <p className="commit-sub">{tr("How, in small steps:", "Cómo, en pasos pequeños:")}</p>
          <ol className="commit-steps preview">
            {howTo(chosen).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </motion.div>
      </AnimatePresence>

      <p className="commit-sub">{tr("When will you do it?", we ? "¿Cuándo lo haréis?" : "¿Cuándo lo harás?")}</p>
      <div className="commit-dates">
        {options.map((o) => (
          <button key={o.id} className={due === o.d ? "qa-chip on" : "qa-chip"} onClick={() => (tones.tap(), setDue(o.d))}>
            {o.label}
          </button>
        ))}
        <input className="commit-date" type="date" min={isoDay(today)} value={due ?? ""} onChange={(e) => setDue(e.target.value || null)} aria-label={tr("Pick a date", "Elige una fecha")} />
      </div>

      {we && (
        <>
          <p className="commit-sub">{tr("It only counts if you're both in:", "Solo cuenta si estáis los dos:")}</p>
          <div className="commit-people">
            {people.map((p) => {
              const on = agreed.includes(p);
              return (
                <button key={p} className={on ? "commit-person on" : "commit-person"} aria-pressed={on} onClick={() => (tones.tap(), setAgreed((a) => (on ? a.filter((x) => x !== p) : [...a, p])))}>
                  {on ? "✓ " : ""}
                  {tr(`${p}: I'm in`, `${p}: me apunto`)}
                </button>
              );
            })}
          </div>
          {due && agreed.length === 1 && <p className="commit-wait">{tr(`Waiting for ${people.find((p) => !agreed.includes(p))}…`, `Esperando a ${people.find((p) => !agreed.includes(p))}…`)}</p>}
        </>
      )}

      <div className="commit-actions">
        <button className="act act-main act-large" disabled={!ready} onClick={commit}>
          🤝 {tr("Commit to this step", we ? "Nos comprometemos" : "Me comprometo")}
        </button>
        {plan && (
          <button className="commit-link" onClick={() => setEditing(false)}>
            {tr("Cancel", "Cancelar")}
          </button>
        )}
      </div>
    </motion.section>
  );
}
