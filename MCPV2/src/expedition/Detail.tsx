"use client";
// More about one camp. The panel opens out of the flag itself: a circle grows from the camp on
// the mountain until it becomes the panel, while a hairline keeps the two joined. Inside, one
// choreographed reveal, in reading order: the title rises word by word, the camp's key figure
// counts up, the scene comes into focus, and last, what Sherpas proposes.
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import type { Case, Topic } from "@/data/cases";
import { pillarPoints } from "@/data/cases";
import { byImpact, EFFORT, fixFor, money, moveName, num, short } from "@/lib/copy";
import { openAsk } from "@/stage/Ask";
import { showBubble } from "@/stage/stage";
import { Scene } from "@/dashboard/scenes";
import type { Step } from "./steps";

const tone = (score: number) => (score >= 70 ? "good" : score >= 40 ? "warn" : "bad");
const EASE = [0.76, 0, 0.18, 1] as const;

type Figure = { to: number; fmt: (v: number) => string; caption: string } | { text: string; caption: string };

/** The one number that sums the camp up, counted up as the panel opens. */
function figure(step: Step, c: Case): Figure | null {
  const we = c.household.couple;
  if (step.kind === "base") return { to: c.score.value, fmt: (v) => `${Math.round(v)}`, caption: `de 100 puntos posibles. ${we ? "Vuestra" : "Tu"} nota de salud financiera.` };
  if (step.kind === "summit") {
    const best = byImpact(c.moves)[0];
    return best ? { to: best.after - best.before, fmt: (v) => `+${Math.round(v)}`, caption: `puntos con un solo paso: de ${best.before} a ${best.after}.` } : null;
  }
  const t = step.topic as Topic;
  const n = t.numbers as Record<string, number & string>;
  switch (t.id) {
    case "emergency":
      return { to: +n.months, fmt: (v) => num(v, 1), caption: `meses de gastos cubiertos si dejas de cobrar. Lo recomendado: ${n.min} a ${n.max}.` };
    case "near-goal":
      return { to: +n.after, fmt: (v) => num(v, 1), caption: `meses de colchón te quedarían después de ${String(n.goal ?? "la compra").toLowerCase()}.` };
    case "debt":
      return n.balance ? { to: +n.balance, fmt: (v) => money(v), caption: "en tarjetas, y el pago de cada mes apenas cubre los intereses." } : { to: +n.dti * 100, fmt: (v) => `${Math.round(v)}%`, caption: "del sueldo se va en deudas. Hasta un 36% es sano." };
    case "retirement":
      if (n.runOut !== "Not applicable") return { to: +n.runOut, fmt: (v) => `${Math.round(v)}`, caption: "años: a esa edad se acabarían tus ahorros." };
      if (+n.gap > 0) return { to: +n.gap, fmt: (v) => short(v), caption: `faltan para jubilarte a los ${n.retireAge} como planeas.` };
      return { to: +n.incomeShare, fmt: (v) => `${Math.round(v)}%`, caption: "de tus gastos de jubilado quedarían cubiertos." };
    case "cashflow":
      return { to: Math.abs(+n.flow), fmt: (v) => `${+n.flow < 0 ? "−" : "+"}${short(v)}`, caption: +n.flow < 0 ? "al año salen de más, y se pagan con tus ahorros." : "al año te quedan para repartir entre tus metas." };
    case "education":
      return { to: +n.gap, fmt: (v) => short(v), caption: "faltan para pagar la universidad." };
    case "life": {
      const s = (+n.shortfall || 0) + (+n.coShortfall || 0);
      return s ? { to: s, fmt: (v) => short(v), caption: "de cobertura faltan para proteger a tu familia." } : { text: "Cubierto", caption: "Tu familia está protegida si faltaras." };
    }
    case "umbrella":
      return n.recommended ? { to: +n.recommended, fmt: (v) => short(v), caption: "de cobertura ante demandas, recomendado y sin contratar." } : { to: +n.current, fmt: (v) => short(v), caption: "de cobertura ante demandas. Bien cubierto." };
    case "investments":
      return { to: +n.equity, fmt: (v) => `${Math.round(v)}%`, caption: `en acciones. Lo que encaja ${we ? "con vosotros" : "contigo"}: ${n.target}%.` };
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

export function Detail({
  open,
  step,
  c,
  index,
  total,
  origin,
  onClose,
  onNext,
}: {
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
  const where = index === 0 ? "Campamento base" : index === total - 1 ? "La cima" : `Campamento ${index} de ${total - 2}`;
  const kind = step.status;

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key={step.id}
          className={`detail k-${kind}`}
          initial={narrow ? { y: "100%" } : { x: "100%" }}
          animate={narrow ? { y: 0 } : { x: 0 }}
          exit={narrow ? { y: "100%", transition: { duration: 0.4, ease: [0.7, 0, 0.84, 0] } } : { x: "100%", transition: { duration: 0.4, ease: [0.7, 0, 0.84, 0] } }}
          transition={{ duration: 0.75, ease: EASE }}
          aria-label={step.title}
        >
          <span className="detail-glow" aria-hidden />
          <header className="detail-head">
            <motion.p className="narr-where" {...reveal(0.3)}>
              {where}
            </motion.p>
            <Rise text={step.title} delay={0.36} className="detail-title" />
            <motion.p className={`narr-label t-${kind}`} {...reveal(0.6)}>
              {step.label}
            </motion.p>
            <button className="detail-close" onClick={onClose} aria-label="Cerrar el detalle">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
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

            {step.kind === "base" && (
              <motion.div {...reveal(1.0)}>
                <p className="detail-lede">La nota suma cinco tramos. Cada uno da un máximo de puntos; la barra muestra cuántos {c.household.couple ? "lleváis" : "llevas"}.</p>
                <ul className="stretches">
                  {c.score.pillars.map((p, i) => {
                    const { got, of } = pillarPoints(p);
                    return (
                      <li key={p.name}>
                        <span className="stretch-name">{p.name}</span>
                        <span className="stretch-pts">
                          {got} de {of}
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
            {fix && fix.after > fix.before && (
              <motion.p className="detail-fix" {...reveal(1.35)}>
                Lo que propone Sherpas: {moveName(fix).toLowerCase()}. La nota pasaría de {fix.before} a <b>{fix.after}</b>.
              </motion.p>
            )}

            {step.kind === "summit" && (
              <motion.div {...reveal(1.0)}>
                <p className="detail-lede">Todo lo que propone Sherpas, empezando por lo que más sube {c.household.couple ? "vuestra" : "tu"} nota.</p>
                <ol className="climbs">
                  {byImpact(c.moves).map((m, i) => (
                    <motion.li key={m.title} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 160, damping: 18, delay: 1.15 + i * 0.12 }}>
                      <span className="climb-gain">{m.after > m.before ? `+${m.after - m.before}` : "0"}</span>
                      <span className="climb-name">{moveName(m)}</span>
                      <span className="climb-meta">
                        {EFFORT[m.effort]}. De {m.before} a {m.after}
                        {m.liftsCap ? ", y quita una barrera" : ""}.
                      </span>
                    </motion.li>
                  ))}
                </ol>
              </motion.div>
            )}
          </div>

          <motion.footer className="detail-foot" {...reveal(1.2)}>
            <button
              className="act act-quiet"
              onClick={() => {
                openAsk();
                showBubble("howCanIHelp", 2200);
              }}
            >
              Preguntar a Cordi sobre esto
            </button>
            {onNext && (
              <button className="act act-main" onClick={onNext}>
                Siguiente campamento
              </button>
            )}
          </motion.footer>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
