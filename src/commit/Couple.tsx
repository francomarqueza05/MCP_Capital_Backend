"use client";
// One plan, two people: in a couple, each partner says how much ups and downs they're
// comfortable with, on the same line where the plan's own mix sits. Cordi says where they
// agree and where they don't, and turns a gap into one question for the advisor, so a
// disagreement becomes a conversation instead of a stall. Only the plan's figure is a number;
// what each partner picks is their own feeling, never turned into a percentage.
import { motion } from "motion/react";
import type { Case, Topic } from "@/data/cases";
import { tr } from "@/lib/lang";
import { createStore, useStore } from "@/lib/store";
import { tones } from "@/lib/audio";
import { orb } from "@/orb/engine";

type Level = 0 | 1 | 2;
const LEVELS = () => [tr("Calm", "Tranquilo"), tr("In between", "Intermedio"), tr("Bold", "Atrevido")];

/** What each partner picked, per household (kept for the visit). */
export const comfort = createStore({ picks: {} as Record<string, Level> });

export function CoupleRisk({ c, t }: { c: Case; t: Topic }) {
  const picks = useStore(comfort, (s) => s.picks);
  const people = c.household.names.slice(0, 2);
  if (!c.household.couple || people.length < 2) return null;
  const n = t.numbers as Record<string, number>;
  // the plan's mix on the same 0–2 line: under 40% calm, over 65% bold (where it sits, roughly)
  const planAt = +n.target < 40 ? 0 : +n.target > 65 ? 2 : 1;
  const [a, b] = people.map((p) => picks[p]);
  const both = a !== undefined && b !== undefined;
  const pick = (p: string, l: Level) => {
    tones.tap();
    comfort.set((s) => ({ picks: { ...s.picks, [p]: l } }));
    orb.flashEmo("curious", 900);
  };
  const verdict = !both
    ? null
    : a === b
      ? a === planAt
        ? tr("You agree, and so does the plan. That's a solid base for the decision.", "Estáis de acuerdo, y el plan también. Es una buena base para decidir.")
        : tr("You agree with each other, but not quite with the plan's mix. Worth one question to your advisor: should the mix follow how you feel?", "Estáis de acuerdo entre vosotros, pero no del todo con la mezcla del plan. Merece una pregunta al asesor: ¿la mezcla debería seguir lo que sentís?")
      : Math.abs(a - b) === 2
        ? tr(
            `You're far apart: ${people[0]} is ${LEVELS()[a].toLowerCase()}, ${people[1]} is ${LEVELS()[b].toLowerCase()}. That's normal. Take it to your advisor as one question: a mix you can both sleep with.`,
            `Estáis lejos: ${people[0]} es ${LEVELS()[a].toLowerCase()}, ${people[1]} es ${LEVELS()[b].toLowerCase()}. Es normal. Llevadlo al asesor como una sola pregunta: una mezcla con la que dormáis los dos.`,
          )
        : tr("You're close, one step apart. The plan's mix can be your meeting point.", "Estáis cerca, a un paso. La mezcla del plan puede ser vuestro punto de encuentro.");

  return (
    <motion.div className="couple" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, duration: 0.5 }}>
      <p className="commit-kicker">{tr("One plan, two people", "Un plan, dos personas")}</p>
      <p className="couple-q">{tr("How much ups and downs are you each comfortable with?", "¿Cuánto vaivén aguanta cada uno?")}</p>
      {people.map((p) => (
        <div key={p} className="couple-row">
          <span className="couple-name">{p}</span>
          <div className="couple-levels" role="radiogroup" aria-label={p}>
            {LEVELS().map((l, i) => (
              <button key={l} role="radio" aria-checked={picks[p] === i} className={picks[p] === i ? "qa-chip on" : "qa-chip"} onClick={() => pick(p, i as Level)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="couple-line" aria-hidden>
        <span className="couple-plan" style={{ left: `${planAt * 50}%` }}>
          {tr("Plan", "Plan")} {n.target}%
        </span>
        {people.map((p, k) =>
          picks[p] !== undefined ? (
            <motion.span key={p} className={`couple-dot d${k}`} layout style={{ left: `${picks[p]! * 50}%` }}>
              {p[0]}
            </motion.span>
          ) : null,
        )}
      </div>
      {verdict && (
        <motion.p className="couple-verdict" key={`${a}-${b}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {verdict}
        </motion.p>
      )}
    </motion.div>
  );
}
