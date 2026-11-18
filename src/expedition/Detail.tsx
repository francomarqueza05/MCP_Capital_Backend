"use client";
// More about one camp. The panel opens out of the flag itself: a circle grows from the camp on
// the mountain until it becomes the panel, while a hairline keeps the two joined. Inside, one
// choreographed reveal, in reading order: the title rises word by word, the camp's key figure
// counts up, the scene comes into focus, and last, what Sherpas proposes.
// Just the camp: no tabs and no suggested questions. Talking to Cordi happens on the call that
// "Explícame esto" starts, in its own card.
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import type { Case, Topic } from "@/data/cases";
import { pillarPoints } from "@/data/cases";
import { byImpact, EFFORT, fixFor, money, moveName, num, short } from "@/lib/copy";
import { Scene } from "@/dashboard/scenes";
import { useStore } from "@/lib/store";
import { ExplainButton } from "@/explain/ExplainUI";
import { understanding } from "./understanding";
import type { Step } from "./steps";
import { tr } from "@/lib/lang";
import { yearsOfSpending } from "@/lib/talk";
import { Commit } from "@/commit/Commit";
import { CoupleRisk } from "@/commit/Couple";

const tone = (score: number) => (score >= 70 ? "good" : score >= 40 ? "warn" : "bad");
const EASE = [0.76, 0, 0.18, 1] as const;

type Figure = { to: number; fmt: (v: number) => string; caption: string } | { text: string; caption: string };

/** The one number that sums the camp up, counted up as the panel opens. */
function figure(step: Step, c: Case): Figure | null {
  const we = c.household.couple;
  // a big amount, also as years of what the household spends today
  const years = (amount: number) => {
    const y = yearsOfSpending(c, amount);
    return y ? tr(` That's about ${y} years of your household's spending.`, ` Son unos ${String(y).replace(".", ",")} años de lo que se gasta en casa.`) : "";
  };
  if (step.kind === "base") return { to: c.score.value, fmt: (v) => `${Math.round(v)}`, caption: tr("out of 100 possible points. Your financial health score.", `de 100 puntos posibles. ${we ? "Vuestra" : "Tu"} nota de salud financiera.`) };
  if (step.kind === "summit") {
    const best = byImpact(c.moves)[0];
    return best ? { to: best.after - best.before, fmt: (v) => `+${Math.round(v)}`, caption: tr(`points from a single step: from ${best.before} to ${best.after}.`, `puntos con un solo paso: de ${best.before} a ${best.after}.`) } : null;
  }
  const t = step.topic as Topic;
  const n = t.numbers as Record<string, number & string>;
  switch (t.id) {
    case "emergency":
      return { to: +n.months, fmt: (v) => num(v, 1), caption: tr(`months of expenses covered if your income stops. Recommended: ${n.min} to ${n.max}.`, `meses de gastos cubiertos si dejas de cobrar. Lo recomendado: ${n.min} a ${n.max}.`) };
    case "near-goal":
      return { to: +n.after, fmt: (v) => num(v, 1), caption: tr(`months of cushion would be left after ${String(n.goal ?? "the purchase").toLowerCase()}.`, `meses de colchón te quedarían después de ${String(n.goal ?? "la compra").toLowerCase()}.`) };
    case "debt":
      return n.balance ? { to: +n.balance, fmt: (v) => money(v), caption: tr("on cards, and each month's payment barely covers the interest.", "en tarjetas, y el pago de cada mes apenas cubre los intereses.") } : { to: +n.dti * 100, fmt: (v) => `${Math.round(v)}%`, caption: tr("of income goes to debt. Up to 36% is healthy.", "del sueldo se va en deudas. Hasta un 36% es sano.") };
    case "retirement":
      if (n.runOut !== "Not applicable") return { to: +n.runOut, fmt: (v) => `${Math.round(v)}`, caption: tr("years old: at that age your savings would run out.", "años: a esa edad se acabarían tus ahorros.") };
      if (+n.gap > 0) return { to: +n.gap, fmt: (v) => short(v), caption: tr(`short of retiring at ${n.retireAge} as you plan.`, `faltan para jubilarte a los ${n.retireAge} como planeas.`) + years(+n.gap) };
      return { to: +n.incomeShare, fmt: (v) => `${Math.round(v)}%`, caption: tr("of your retirement expenses would be covered.", "de tus gastos de jubilado quedarían cubiertos.") };
    case "cashflow":
      return { to: Math.abs(+n.flow), fmt: (v) => `${+n.flow < 0 ? "−" : "+"}${short(v)}`, caption: +n.flow < 0 ? tr("a year too much goes out, paid from your savings.", "al año salen de más, y se pagan con tus ahorros.") : tr("a year left to share between your goals.", "al año te quedan para repartir entre tus metas.") };
    case "education":
      return { to: +n.gap, fmt: (v) => short(v), caption: tr("short of paying for college.", "faltan para pagar la universidad.") };
    case "life": {
      const s = (+n.shortfall || 0) + (+n.coShortfall || 0);
      return s ? { to: s, fmt: (v) => short(v), caption: tr("of cover missing to protect your family.", "de cobertura faltan para proteger a tu familia.") + years(s) } : { text: tr("Covered", "Cubierto"), caption: tr("Your family is protected if you were gone.", "Tu familia está protegida si faltaras.") };
    }
    case "umbrella":
      return n.recommended ? { to: +n.recommended, fmt: (v) => short(v), caption: tr("of umbrella cover, recommended and not taken out.", "de cobertura ante demandas, recomendado y sin contratar.") } : { to: +n.current, fmt: (v) => short(v), caption: tr("of umbrella cover. Well covered.", "de cobertura ante demandas. Bien cubierto.") };
    case "investments":
      return { to: +n.equity, fmt: (v) => `${Math.round(v)}%`, caption: tr(`in stocks. What fits you: ${n.target}%.`, `en acciones. Lo que encaja ${we ? "con vosotros" : "contigo"}: ${n.target}%.`) };
  }
  return null;
}

