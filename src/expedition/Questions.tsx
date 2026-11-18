"use client";
// Questions at a camp: a few chips with what people usually ask here. A tap opens the
// conversation and Cordi answers from the family's numbers; the answer opens follow-ups and
// asked chips drop away. Then "did that land?": a flag is only planted once the camp is clear.
// The same chips and check appear on the camp's detail and under the conversation.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo } from "react";
import type { Case } from "@/data/cases";
import { tones } from "@/lib/audio";
import { useStore } from "@/lib/store";
import { orb } from "@/orb/engine";
import { addTry, chat, converse, markAsked } from "@/stage/chat";
import { explain } from "@/explain/player";
import { refreshSuggestions, setHovering, suggest, usedSuggestion } from "@/ai/suggest";
import { firstQuestions, questionsFor, SIMPLER, type Question } from "./qa-bank";
import type { Step } from "./steps";
import { tr } from "@/lib/lang";
import { mark, MARKS, understanding, type Mark } from "./understanding";

const NONE: string[] = [];

function useCamp(step: Step, c: Case) {
  const all = useMemo(() => questionsFor(step, c), [step, c]);
  const byId = useMemo(() => new Map(all.map((q) => [q.id, q])), [all]);
  const asked = useStore(chat, (s) => s.asked[step.id] ?? NONE);
  const tries = useStore(chat, (s) => s.tries[step.id] ?? 0);
  const busy = useStore(chat, (s) => s.busy);
  const marked = useStore(understanding, (s) => s.marks[step.id]);
  const we = c.household.couple;

  const last = byId.get(asked.at(-1) ?? "");
  const followUps = (last?.next ?? []).map((id) => byId.get(id)).filter((q): q is Question => !!q && !asked.includes(q.id));
  const rest = firstQuestions(all).filter((q) => !asked.includes(q.id) && !followUps.includes(q));

  const ask = (q: Question, as = q.q) => {
    if (chat.get().busy) return;
    tones.tap();
    markAsked(step.id, q.id);
    return converse(as, q.a, step.title);
  };

  /** "Did that land?" A yes plants the flag; anything else gets the idea again, more simply. */
  const rate = async (m: Mark) => {
    if (chat.get().busy) return;
    mark(step.id, m);
    if (m === "yes") {
      tones.tap();
      orb.flashEmo("happy", 1400);
      return;
    }
    addTry(step.id);
    const simpler = byId.get(SIMPLER);
    if (simpler && !asked.includes(SIMPLER)) return ask(simpler, m === "no" ? tr("I didn't get it, explain it more simply", "No lo he entendido, explícamelo más simple") : simpler.q);
    orb.flashEmo("concerned", 1200);
    await converse(
      tr("I still don't see it", "Sigo sin verlo claro"),
      tr(
        "That's completely normal. I'll note it down so you can talk it over with your advisor. If you like, write me your question in your own words.",
        `No pasa nada, es de lo más normal. Lo dejo apuntado para que ${we ? "lo habléis" : "lo hables"} con ${we ? "vuestro" : "tu"} asesor. Si ${we ? "queréis" : "quieres"}, ${we ? "escribidme" : "escríbeme"} la duda con ${we ? "vuestras" : "tus"} palabras.`,
      ),
      step.title,
    );
  };

  return { chips: [...followUps, ...rest], followUps, asked, tries, busy, marked, we, ask, rate };
}

/**
 * The suggested questions. Generated for this moment by the AI (after each answer, step or camp
 * change); until they arrive, or without the AI, the fixed ones for this camp. "Explícamelo
 * más simple" always stays, and taps on a generated question go to the AI.
 */
