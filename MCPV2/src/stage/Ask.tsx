"use client";
// Asking Cordi something, by text or by voice. Answers are a placeholder until the live agent
// (POST /v1/voice/agent-session on the Cordada API) is wired in.
import { useEffect, useRef, useState } from "react";
import { createStore, useStore, wait } from "@/lib/store";
import { tones } from "@/lib/audio";
import { orb } from "@/orb/engine";
import { showBubble } from "./stage";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export const ask = createStore({ open: false, mode: "text" as "text" | "voice" });
export const setInputMode = (mode: "text" | "voice") => {
  ask.set({ mode });
  write("cordada.inputMode", mode);
};
export const openAsk = () => ask.set({ open: true });

let answering = false;
async function answer() {
  if (answering) return;
  answering = true;
  orb.setEmo("thinking");
  showBubble("…", 0);
  await wait(1200);
  orb.setEmo("speaking");
  showBubble("placeholderAnswer", 5200);
  await wait(4200);
  orb.setEmo("neutral");
  orb.flashEmo("happy", 1400);
  answering = false;
}

export function Ask() {
  const { open, mode } = useStore(ask, (s) => s);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const m = read("cordada.inputMode");
    if (m === "voice" || m === "text") ask.set({ mode: m });
  }, []);
  useEffect(() => {
    if (open && mode === "text") input.current?.focus();
  }, [open, mode]);

  if (!open) return null;
  const send = () => {
    if (!text.trim()) return;
    setText("");
    answer();
  };
  const mic = async () => {
    if (answering) return;
    showBubble("listening", 0);
    await wait(700);
    if (!(await orb.listen(3000))) {
      setInputMode("text");
      orb.setEmo("concerned");
      showBubble("micFailedShort", 4000);
      await wait(3200);
      orb.setEmo("neutral");
      return;
    }
    answer();
  };

  return (
    <div className="ask" role="dialog" aria-label="Pregúntale a Cordi">
      <button
        className="ask-icon"
        title={mode === "voice" ? "Escribir en lugar de hablar" : "Hablar en lugar de escribir"}
        onClick={() => {
          tones.tap();
          setInputMode(mode === "voice" ? "text" : "voice");
        }}
      >
        {mode === "voice" ? <IconKeys /> : <IconMic />}
      </button>
      {mode === "text" ? (
        <>
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Pregunta lo que quieras sobre tu plan"
            aria-label="Tu pregunta"
          />
          <button className="ask-icon solid" title="Enviar" onClick={send}>
            <IconSend />
          </button>
        </>
      ) : (
        <button className="ask-talk" onClick={mic}>
          <IconMic /> Toca y habla
        </button>
      )}
      <button
        className="ask-icon"
        title="Cerrar"
        onClick={() => {
          ask.set({ open: false });
          orb.setEmo("neutral");
        }}
      >
        <IconClose />
      </button>
    </div>
  );
}

const svgProps = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const IconMic = () => (
  <svg {...svgProps}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
  </svg>
);
const IconKeys = () => (
  <svg {...svgProps}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.5h.01M18 13.5h.01M9 14.5h6" />
  </svg>
);
const IconSend = () => (
  <svg {...svgProps}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);
const IconClose = () => (
  <svg {...svgProps}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
