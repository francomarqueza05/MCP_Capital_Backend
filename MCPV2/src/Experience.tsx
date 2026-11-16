"use client";
// The whole experience: the mountain is always there. A start screen sits over it (the tap
// that unlocks sound); after that, the expedition takes over.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CASE_IDS, CASES, DEFAULT_CASE, getCase } from "@/data/cases";
import { names } from "@/lib/copy";
import { isMuted, setMuted, tones, unlock } from "@/lib/audio";
import { Orb } from "@/orb/Orb";
import { Ask, openAsk } from "@/stage/Ask";
import { Bubble } from "@/stage/Caption";
import { showBubble } from "@/stage/stage";
import { Expedition, type ExpeditionHandle, type Phase } from "@/expedition/Expedition";

export function Experience() {
  const [started, setStarted] = useState(false);
  const [caseId, setCaseId] = useState(DEFAULT_CASE);
  const [sound, setSound] = useState(true);
  const [phase, setPhase] = useState<Phase>("wait");
  const exp = useRef<ExpeditionHandle>(null);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("case");
    if (id && CASES[id]) setCaseId(id);
  }, []);

  const begin = (withSound: boolean) => {
    unlock();
    setMuted(!withSound);
    setSound(withSound);
    setStarted(true);
    exp.current?.start();
  };

  const switchCase = (id: string) => {
    if (id === caseId) return;
    tones.tap();
    const u = new URL(location.href);
    u.searchParams.set("case", id);
    location.href = u.toString();
  };

  return (
    <main className="stage">
      <Expedition ref={exp} c={getCase(caseId)} key={caseId} onPhase={setPhase} />
      <Orb
        onTap={() => {
          openAsk();
          showBubble("howCanIHelp", 2200);
        }}
      />
      <Bubble />
      <Ask />

      {started && (
        <header className="topbar">
          <span className="wordmark">cordada</span>
          <div className="topbar-right">
            <label className="family">
              <span className="sr">Familia de ejemplo</span>
              <select value={caseId} onChange={(e) => switchCase(e.target.value)}>
                {CASE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {names(CASES[id])}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="act act-quiet"
              onClick={() => {
                unlock();
                setMuted(!isMuted());
                setSound(!isMuted());
              }}
            >
              {sound ? "Silenciar" : "Activar sonido"}
            </button>
          </div>
        </header>
      )}

      <AnimatePresence>
        {phase === "intro" && (
          <motion.button key="skip" className="act act-quiet skip" onClick={() => exp.current?.skip()} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 1.2 } }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
            Saltar la intro
          </motion.button>
        )}
        {!started && (
          <motion.div key="start" className="start" exit={{ opacity: 0 }} transition={{ duration: 0.9 }}>
            <div className="start-inner">
              <h1 className="start-mark">cordada</h1>
              <p className="start-tag">
                {names(getCase(caseId))}, {getCase(caseId).household.couple ? "vuestro" : "tu"} plan financiero es una montaña. Cordi {getCase(caseId).household.couple ? "os" : "te"} acompaña a subirla.
              </p>
              <div className="start-actions">
                <button className="act act-main act-large" onClick={() => begin(true)}>
                  Empezar la ruta
                </button>
                <button className="act act-quiet" onClick={() => begin(false)}>
                  Empezar sin sonido
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