export function Suggestions({ step, c, delay = 0, title }: { step: Step; c: Case; delay?: number; title?: string }) {
  const { chips, followUps, asked, busy, ask } = useCamp(step, c);
  const msgs = useStore(chat, (s) => s.msgs.filter((m) => m.who === "you").length);
  const exI = useStore(explain, (s) => s.i);
  const exPhase = useStore(explain, (s) => s.phase);
  const live = useStore(suggest, (s) => s);
  useEffect(() => {
    if (!busy) refreshSuggestions(step.id);
  }, [step.id, msgs, exI, exPhase, busy]);

  // the latest list for this camp stays up until the next one arrives (no flash of the fixed
  // ones in between); the fixed ones only before the first list for this camp
  const fresh = live.camp === step.id ? live.list : [];
  // never left "hovering" if the chips go away under the pointer
  useEffect(() => () => setHovering(false), []);
  const simpler = chips.find((q) => q.id === SIMPLER);
  type Chip = { key: string; label: string; next: boolean; go: () => void };
  const list: Chip[] = fresh.length
    ? [
        ...fresh.map((q) => ({
          key: `ai:${q}`,
          label: q,
          next: false,
          go: () => {
            if (chat.get().busy) return;
            tones.tap();
            usedSuggestion(q);
            void converse(q, null, step.title);
          },
        })),
        ...(simpler ? [{ key: simpler.id, label: simpler.q, next: false, go: () => ask(simpler) }] : []),
      ]
    : chips.map((q) => ({ key: q.id, label: q.q, next: followUps.includes(q), go: () => ask(q) }));
  if (!list.length) return null;
  return (
    <div className="qa-block" onPointerEnter={() => setHovering(true)} onPointerLeave={() => setHovering(false)}>
      <p className="qa-head">{title ?? (asked.length || msgs ? tr("Keep asking", "Seguir preguntando") : tr("Questions people often have here", "Preguntas que suelen surgir aquí"))}</p>
      <div className="qa-chips">
        <AnimatePresence mode="popLayout">
          {list.map((q, i) => (
            <motion.button
              layout
              key={q.key}
              className={q.next ? "qa-chip is-next" : q.key.startsWith("ai:") ? "qa-chip is-live" : "qa-chip"}
              disabled={busy}
              onClick={q.go}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3, delay: (asked.length || msgs ? 0 : delay) + i * 0.06 }}
            >
              {q.label}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Asked only once Cordi has finished explaining: hidden while it talks, back when it's done. */
export function Gauge({ step, c, delay = 0 }: { step: Step; c: Case; delay?: number }) {
  const { tries, busy, marked, we, rate } = useCamp(step, c);
  const said = useStore(chat, (s) => s.msgs.length);
  if (step.kind === "summit" || busy) return null;
  return (
    <motion.div key={`gauge-${said}`} className="gauge" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}>
      {marked === "yes" ? (
        <p className="gauge-done">
          <span aria-hidden>⛳</span> {tr("Flag planted: you've got it.", `Bandera plantada: ${we ? "lo tenéis claro" : "lo tienes claro"}.`)}
          <button className="gauge-undo" onClick={() => rate("meh")}>
            {tr("I still have questions", "Aún tengo dudas")}
          </button>
        </p>
      ) : (
        <>
          <p className="qa-head">{tries || marked ? tr("Clearer now?", "¿Y ahora, más claro?") : tr("Is this stretch clear?", `¿${we ? "Os" : "Te"} ha quedado claro este tramo?`)}</p>
          <div className="gauge-row" role="group" aria-label={tr("How well you understood it", "Cuánto lo has entendido")}>
            {MARKS.map((m) => (
              <button key={m.id} className={`gauge-btn g-${m.id}`} onClick={() => rate(m.id)}>
                <span aria-hidden>{m.icon}</span> {m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

/** On the camp's detail: the questions to start a conversation, then the check. */
export function Questions({ step, c, delay }: { step: Step; c: Case; delay: number }) {
  return (
    <motion.section className="qa" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }} aria-label="Preguntas sobre este campamento">
      <Suggestions step={step} c={c} delay={delay + 0.1} />
      <Gauge step={step} c={c} delay={delay + 0.4} />
    </motion.section>
  );
}
