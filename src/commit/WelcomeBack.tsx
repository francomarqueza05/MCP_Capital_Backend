"use client";
// Day 3, day 30: the family comes back and Cordi remembers. It says how long it's been, what
// they promised themselves, and asks the one question that matters: did you do it? A yes is
// celebrated with the new score and the next step; a "not yet" gets asked why, kindly, and gets
// something smaller to do today and a new date. Shown on the start screen, before the climb.
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Case } from "@/data/cases";
import { byImpact, moveName } from "@/lib/copy";
import { tr } from "@/lib/lang";
import { useStore } from "@/lib/store";
import { tones } from "@/lib/audio";
import { orb } from "@/orb/engine";
import { buildSteps } from "@/expedition/steps";
import { howTo } from "./howto";
import { daysUntil, finishPlan, isoDay, memory, now, setPlan } from "./memory";
import { dateLabel } from "./Commit";

const EASE = [0.16, 1, 0.3, 1] as const;
/**
 * Leaving with the rest of the greeting ("Not us: switch profile"): without its own way out the
 * box stayed on screen over the four profiles coming back, and flickered.
 */
const OUT = { opacity: 0, y: 8, transition: { duration: 0.2 } };

type Stage = "ask" | "yes" | "why" | "help";

export function WelcomeBack({ c }: { c: Case }) {
  const back = useStore(memory, (m) => m.back);
  const [stage, setStage] = useState<Stage>("ask");
  const [why, setWhy] = useState<string | null>(null);
  if (!back) return null;
  const we = c.household.couple;
  const plan = back.plan;
  const move = plan ? c.moves.find((m) => m.title === plan.move) : null;
  const flags = buildSteps(c).filter((s) => s.kind !== "summit").length;
  const ago =
    back.days <= 0
      ? tr("Welcome back.", "Hola de nuevo.")
      : back.days === 1
        ? tr("Welcome back. It's been a day.", "Hola de nuevo. Ha pasado un día.")
        : tr(`Welcome back. It's been ${back.days} days.`, `Hola de nuevo. Han pasado ${back.days} días.`);

  // nothing promised yet: where they left the climb
  if (!move || !plan || (plan.done && stage !== "yes")) {
    return (
      <motion.div className="wb" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={OUT} transition={{ delay: 0.25, duration: 0.6, ease: EASE }}>
        <p className="wb-hi">{ago}</p>
        <p className="wb-text">
          {plan?.done && move
            ? tr(`Last time you finished «${moveName(move)}». Let's pick the next step at the summit.`, `La última vez ${we ? "terminasteis" : "terminaste"} «${moveName(move)}». Elijamos el siguiente paso en la cima.`)
            : (() => {
                const at = buildSteps(c).find((x) => x.id === memory.get().saved?.camp);
                const where = at && at.kind !== "base" ? tr(` You were at «${at.title}»: we'll pick it up there.`, ` ${we ? "Estabais" : "Estabas"} en «${at.title}»: seguimos ahí.`) : tr(" Let's carry on where you left off.", ` Sigamos donde lo ${we ? "dejasteis" : "dejaste"}.`);
                return back.planted ? tr(`You planted ${back.planted} of ${flags} flags.`, `${we ? "Plantasteis" : "Plantaste"} ${back.planted} de ${flags} banderas.`) + where : where.trim();
              })()}
        </p>
      </motion.div>
    );
  }

  const late = daysUntil(plan.due) < 0;
  const next = byImpact(c.moves).find((m) => m.after > m.before && m.title !== move.title);
  const yes = () => {
    tones.soft();
    orb.flashEmo("happy", 2600);
    orb.hop(1);
    finishPlan();
    setStage("yes");
  };
  const reasons = [
    { id: "time", label: tr("I haven't had time", "No he tenido tiempo") },
    { id: "how", label: tr("I'm not sure how", "No sé muy bien cómo") },
    { id: "talk", label: we ? tr("We need to talk it over", "Tenemos que hablarlo") : tr("I want to ask someone first", "Quiero consultarlo antes") },
    { id: "doubt", label: tr("I'm not sure it's right for me", "No sé si es para mí") },
  ];
  const answer: Record<string, string> = {
    time: tr(`Then just the first bit, today, in ten minutes: ${howTo(move)[0].toLowerCase()}. That alone gets it moving.`, `Entonces solo lo primero, hoy, en diez minutos: ${howTo(move)[0].toLowerCase()}. Solo con eso ya se mueve.`),
    how: tr("Fair enough. At the summit I'll walk you through it step by step, with your own numbers.", "Normal. En la cima te lo explico paso a paso, con tus números."),
    talk: tr("Good idea. Open the summit together tonight: it takes five minutes, and it only counts once you're both in.", "Buena idea. Abrid la cima juntos esta noche: son cinco minutos, y solo cuenta cuando estáis los dos."),
    doubt: tr("That's worth asking your advisor. Meanwhile, at the summit you can pick a different first step.", "Eso merece preguntárselo a tu asesor. Mientras, en la cima puedes elegir otro primer paso."),
  };
  const rebook = () => {
    tones.tap();
    setPlan((p) => (p ? { ...p, due: isoDay(now() + 7 * 86_400_000), blocker: why ?? undefined } : p));
    setStage("help");
  };

  return (
    <motion.div className="wb" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={OUT} transition={{ delay: 0.25, duration: 0.6, ease: EASE }}>
      <p className="wb-hi">{ago}</p>
      <AnimatePresence mode="wait">
        {stage === "ask" && (
          <motion.div key="ask" exit={{ opacity: 0, y: -6 }}>
            <p className="wb-text">
              {tr(`You committed to «${moveName(move)}»`, `${we ? "Os comprometisteis" : "Te comprometiste"} a «${moveName(move)}»`)}{" "}
              {late ? tr(`for ${dateLabel(plan.due)}.`, `para el ${dateLabel(plan.due)}.`) : tr(`by ${dateLabel(plan.due)}.`, `para el ${dateLabel(plan.due)}.`)}
            </p>
            <p className="wb-q">{tr("Did you do it?", we ? "¿Lo hicisteis?" : "¿Lo hiciste?")}</p>
            <div className="wb-actions">
              <button className="act act-main" onClick={yes}>
                {tr("Yes, done!", "¡Sí, hecho!")}
              </button>
              <button className="act act-quiet" onClick={() => (tones.tap(), setStage("why"))}>
                {tr("Not yet", "Todavía no")}
              </button>
            </div>
          </motion.div>
        )}
        {stage === "yes" && (
          <motion.div key="yes" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 18 }}>
            <p className="wb-score">
              <span>{move.before}</span> → <b>{move.after}</b>
            </p>
            <p className="wb-text">
              {tr(`Brilliant. That's ${move.after - move.before} points up the mountain.`, `Genial. Son ${move.after - move.before} puntos más arriba en la montaña.`)}{" "}
              {next ? tr(`Next on the route: ${moveName(next).toLowerCase()}.`, `Lo siguiente en la ruta: ${moveName(next).toLowerCase()}.`) : ""}
            </p>
          </motion.div>
        )}
        {stage === "why" && (
          <motion.div key="why" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <p className="wb-q">{tr("No problem. What got in the way?", "No pasa nada. ¿Qué se ha cruzado?")}</p>
            <div className="wb-reasons">
              {reasons.map((r) => (
                <button key={r.id} className={why === r.id ? "qa-chip on" : "qa-chip"} onClick={() => (tones.tap(), setWhy(r.id))}>
                  {r.label}
                </button>
              ))}
            </div>
            {why && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <p className="wb-text wb-answer">{answer[why]}</p>
                <button className="act act-main" onClick={rebook}>
                  {tr("Move it to next week", "Pasarlo a la semana que viene")}
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
        {stage === "help" && (
          <motion.div key="help" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <p className="wb-text">
              {tr(`New date: ${dateLabel(memory.get().saved?.plan?.due ?? plan.due)}. I'll be here.`, `Nueva fecha: ${dateLabel(memory.get().saved?.plan?.due ?? plan.due)}. Aquí estaré.`)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
