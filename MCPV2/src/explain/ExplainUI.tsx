"use client";
// The faces of "Explícame esto": the button and its "by chat or by call?" choice, the player
// bar in the chat, and the stage over the mountain where a call's visuals play large.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { goExplain } from "@/ai/client";
import { openChat } from "@/stage/chat";
import { understanding } from "@/expedition/understanding";
import { buildSteps } from "@/expedition/steps";
import { Conversation } from "@/expedition/Conversation";
import { orbSpot } from "@/stage/stage";
import { dismiss, notify, remark, setRemarkContext } from "./remarks";
import type { Case } from "@/data/cases";
import type { Step } from "@/expedition/steps";
import { mark } from "@/expedition/understanding";
import { useStore } from "@/lib/store";
import { orb } from "@/orb/engine";
import { tones } from "@/lib/audio";
import { cancelExplain, endExplain, explain, known, progress, switchHow, goTo, hold, inTheater, next, proceed, notClear, offerExplain, prev, repeat, replay, startExplain, togglePause } from "./player";
import { Visual } from "./Visual";
import { beatsFor } from "./beats";

/** "Explícame esto", and once tapped, how: chat or call. Picks up where it was left. */
export function ExplainButton({ step, c, className = "act act-main" }: { step: Step; c: Case; className?: string }) {
  const { phase, stepId, from, beats } = useStore(explain, (s) => s);
  const saved = useStore(progress, (p) => p.at[step.id] ?? 0);
  const choosing = phase === "choose" && stepId === step.id;
  const busy = phase === "playing";
  if (choosing)
    return (
      <div className="explain-choose" role="group" aria-label="¿Cómo te lo explico?">
        <span className="explain-ask">
          {from ? `Seguimos en el paso ${from + 1} de ${beats.length}. ¿Cómo te lo explico?` : "¿Cómo te lo explico?"}
        </span>
        <button className="act act-main" onClick={() => startExplain("chat")}>
          <IconChat /> Por chat
        </button>
        <button className="act act-main" onClick={() => startExplain("call")}>
          <IconPhone /> Por llamada
        </button>
        {from > 0 && (
          <button className="act act-quiet" onClick={() => explain.set({ from: 0 })}>
            Empezar desde el principio
          </button>
        )}
        <button className="act act-quiet" onClick={cancelExplain}>
          Cancelar
        </button>
      </div>
    );
  return (
    <button className={className} onClick={() => offerExplain(step, c)} disabled={busy}>
      <IconPlay /> {saved > 0 ? `Continuar explicación (${saved + 1}/${beatsFor(step, c).length})` : "Explícame esto"}
    </button>
  );
}

function Controls({ compact = false, goOn = false }: { compact?: boolean; goOn?: boolean }) {
  const { phase, i, beats, paused, waiting } = useStore(explain, (s) => s);
  const done = phase === "done";
  const last = i >= beats.length - 1;
  return (
    <div className={compact ? "xp-controls compact" : "xp-controls"}>
      {!done ? (
        <>
          <button className="xp-icon" onClick={prev} disabled={i === 0} title="Paso anterior" aria-label="Paso anterior">
            <IconPrev />
          </button>
          <button className="xp-icon main" onClick={togglePause} title={paused ? "Seguir" : "Pausar"} aria-label={paused ? "Seguir" : "Pausar"}>
            {paused ? <IconPlay /> : <IconPause />}
          </button>
          <button className="xp-icon" onClick={next} disabled={i >= beats.length - 1} title="Paso siguiente" aria-label="Paso siguiente">
            <IconNext />
          </button>
          <button className="xp-icon" onClick={repeat} title="Repetir este paso" aria-label="Repetir este paso">
            <IconRepeat />
          </button>
          <button className="xp-text" onClick={notClear}>
            No lo entiendo
          </button>
        </>
      ) : (
        <span className="xp-done">Explicación terminada</span>
      )}
      <button className="xp-text quiet" onClick={endExplain}>
        {done ? "Cerrar" : "Salir"}
      </button>
      {/* "¿Seguimos?" lives here, always in the same place: dim while Cordi talks, lit and
          gently pulsing when it waits for the person to move on */}
      {goOn && !done && (
        <button
          className={waiting ? "act act-main xp-go ready" : "act act-main xp-go"}
          onClick={proceed}
          disabled={!waiting}
          title={waiting ? "Pasar al siguiente paso (tómate tu tiempo: toca el gráfico para explorarlo)" : "Cordi está explicando"}
        >
          {last ? "Listo" : "Seguimos"} <IconPlay />
        </button>
      )}
    </div>
  );
}

