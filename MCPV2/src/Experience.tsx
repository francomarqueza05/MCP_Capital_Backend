"use client";
// The whole experience: the mountain is always there. A start screen sits over it (the tap
// that unlocks sound); after that, the expedition takes over.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CASE_IDS, CASES, DEFAULT_CASE, getCase } from "@/data/cases";
import { names } from "@/lib/copy";
import { isMuted, setMuted, tones, unlock } from "@/lib/audio";
import { Orb } from "@/orb/Orb";
import { Ask } from "@/stage/Ask";
import { Bubble } from "@/stage/Caption";
import { CallBar } from "@/stage/CallBar";
import { checkAI, session } from "@/ai/client";
import { ExplainStage } from "@/explain/ExplainUI";
import { RemarkCard } from "@/explain/RemarkCard";
import { inCall } from "@/stage/call";
import { showBubble } from "@/stage/stage";
import { Expedition, type ExpeditionHandle, type Phase } from "@/expedition/Expedition";
import { Login, ProfileChip } from "@/intro/Login";

export function Experience() {
  const [started, setStarted] = useState(false);
  const [caseId, setCaseId] = useState(DEFAULT_CASE);
  const [sound, setSound] = useState(true);
  const [phase, setPhase] = useState<Phase>("wait");
  const exp = useRef<ExpeditionHandle>(null);

  // who's climbing: picked on the start screen (or already in the link, ?case=...)
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("case");
    if (id && CASES[id]) {
      setCaseId(id);
      setPicked(id);
    }
    void checkAI();
  }, []);
  const pick = (id: string | null) => {
    setPicked(id);
    if (!id) return;
    setCaseId(id);
    const u = new URL(location.href);
    u.searchParams.set("case", id);
    history.replaceState(null, "", u.toString());
  };
  // the AI answers about this family
  useEffect(() => {
    session.set({ caseId });
  }, [caseId]);

  const begin = (withSound: boolean) => {
    unlock();
    setMuted(!withSound);
    setSound(withSound);
    setStarted(true);
    exp.current?.start();
  };

  /** Back to "¿Quién sube hoy?": a fresh start for another profile. */
  const switchProfile = () => {
    tones.tap();
    const u = new URL(location.href);
    u.searchParams.delete("case");
    location.href = u.toString();
  };

  return (
    <main className="stage">
      <Expedition ref={exp} c={getCase(caseId)} key={caseId} onPhase={setPhase} />
      <Orb
        onTap={() => {
          if (inCall()) return;
          showBubble("howCanIHelp", 2200);
        }}
      />
      <Bubble />
      <Ask />
      <ExplainStage c={getCase(caseId)} />
      <RemarkCard />
      <CallBar />

      {started && (
        <header className="topbar">
          <span className="wordmark">cordada</span>
          <div className="topbar-right">
            <ProfileChip c={getCase(caseId)} onSwitch={switchProfile} />
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
              <Login selected={picked} onSelect={pick} onBegin={begin} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