/** Mounts the scene when it comes into focus, so its own build plays where it can be seen. */
function Later({ ms, children }: { ms: number; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return on ? <>{children}</> : <div className="scene-wait" />;
}

function Count({ f, delay }: { f: Figure; delay: number }) {
  const v = useMotionValue(0);
  const txt = useTransform(v, (x) => ("to" in f ? f.fmt(x) : f.text));
  useEffect(() => {
    if (!("to" in f)) return;
    const ctl = animate(v, f.to, { duration: 1.6, delay, ease: [0.16, 1, 0.3, 1] });
    return () => ctl.stop();
  }, [f, v, delay]);
  return <motion.span>{txt}</motion.span>;
}

/** Each word rises out of its own slot, one after another. */
function Rise({ text, delay, className }: { text: string; delay: number; className: string }) {
  return (
    <h2 className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i}>
          <span className="rise-slot" aria-hidden>
            <motion.span className="rise-word" initial={{ y: "110%", rotate: 4 }} animate={{ y: "0%", rotate: 0 }} transition={{ duration: 0.85, delay: delay + i * 0.07, ease: EASE }}>
              {w}
            </motion.span>
          </span>{" "}
        </span>
      ))}
    </h2>
  );
}

const reveal = (delay: number) => ({
  initial: { opacity: 0, y: 26, filter: "blur(10px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] as const },
});

/** At the summit: the camps not yet clear, each one a tap away. */
function Review({ steps, onGo, couple }: { steps: Step[]; onGo: (i: number) => void; couple: boolean }) {
  const marks = useStore(understanding, (s) => s.marks);
  const pending = steps.map((s, i) => ({ s, i, m: marks[s.id] })).filter(({ s, m }) => s.kind !== "summit" && m !== "yes");
  return (
    <motion.div className="review" {...reveal(1.3)}>
      <p className="qa-head">{pending.length ? tr("Worth going over again", "Para repasar antes de seguir") : tr("The whole route", "Todo el recorrido")}</p>
      {pending.length ? (
        <ul>
          {pending.map(({ s, i, m }) => (
            <li key={s.id}>
              <button className="review-item" onClick={() => onGo(i)}>
                <span>{s.title}</span>
                <small>{m === "no" ? tr("Wasn't clear", "No quedó claro") : m === "meh" ? tr("Sort of", "Más o menos") : tr("Not confirmed", "Sin confirmar")} · {tr("Go over", "Repasar")}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="review-ok">{tr("Every flag is planted: every stretch was clear.", `${couple ? "Habéis" : "Has"} plantado todas las banderas: cada tramo quedó claro.`)}</p>
      )}
    </motion.div>
  );
}

export function Detail({
  open,
  step,
  c,
  index,
  total,
  origin,
  onClose,
  onNext,
  steps,
  onGo,
}: {
  steps?: Step[];
  onGo?: (i: number) => void;
  open: boolean;
  step: Step;
  c: Case;
  index: number;
  total: number;
  origin: readonly [number, number] | null;
  onClose: () => void;
  onNext?: () => void;
}) {
  const fix = step.topic ? fixFor(c, step.topic) : null;
  const f = figure(step, c);
  const narrow = typeof window !== "undefined" && innerWidth < 760;
  void origin;
  const where = index === 0 ? tr("Base camp", "Campamento base") : index === total - 1 ? tr("The summit", "La cima") : tr(`Camp ${index} of ${total - 2}`, `Campamento ${index} de ${total - 2}`);
  const kind = step.status;

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="panel"
          className={`detail k-${kind}`}
          initial={narrow ? { y: "100%" } : { x: "100%" }}
          animate={narrow ? { y: 0 } : { x: 0 }}
          exit={narrow ? { y: "100%", transition: { duration: 0.4, ease: [0.7, 0, 0.84, 0] } } : { x: "100%", transition: { duration: 0.4, ease: [0.7, 0, 0.84, 0] } }}
          transition={{ duration: 0.75, ease: EASE }}
          aria-label={step.title}
        >
          <span className="detail-glow" aria-hidden />
          <button className="detail-close solo" onClick={onClose} aria-label={tr("Close the panel", "Cerrar el panel")}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div className="pane" key={step.id}>
          <header className="detail-head">
            <motion.p className="narr-where" {...reveal(0.3)}>
              {where}
            </motion.p>
            <Rise text={step.title} delay={0.36} className="detail-title" />
            <motion.p className={`narr-label t-${kind}`} {...reveal(0.6)}>
              {step.label}
            </motion.p>
            <motion.div className="detail-explain" {...reveal(0.8)}>
              <ExplainButton step={step} c={c} />
            </motion.div>
          </header>

          <div className="detail-body">
            {f && (
              <motion.div className="figure" {...reveal(0.7)}>
                <span className={`figure-num t-${kind}`}>
                  <Count f={f} delay={0.75} />
                </span>
                <span className="figure-cap">{f.caption}</span>
                <motion.span className={`figure-rule t-${kind}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.2, delay: 0.85, ease: EASE }} />
              </motion.div>
            )}

            {step.kind === "summit" && <Commit c={c} />}

            {step.kind === "base" && (
              <motion.div {...reveal(1.0)}>
                <p className="detail-lede">{tr("The score adds up five parts. Each gives up to a set number of points; the bar shows how many you have.", `La nota suma cinco tramos. Cada uno da un máximo de puntos; la barra muestra cuántos ${c.household.couple ? "lleváis" : "llevas"}.`)}</p>
                <ul className="stretches">
                  {c.score.pillars.map((p, i) => {
                    const { got, of } = pillarPoints(p);
                    return (
                      <li key={p.name}>
                        <span className="stretch-name">{p.name}</span>
                        <span className="stretch-pts">
                          {got} {tr("of", "de")} {of}
                        </span>
                        <span className="stretch-bar">
                          <motion.span className={`t-${tone(p.score)}`} initial={{ scaleX: 0 }} animate={{ scaleX: of ? got / of : 0 }} transition={{ type: "spring", stiffness: 90, damping: 14, delay: 1.15 + i * 0.09 }} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            )}

            {step.topic && (
              <motion.div className="detail-scene" {...reveal(1.0)}>
                <Later ms={950}>
                  <Scene t={step.topic} c={c} />
                </Later>
              </motion.div>
            )}
            {step.topic?.id === "investments" && <CoupleRisk c={c} t={step.topic} />}
            {fix && fix.after > fix.before && (
              <motion.p className="detail-fix" {...reveal(1.35)}>
                {tr("What Sherpas suggests", "Lo que propone Sherpas")}: {moveName(fix).toLowerCase()}. {tr("Your score would go from", "La nota pasaría de")} {fix.before} {tr("to", "a")} <b>{fix.after}</b>.
              </motion.p>
            )}

            {step.kind === "summit" && (
              <motion.div {...reveal(1.0)}>
                <p className="detail-lede">{tr("Everything Sherpas suggests, starting with what lifts your score most.", `Todo lo que propone Sherpas, empezando por lo que más sube ${c.household.couple ? "vuestra" : "tu"} nota.`)}</p>
                <ol className="climbs">
                  {byImpact(c.moves).map((m, i) => (
                    <motion.li key={m.title} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 160, damping: 18, delay: 1.15 + i * 0.12 }}>
                      <span className="climb-gain">{m.after > m.before ? `+${m.after - m.before}` : "0"}</span>
                      <span className="climb-name">{moveName(m)}</span>
                      <span className="climb-meta">
                        {EFFORT[m.effort]}. {tr("From", "De")} {m.before} {tr("to", "a")} {m.after}
                        {m.liftsCap ? tr(", and removes a barrier", ", y quita una barrera") : ""}.
                      </span>
                    </motion.li>
                  ))}
                </ol>
              </motion.div>
            )}

            {step.kind === "summit" && steps && onGo && <Review steps={steps} onGo={onGo} couple={c.household.couple} />}
          </div>

          {onNext && (
            <motion.footer className="detail-foot" {...reveal(1.2)}>
              <button className="act act-main" onClick={onNext}>
                {tr("Next camp", "Siguiente campamento")}
              </button>
            </motion.footer>
          )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
