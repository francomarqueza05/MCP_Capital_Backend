"use client";
// The faces of "Explícame esto": the button (it starts right away, never asks how), the player
// bar, and the stage over the mountain where the visuals play large. A switch in the stage's
// head swaps call and chat at any moment: on a call, the call's controls and a box to write sit
// in the same card; in the chat, the whole conversation sits beside it, to read again.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { chat } from "@/stage/chat";
import { call, toggleMute, toggleQuiet, typeInCall } from "@/stage/call";
import { understanding } from "@/expedition/understanding";
import { buildSteps } from "@/expedition/steps";
import { Conversation } from "@/expedition/Conversation";
import { orbSpot } from "@/stage/stage";
import { remark, setRemarkContext } from "./remarks";
import type { Case } from "@/data/cases";
import type { Step } from "@/expedition/steps";
import { mark } from "@/expedition/understanding";
import { useStore } from "@/lib/store";
import { orb } from "@/orb/engine";
import { tones } from "@/lib/audio";
import { endExplain, explain, goNextCamp, nextCampAfter, known, progress, goTo, hold, inTheater, next, proceed, notClear, offerExplain, prev, repeat, switchHow, togglePause } from "./player";
import { Visual } from "./Visual";
import { beatsFor } from "./beats";

/** "Explícame esto": Cordi starts explaining on a call, right away. Picks up where it was left. */
export function ExplainButton({ step, c, className = "act act-main" }: { step: Step; c: Case; className?: string }) {
  const phase = useStore(explain, (s) => s.phase);
  const saved = useStore(progress, (p) => p.at[step.id] ?? 0);
  const busy = phase === "playing" || phase === "choose";
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
          className={`act act-main xp-go${waiting ? " ready" : ""}`}
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

function NextUp({ c, stepId }: { c: Case; stepId: string }) {
  const steps = useMemo(() => buildSteps(c), [c]);
  const marks = useStore(understanding, (s) => s.marks);
  const done = useStore(known, (k) => k.done);
  const clear = (id: string) => marks[id] === "yes" || (done[id] && marks[id] !== "meh" && marks[id] !== "no");
  const planted = steps.filter((s) => s.kind !== "summit" && clear(s.id)).length;
  const flags = steps.filter((s) => s.kind !== "summit").length;
  const here = steps.findIndex((s) => s.id === stepId);
  // the same rule Cordi uses to propose the next camp at the end of this one (re-read on every
  // render: marks and done above keep this in step when a flag is planted)
  const ahead = nextCampAfter(c, stepId);
  const title = steps[here]?.title ?? "";
  const we = c.household.couple;
  // what "Siguiente" (or a "vamos" said to Cordi) goes to; a call stays open on the way
  const nextId = ahead?.id ?? null;
  useEffect(() => {
    explain.set({ nextId });
  }, [nextId]);
  const goNext = goNextCamp;
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
        <button className="act act-main act-large nextup-go" onClick={goNext} autoFocus>
          Siguiente: {ahead.title} <IconPlay />
        </button>
      ) : (
        <p className="nextup-all">{we ? "¡Habéis" : "¡Has"} plantado todas las banderas! La cima os espera con el resumen y el primer paso.</p>
      )}
      <div className="nextup-more">
        <button className="act act-quiet" onClick={() => endExplain()}>
          Volver al mapa
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
      const k = Math.max(0.35, Math.min(1, (availH - 4) / needH, availW / Math.max(needW, 1)));
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
  const { phase, how, title, i, beats, stepId, saying, paused, waiting } = useStore(explain, (s) => s);
  const on = how !== null && (phase === "playing" || phase === "done");
  const step = useMemo(() => buildSteps(c).find((s) => s.id === stepId) ?? null, [c, stepId]);
  const b = beats[Math.min(i, beats.length - 1)];
  const seat = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  // finished: the flag is planted on its own (nobody is asked "¿te ha quedado claro?")
  useEffect(() => {
    if (phase !== "done" || !stepId) return;
    mark(stepId, "yes");
    orb.flashEmo("happy", 1600);
    orb.hop(0.6);
    tones.form();
  }, [phase, stepId]);
  // the visual builds only while Cordi tells the step itself; anything else it says on that
  // step ("¿sigues ahí?", an answer) leaves it whole instead of building it again from zero
  const fresh = useStore(explain, (s) => s.fresh);
  const live = fresh;
  // A step that hasn't been told yet starts empty and builds as Cordi tells it: shown whole
  // first, it built again from zero half a second later, when the voice started. Told once
  // (or never told within a few seconds: a quiet agent, a jump), it stays whole.
  const key = `${stepId}:${i}`;
  const [told, setTold] = useState<Set<string>>(() => new Set());
  const wasFresh = useRef(false);
  useEffect(() => {
    if (wasFresh.current && !fresh) setTold((t) => new Set(t).add(key));
    wasFresh.current = fresh;
  }, [fresh, key]);
  useEffect(() => {
    setTold(new Set()); // another camp, or the explanation started again: every step is new
  }, [stepId]);
  const pending = !fresh && !told.has(key) && phase === "playing";
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setTold((s) => new Set(s).add(key)), 4000);
    return () => clearTimeout(t);
  }, [pending, key]);
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
                <button type="button" className={how === "call" ? "on" : ""} onClick={() => switchHow("call")} aria-pressed={how === "call"} title="Cordi te lo cuenta en voz alta">
                  <IconPhone /> Llamada
                </button>
                <button type="button" className={how === "chat" ? "on" : ""} onClick={() => switchHow("chat")} aria-pressed={how === "chat"} title="Por escrito, con toda la conversación para releer">
                  <IconChat /> Chat
                </button>
              </div>
              <span className="theater-n">
                {phase === "done" ? beats.length : Math.min(i + 1, beats.length)} / {beats.length}
              </span>
            </header>
            <Dots />

            <div className="theater-body" onPointerDown={hold} onKeyDown={hold}>
              <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                {phase === "done" ? (
                  <NextUp key="next" c={c} stepId={stepId} />
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
                      <Visual v={b.visual} c={c} live={live} empty={pending} />
                    </Fit>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <footer className="theater-foot">
              <Controls goOn />
              {how === "call" && <CallDock />}
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

/**
 * Under the explanation, in the same card: the call's two switches (your microphone, Cordi's
 * voice) and a box to write to Cordi. No transcript: Cordi answers out loud, in its bubble.
 */
function CallDock() {
  const { state, muted, quiet, noMic } = useStore(call, (s) => s);
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const on = state !== "idle";
  const grow = () => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };
  const send = () => {
    const q = text.trim();
    if (!q) return;
    setText("");
    requestAnimationFrame(grow);
    tones.tap();
    void typeInCall(q);
  };
  return (
    <div className="dock">
      <div className="dock-bar">
        <button
          type="button"
          className={muted ? "dock-btn off" : "dock-btn"}
          onClick={toggleMute}
          disabled={!on || noMic}
          aria-pressed={muted}
          aria-label={noMic ? "Sin micrófono" : muted ? "Activar tu micrófono" : "Silenciar tu micrófono"}
          title={noMic ? "Sin acceso al micrófono: escríbeme" : muted ? "Activar tu micrófono" : "Silenciar tu micrófono"}
        >
          {muted ? <IconMicOff /> : <IconMic />}
          {state === "listening" && !muted && <span className="dock-live" aria-hidden />}
        </button>
        <button
          type="button"
          className={quiet ? "dock-btn off" : "dock-btn"}
          onClick={toggleQuiet}
          aria-pressed={quiet}
          aria-label={quiet ? "Volver a oír a Cordi" : "Silenciar a Cordi"}
          title={quiet ? "Volver a oír a Cordi" : "Silenciar a Cordi (sigue con subtítulos)"}
        >
          {quiet ? <IconVoiceOff /> : <IconVoice />}
        </button>
        <form
          className="dock-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={box}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              chat.set({ typedAt: Date.now() });
              grow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={state === "thinking" ? "Cordi está pensando…" : "Pregúntale por escrito"}
            aria-label="Pregunta a Cordi por escrito"
          />
          <button type="submit" className="dock-send" title="Enviar" aria-label="Enviar" disabled={!text.trim() || !on}>
            <svg {...svg}>
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>
    </div>
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
const IconMic = () => (
  <svg {...svg}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);
const IconMicOff = () => (
  <svg {...svg}>
    <path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5.5 11a6.5 6.5 0 0 0 10.6 5M18.5 11c0 .8-.1 1.5-.4 2.2M12 17.5V21M3 3l18 18" />
  </svg>
);
const IconVoice = () => (
  <svg {...svg}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
const IconVoiceOff = () => (
  <svg {...svg}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
);
