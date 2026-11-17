"use client";
// The whole experience: the mountain is always there. A start screen sits over it (the tap
// that unlocks sound); after that, the expedition takes over.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CASE_IDS, CASES, DEFAULT_CASE, getCase } from "@/data/cases";
import { names } from "@/lib/copy";
import { isMuted, setMuted, stopSfx, stopVoice, tones, unlock } from "@/lib/audio";
import { Orb } from "@/orb/Orb";
import { Ask } from "@/stage/Ask";
import { Bubble } from "@/stage/Caption";
import { CallBar } from "@/stage/CallBar";
import { checkAI, session } from "@/ai/client";
import { ExplainStage } from "@/explain/ExplainUI";
import { RemarkCard } from "@/explain/RemarkCard";
import { hangUp, inCall } from "@/stage/call";
import { showBubble } from "@/stage/stage";
import { Expedition, type ExpeditionHandle, type Phase } from "@/expedition/Expedition";
import { Login, ProfileChip } from "@/intro/Login";

const LEAVE_MS = 700; // the fade to the start screen's sky before switching profile

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

  // once only: the start screen fades out for almost a second and its buttons could be tapped
  // again meanwhile, starting a second intro on top of the first (the stutter of rapid clicks)
  const begun = useRef(false);
  const begin = (withSound: boolean) => {
    if (begun.current) return;
    begun.current = true;
    unlock();
    setMuted(!withSound);
    setSound(withSound);
    setStarted(true);
    exp.current?.start();
  };

  /**
   * Back to "¿Quién sube hoy?": a fresh start for another profile. The page reloads (every
   * store starts clean), but first the mountain fades into the start screen's night and the
   * sound dies down, so the picker comes in on the same sky instead of after a hard cut.
   */
  const [leaving, setLeaving] = useState(false);
  const switchProfile = () => {
    if (leaving) return;
    tones.tap();
    setLeaving(true);
    stopVoice();
    stopSfx(600);
    if (inCall()) hangUp();
    const u = new URL(location.href);
    u.searchParams.delete("case");
    setTimeout(() => location.replace(u.toString()), LEAVE_MS);
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
      {/* in the intro Cordi rises over the mountain: its words go underneath it */}
      <Bubble below={phase === "intro"} />
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
        {leaving && <motion.div key="leave" className="leave-curtain" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: LEAVE_MS / 1000 - 0.1, ease: "easeInOut" }} />}
        {!started && (
          <motion.div key="start" className="start" exit={{ opacity: 0, pointerEvents: "none" }} transition={{ duration: 0.9 }}>
            <div className="start-inner">
              <Login selected={picked} onSelect={pick} onBegin={begin} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
