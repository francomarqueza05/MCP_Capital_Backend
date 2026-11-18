"use client";
// The call controls, while a call is on: what's happening, how long, mute, cut in, hang up.
// Cordi's words show in its speech bubble, so this stays small.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { call, cutIn, hangUp, startCall, toggleMute, type CallState } from "./call";
import { agent } from "./agent";
import { explain, inTheater } from "@/explain/player";
import { tr } from "@/lib/lang";

const STATUS = (): Record<CallState, string> => ({
  idle: "",
  connecting: tr("Connecting…", "Conectando…"),
  speaking: tr("Cordi is talking", "Cordi habla"),
  listening: tr("I'm listening", "Te escucho"),
  thinking: tr("Cordi is thinking…", "Cordi piensa…"),
});

function Clock({ t0 }: { t0: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - t0) / 1000));
  return <span className="call-clock">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>;
}

export function CallBar() {
  const { state, muted, t0, error } = useStore(call, (s) => s);
  const live = useStore(agent, (s) => s.mode !== null);
  // during an explanation the call's controls live in its card, not down here
  const theater = useStore(explain, () => inTheater());
  const on = state !== "idle" && !theater;

  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") hangUp();
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [on]);

  return (
    <AnimatePresence>
      {on ? (
        <motion.div
          key="call"
          className={`call s-${state}`}
          role="region"
          aria-label={tr("Call with Cordi", "Llamada con Cordi")}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="call-live" aria-hidden />
          <div className="call-info">
            <span className="call-status" aria-live="polite">
              {muted && state === "listening" ? tr("Microphone muted", "Micrófono silenciado") : STATUS()[state]}
            </span>
            <Clock t0={t0} />
          </div>
          {state === "speaking" && !live && (
            <button className="call-btn" onClick={cutIn} title={tr("Interrupt Cordi", "Interrumpir a Cordi")}>
              {tr("Interrupt", "Interrumpir")}
            </button>
          )}
          <button className={muted ? "call-icon on" : "call-icon"} onClick={toggleMute} aria-pressed={muted} title={muted ? tr("Turn microphone on", "Activar micrófono") : tr("Mute microphone", "Silenciar micrófono")}>
            {muted ? <IconMicOff /> : <IconMic />}
          </button>
          <button className="call-icon hang" onClick={hangUp} title={tr("Hang up", "Colgar")}>
            <IconHang />
          </button>
        </motion.div>
      ) : (
        error && (
          <motion.p key="err" className="call-error" role="alert" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
            <button onClick={() => call.set({ error: "" })} aria-label={tr("Close notice", "Cerrar aviso")}>
              ×
            </button>
          </motion.p>
        )
      )}
    </AnimatePresence>
  );
}

/** "Llamar a Cordi": starts the call. */
export function CallButton({ className = "act", label = tr("Call Cordi", "Llamar a Cordi") }: { className?: string; label?: string }) {
  const state = useStore(call, (s) => s.state);
  if (state !== "idle") return null;
  return (
    <button className={className} onClick={() => startCall()} title={tr("Talk to Cordi by voice", "Hablar con Cordi por voz")}>
      <IconPhone /> {label}
    </button>
  );
}

const svg = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
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
const IconHang = () => (
  <svg {...svg}>
    <path d="M3.5 14.5c4.7-4 12.3-4 17 0l-1.8 2.6a1 1 0 0 1-1.3.3l-2.6-1.4a1 1 0 0 1-.5-1v-1.6a12 12 0 0 0-4.6 0V15a1 1 0 0 1-.5 1l-2.6 1.4a1 1 0 0 1-1.3-.3z" />
  </svg>
);
export const IconPhone = () => (
  <svg {...svg}>
    <path d="M5 4h3l1.5 4-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2L18 14v3a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
);