/**
 * The flag is planted: what that means for the climb, and the next camp one tap away (its
 * explanation starts on arrival, in the same mode). Or back to the map, or a question.
 */
function NextUp({ c, stepId, how }: { c: Case; stepId: string; how: "chat" | "call" }) {
  const steps = useMemo(() => buildSteps(c), [c]);
  const marks = useStore(understanding, (s) => s.marks);
  const done = useStore(known, (k) => k.done);
  const clear = (id: string) => marks[id] === "yes" || (done[id] && marks[id] !== "meh" && marks[id] !== "no");
  const planted = steps.filter((s) => s.kind !== "summit" && clear(s.id)).length;
  const flags = steps.filter((s) => s.kind !== "summit").length;
  const here = steps.findIndex((s) => s.id === stepId);
  const ahead = [...steps.slice(here + 1), ...steps.slice(0, here)].find((s) => !clear(s.id) && s.id !== stepId);
  const title = steps[here]?.title ?? "";
  const we = c.household.couple;
  return (
    <motion.div className="nextup" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 140, damping: 20 }}>
      <motion.span className="nextup-flag" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }} aria-hidden>
        ⛳
      </motion.span>
      <p className="nextup-title">Bandera plantada: {title}</p>
      <div className="nextup-progress" aria-label={`${planted} de ${flags} banderas`}>
        {steps
          .filter((s) => s.kind !== "summit")
          .map((s) => (
            <span key={s.id} className={clear(s.id) ? "on" : s.id === ahead?.id ? "next" : ""} title={s.title} />
          ))}
        <small>
          {planted} de {flags} banderas
        </small>
      </div>
      {ahead ? (
        <button
          className="act act-main act-large nextup-go"
          onClick={() => {
            tones.tap();
            endExplain();
            goExplain(ahead.id, how);
          }}
          autoFocus
        >
          Siguiente: {ahead.title} <IconPlay />
        </button>
      ) : (
        <p className="nextup-all">{we ? "¡Habéis" : "¡Has"} plantado todas las banderas! La cima os espera con el resumen y el primer paso.</p>
      )}
      <div className="nextup-more">
        <button className="act act-quiet" onClick={() => endExplain()}>
          Volver al mapa
        </button>
        <button
          className="act act-quiet"
          onClick={() => {
            endExplain();
            openChat();
          }}
        >
          Tengo una pregunta
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Keeps a visual whole inside the stage: when it's taller (or wider) than the room there is,
 * it's scaled down just enough to fit, never up, and never scrolled. Re-measured whenever the
 * room or the visual change size (a window resize, the "¿Seguimos?" bar appearing, a bar
 * growing).
 */
