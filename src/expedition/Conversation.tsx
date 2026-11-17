"use client";
// The "Conversación" tab: the whole chat with Cordi, like any chat app. Messages grouped by the
// camp they came from, Cordi's answer streaming in, then (once it has finished) the check and
// the questions for the camp you're at, and a box to type your own.
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Case } from "@/data/cases";
import { useStore } from "@/lib/store";
import { chat, converse, logMsg, type Msg } from "@/stage/chat";
import { explain, proceed, takeWheel } from "@/explain/player";
import { isGo } from "@/explain/confirm";
import { pick as pickRemark } from "@/explain/remarks";
import { goExplain } from "@/ai/client";
import { buildSteps } from "./steps";
import { Gauge, Suggestions } from "./Questions";
import { ChatPlayer } from "@/explain/ExplainUI";
import { Visual } from "@/explain/Visual";
import type { Step } from "./steps";

const time = (t: number) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

/** `compact`: inside the theater, beside the large visual; no visuals or player here. */
export function Conversation({ step, c, compact = false }: { step: Step; c: Case; compact?: boolean }) {
  const msgs = useStore(chat, (s) => s.msgs);
  const live = useStore(chat, (s) => s.live);
  const busy = useStore(chat, (s) => s.busy);
  const body = useRef<HTMLDivElement>(null);
  const we = c.household.couple;

  // keep the newest line in view while it streams
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, live?.shown, busy]);

  const groups: { topic: string; msgs: Msg[] }[] = [];
  for (const m of msgs) {
    const g = groups.at(-1);
    if (g && g.topic === m.topic) g.msgs.push(m);
    else groups.push({ topic: m.topic, msgs: [m] });
  }
  const thinking = busy && msgs.at(-1)?.who === "you";
  const quick = useStore(chat, (s) => s.quick);
  // only the latest offer to go somewhere keeps its buttons
  const lastGo = [...msgs].reverse().find((m) => m.go)?.id;
  const campTitle = (id: string) => buildSteps(c).find((s) => s.id === id)?.title.toLowerCase() ?? id;
  const exPlaying = useStore(explain, (s) => s.phase === "playing" || s.phase === "done");
  const exTitle = useStore(explain, (s) => s.title);
  const exI = useStore(explain, (s) => s.i);
  const exN = useStore(explain, (s) => s.beats.length);
  const ex = { playing: exPlaying, title: exTitle, i: exI, n: exN };

  return (
    <>
      <div className="chat-body" ref={body} aria-live="polite">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <p className="chat-hello">
              <span className="chat-who">Cordi</span>
              Hola. {we ? "Preguntadme" : "Pregúntame"} lo que no quede claro de {we ? "vuestro" : "tu"} plan: lo explico con {we ? "vuestros" : "tus"} números y sin prisa.
            </p>
          </div>
        )}
        {groups.map((g, gi) => (
          <section key={gi} className="chat-group">
            <h3 className="chat-topic">{g.topic}</h3>
            {g.msgs.map((m, k) => {
              const streaming = live?.id === m.id;
              const text = streaming ? m.text.split(" ").slice(0, live.shown).join(" ") : m.text;
              // in step with the explanation: a marker where a new step starts, and what belongs to
              // other steps fades back
              const stepStarts = m.step !== undefined && m.step !== g.msgs[k - 1]?.step;
              const away = m.step !== undefined && ex.playing && g.topic === ex.title && m.step !== ex.i;
              return (
                <div key={m.id} className={away ? "chat-line away" : "chat-line"}>
                {stepStarts && m.step !== undefined && (
                  <p className="chat-step">
                    Paso {m.step + 1}
                    {g.topic === ex.title ? ` de ${ex.n}` : ""}
                  </p>
                )}
                <motion.div className={`chat-msg from-${m.who}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <span className="chat-meta">
                    {m.who === "you" ? "Tú" : "Cordi"} · {time(m.at)}
                  </span>
                  <p>
                    {text}
                    {streaming && <span className="chat-caret" aria-hidden />}
                  </p>
                  {m.go && m.id === lastGo && (
                    <div className="chat-quick">
                      <button type="button" onClick={() => goExplain(m.go!)}>
                        Llévame a {campTitle(m.go)} y explícamelo
                      </button>
                      <button type="button" onClick={() => chat.set((s) => ({ msgs: s.msgs.map((x) => (x.id === m.id ? { ...x, go: undefined } : x)) }))}>
                        Luego
                      </button>
                    </div>
                  )}
                  {quick?.msgId === m.id && (
                    <div className="chat-quick">
                      {quick.choices.map((q) => (
                        <button key={q.id} type="button" onClick={() => pickRemark(q.id)}>
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.visual && !compact && (
                    <div className="chat-visual">
                      <Visual v={m.visual} c={c} live={streaming} />
                    </div>
                  )}
                </motion.div>
                </div>
              );
            })}
          </section>
        ))}
        {thinking && (
          <div className="chat-msg from-cordi">
            <span className="chat-meta">Cordi</span>
            <p className="chat-typing" aria-label="Cordi está pensando">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}
        {!busy && (
          <div className="chat-next">
            {!compact && <Gauge step={step} c={c} />}
            <Suggestions step={step} c={c} title={msgs.length ? `Más sobre ${step.title.toLowerCase()}` : "Para empezar"} />
          </div>
        )}
      </div>
      {!compact && <ChatPlayer />}
      <ChatInput />
    </>
  );
}

function ChatInput() {
  const [text, setText] = useState("");
  const busy = useStore(chat, (s) => s.busy);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const send = () => {
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    const ex = explain.get();
    const explaining = ex.phase === "playing" && ex.how === "chat";
    // a clear "sí, seguimos" while it waits moves the explanation on, like the button
    if (explaining && ex.waiting && isGo(q)) {
      logMsg("you", q, ex.title);
      proceed();
      return;
    }
    // a question takes the wheel: no more countdowns in this camp, like writing on a call
    if (explaining) takeWheel();
    // during an explanation, questions belong to it (and to its current step)
    converse(q, null, explaining ? ex.title : "Preguntas libres");
  };
  return (
    <form
      className="chat-input"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <input ref={input} value={text} onChange={(e) => {
          setText(e.target.value);
          chat.set({ typedAt: Date.now() });
        }} placeholder="Escribe tu pregunta sobre el plan" aria-label="Tu pregunta" />
      <button type="submit" className="ask-icon solid" title="Enviar" disabled={busy || !text.trim()}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}