function Fit({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ k: 1, h: 0 });
  useEffect(() => {
    const b = box.current;
    const n = inner.current;
    if (!b || !n) return;
    // the room is the stage's body, not the visual's own wrapper (which grows with it)
    const room = (b.closest(".theater-body") as HTMLElement | null) ?? b.parentElement ?? b;
    const measure = () => {
      const availH = room.clientHeight;
      const availW = b.clientWidth;
      const needH = n.scrollHeight;
      const needW = n.scrollWidth;
      if (!availH || !needH) return;
      const k = Math.max(0.55, Math.min(1, availH / needH, availW / Math.max(needW, 1)));
      setFit((prev) => (Math.abs(prev.k - k) > 0.01 || Math.abs(prev.h - needH) > 2 ? { k, h: needH } : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(room);
    ro.observe(n);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="fit" style={{ height: fit.k < 1 ? `${fit.h * fit.k}px` : undefined }}>
      <div ref={inner} className="fit-inner" style={{ transform: fit.k < 1 ? `scale(${fit.k})` : undefined }}>
        {children}
      </div>
    </div>
  );
}

/** The steps as chapters: where you are, and any step a tap away. */
function Dots() {
  const { i, beats, phase } = useStore(explain, (s) => s);
  return (
    <div className="xp-dots" role="group" aria-label={`Paso ${Math.min(i + 1, beats.length)} de ${beats.length}`}>
      {beats.map((b, k) => (
        <button
          type="button"
          key={b.id + k}
          className={k < i || phase === "done" ? "on" : k === i ? "now" : ""}
          onClick={() => goTo(k)}
          aria-label={`Ir al paso ${k + 1}`}
          aria-current={k === i ? "step" : undefined}
        />
      ))}
    </div>
  );
}

/** In the chat, while an explanation plays there. */
export function ChatPlayer() {
  const { phase, how, title, i, beats, paused } = useStore(explain, (s) => s);
  if (how !== "chat" || (phase !== "playing" && phase !== "done")) return null;
  return (
    <div className="xp-bar">
      <div className="xp-bar-top">
        <span className="xp-bar-title">
          {phase === "done" ? "Explicado" : paused ? "En pausa" : "Explicando"}: {title}
        </span>
        <span className="xp-bar-n">
          {Math.min(i + 1, beats.length)} / {beats.length}
        </span>
      </div>
      <Dots />
      <Controls compact />
    </div>
  );
}

/**
 * On a call: a theater over the mountain. Cordi has its own column on the left (it flies there
 * and talks, captions in its bubble); the step plays large on the right, building as Cordi
 * speaks and answering touch. The side panel steps aside while it's on, and comes back after.
 */
export function ExplainStage({ c }: { c: Case }) {
  const { phase, how, title, i, beats, stepId, saying, paused, waiting, until } = useStore(explain, (s) => s);
  const on = how !== null && (phase === "playing" || phase === "done");
  const step = useMemo(() => buildSteps(c).find((s) => s.id === stepId) ?? null, [c, stepId]);
  const b = beats[Math.min(i, beats.length - 1)];
  const seat = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const [planted, setPlanted] = useState(false);
  useEffect(() => {
    if (phase !== "done") setPlanted(false);
  }, [phase, stepId]);
  const last = useRef(i);
  const dir = i >= last.current ? 1 : -1;
  useEffect(() => {
    last.current = i;
  }, [i]);

  // Cordi flies with the explanation, never over what you touch:
  //  - while it talks, it rides the stage's edge to the height of the part it's on, as if
  //    pointing at it from outside the card;
  //  - at rest it drifts in its column; while you explore, it pulls back, smaller, and watches;
  //  - a pointer coming close makes it step aside.
  // Its bubble always stays left of the stage.
  useEffect(() => {
    if (!on) {
      orbSpot.set({ at: null });
      return;
    }
    let raf = 0;
    const ptr = { x: -1e4, y: -1e4 };
    // what the pointer is on inside the stage: Cordi goes to look at it with you
    let looking: HTMLElement | null = null;
    let lookedAt = -1e9;
    let nextHop = performance.now() + 5000;
    const onMove = (e: PointerEvent) => {
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      const body = stage.current?.querySelector(".theater-body");
      const el = body?.contains(e.target as Node) ? ((e.target as Element).closest('[data-cordi], button, [role="slider"]') as HTMLElement | null) : null;
      if (el && body?.contains(el)) {
        if (el !== looking) {
          orb.flashEmo("curious", 900);
          orb.hop(0.25);
        }
        looking = el;
        lookedAt = performance.now();
      }
    };
    addEventListener("pointermove", onMove);
    addEventListener("pointerdown", onMove);
    let last = { x: 0, y: 0, s: 0 };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const r = seat.current?.getBoundingClientRect();
      const st = stage.current?.getBoundingClientRect();
      if (!r || !st) return;
      const now = performance.now();
      const T = now / 1000;
      const ex = explain.get();
      const narrow = innerWidth < 760;
      const edge = st.left - 62; // just outside the card's left edge
      const at = (el: HTMLElement) => {
        const pr = el.getBoundingClientRect();
        return Math.min(st.bottom - 60, Math.max(st.top + 60, pr.top + pr.height / 2));
      };
      let x: number;
      let y: number;
      let scale: number;
      if (narrow) {
        x = r.left + 64 + Math.sin(T * 0.7) * 14;
        y = r.top + r.height * 0.62 + Math.sin(T * 1.1) * 8;
        scale = 0.62;
      } else {
        const home = { x: r.left + r.width / 2, y: r.top + Math.min(r.height * 0.42, 260) };
        const parts = stage.current?.querySelectorAll<HTMLElement>('.theater-body [data-cordi="on"]');
        const part = parts && parts.length ? parts[parts.length - 1] : null;
        if (looking && now - lookedAt < 1800 && looking.isConnected) {
          // with you, beside what you're looking at (never on it)
          x = Math.max(r.left + 40, edge) + Math.sin(T * 2.2) * 6;
          y = at(looking) + Math.sin(T * 1.7) * 5;
          scale = 0.82;
        } else if (ex.saying && part) {
          // beside the card, at the height of what it's talking about
          x = Math.max(r.left + 40, edge) + Math.sin(T * 1.6) * 8;
          y = at(part) + Math.sin(T * 2.1) * 6;
          scale = 0.88;
        } else {
          // free in its column: a lazy figure-eight, and now and then a little hop
          x = home.x + Math.sin(T * 0.6) * 44 + Math.sin(T * 1.7) * 10;
          y = home.y + Math.sin(T * 1.2) * 34 + Math.cos(T * 0.5) * 14;
          scale = 1.02 + Math.sin(T * 0.9) * 0.04;
          if (now > nextHop) {
            nextHop = now + 5000 + Math.random() * 5000;
            if (Math.random() < 0.5) orb.hop(0.6);
            else orb.flashEmo(Math.random() < 0.5 ? "curious" : "happy", 1100);
          }
        }
      }
      // a question up: Cordi holds still, so its card can be answered
      if (remark.get().now) return;
      // a pointer coming close: step aside, away from it
      const dx = orb.x - ptr.x;
      const dy = orb.y - ptr.y;
      const d = Math.hypot(dx, dy);
      if (d < 100) {
        const push = (100 - d) * 1.5;
        y += (dy >= 0 ? 1 : -1) * push;
        x += (dx >= 0 ? 1 : -1) * push * 0.4;
      }
      x = Math.min(x, st.left - 40);
      y = Math.max(70, Math.min(innerHeight - 120, y));
      if (Math.abs(x - last.x) + Math.abs(y - last.y) + Math.abs(scale - last.s) < 0.5) return;
      last = { x, y, s: scale };
      orbSpot.set({ at: { x, y, maxRight: narrow ? innerWidth - 12 : st.left - 16, scale } });
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onMove);
      orbSpot.set({ at: null });
    };
  }, [on]);

  // what Cordi may say on its own knows where we are, and keeps quiet while it's talking
  const beat = beats[Math.min(i, beats.length - 1)] ?? null;
  useEffect(() => {
    setRemarkContext({ camp: title, beat, quiet: () => !inTheater() || explain.get().saying });
  }, [title, beat]);

  // left a while on "¿Seguimos?" without doing anything: Cordi asks if an example would help
  useEffect(() => {
    if (!waiting) return;
    let moved = performance.now();
    const onAny = () => (moved = performance.now());
    addEventListener("pointermove", onAny);
    const id = setInterval(async () => {
      if (performance.now() - moved < 6000) return;
      clearInterval(id);
      const pickd = await notify({ type: "idle", seconds: 6 });
      if (pickd === "simpler") notClear();
      else if (pickd === "on") proceed();
      else if (pickd === "stay") hold();
    }, 500);
    return () => {
      clearInterval(id);
      removeEventListener("pointermove", onAny);
      dismiss();
    };
  }, [waiting, i]);

  // keys while it plays: arrows move between steps, Space pauses
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => {
      if ((e.target as Element).closest("input, [role=slider]")) return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") togglePause();
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [on]);

  return (
    <AnimatePresence>
      {on && b && (
        <motion.div key="theater" className={`theater how-${how}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }} transition={{ duration: 0.45 }}>
          <div className="theater-seat" ref={seat} aria-hidden>
            <motion.span className="theater-halo" animate={{ scale: saying ? [1, 1.08, 1] : 1, opacity: saying ? 0.9 : 0.5 }} transition={{ duration: 1.6, repeat: saying ? Infinity : 0 }} />
            <span className="theater-state">{phase === "done" ? "¿Todo claro?" : paused ? "En pausa" : saying ? "Cordi explica" : "…"}</span>
          </div>

          <motion.section
            ref={stage}
            className="theater-stage"
            aria-label={`Explicación: ${title}`}
            initial={{ opacity: 0, x: 40, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          >
            <header className="theater-head">
              <div>
                <span className="xp-stage-kicker">Cordi te explica</span>
                <h2>{title}</h2>
              </div>
              <div className="theater-how" role="group" aria-label="Cómo te lo explica Cordi">
                <button type="button" className={how === "chat" ? "on" : ""} onClick={() => switchHow("chat")} aria-pressed={how === "chat"}>
                  <IconChat /> Chat
                </button>
                <button type="button" className={how === "call" ? "on" : ""} onClick={() => switchHow("call")} aria-pressed={how === "call"}>
                  <IconPhone /> Llamada
                </button>
              </div>
              <span className="theater-n">
                {phase === "done" ? beats.length : Math.min(i + 1, beats.length)} / {beats.length}
              </span>
            </header>
            <Dots />

            <div className="theater-body" onPointerDown={hold} onKeyDown={hold}>
              <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                {phase === "done" && planted ? (
                  <NextUp key="next" c={c} stepId={stepId} how={how ?? "chat"} />
                ) : phase === "done" ? (
                  <motion.div key="check" className="xp-check" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 140, damping: 20 }}>
                    <p>¿Te ha quedado claro este tramo?</p>
                    <div className="gauge-row">
                      {(
                        [
                          ["yes", "🙂 Lo entendí"],
                          ["meh", "🤔 Más o menos"],
                          ["no", "😕 No del todo"],
                        ] as const
                      ).map(([m, label]) => (
                        <button
                          key={m}
                          className={`gauge-btn g-${m}`}
                          onClick={() => {
                            mark(stepId, m);
                            tones.tap();
                            if (m === "yes") {
                              orb.flashEmo("happy", 1600);
                              orb.spinOnce();
                              tones.form();
                              setPlanted(true);
                            } else replay();
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={b.id + i}
                    className="theater-visual"
                    custom={dir}
                    variants={{
                      enter: (d: number) => ({ opacity: 0, x: 60 * d, filter: "blur(6px)" }),
                      center: { opacity: 1, x: 0, filter: "blur(0px)" },
                      exit: (d: number) => ({ opacity: 0, x: -60 * d, filter: "blur(6px)" }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: "spring", stiffness: 160, damping: 24 }}
                  >
                    <Fit>
                      <Visual v={b.visual} c={c} live={saying} />
                    </Fit>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <footer className="theater-foot">
              <Controls goOn />
            </footer>
          </motion.section>

          {how === "chat" && step && (
            <motion.aside className="theater-chat" aria-label="Conversación con Cordi" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 }}>
              <header className="chat-head">
                <span className="chat-avatar" aria-hidden />
                <div>
                  <p className="chat-name">Cordi</p>
                  <p className="chat-where">{waiting ? "Te espero: pregúntame lo que quieras" : saying ? "Escribiendo…" : title}</p>
                </div>
              </header>
              <Conversation step={step} c={c} compact />
            </motion.aside>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const svg = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const IconPlay = () => (
  <svg {...svg}>
    <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
  </svg>
);
const IconPause = () => (
  <svg {...svg}>
    <path d="M8 5v14M16 5v14" />
  </svg>
);
const IconPrev = () => (
  <svg {...svg}>
    <path d="M6 5v14M18 6l-9 6 9 6z" />
  </svg>
);
const IconNext = () => (
  <svg {...svg}>
    <path d="M18 5v14M6 6l9 6-9 6z" />
  </svg>
);
const IconRepeat = () => (
  <svg {...svg}>
    <path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4" />
  </svg>
);
const IconChat = () => (
  <svg {...svg}>
    <path d="M4 5h16v11H9l-5 4z" />
  </svg>
);
const IconPhone = () => (
  <svg {...svg}>
    <path d="M5 4h3l1.5 4-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2L18 14v3a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
);
