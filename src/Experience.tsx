"use client";
// The whole experience: the mountain is always there. A start screen sits over it (the tap
// that unlocks sound); after that, the expedition takes over.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CASE_IDS, CASES, DEFAULT_CASE, getCase, setCases, type Case } from "@/data/cases";
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
import { LangSwitch, Login, ProfileChip } from "@/intro/Login";
import { CARRY_KEY, LANG_COOKIE, setLang, tr, type Lang } from "@/lib/lang";
import { forget, markBegun, memory, openMemory, shiftDays } from "@/commit/memory";

/**
 * Whether this load carries the profile over (a language switch or a start over just asked for
 * it). Read once per page: the start-up effect can run twice (React's dev check), and the second
 * run, finding the mark already used, dropped the profile from the link.
 */
let carriedOnce: boolean | null = null;
function carried() {
  if (carriedOnce === null) {
    carriedOnce = false;
    try {
      carriedOnce = sessionStorage.getItem(CARRY_KEY) === "1";
      sessionStorage.removeItem(CARRY_KEY);
    } catch {}
  }
  return carriedOnce;
}

const LEAVE_MS = 700; // the fade to the start screen's sky before switching profile

export function Experience({ lang, cases }: { lang: Lang; cases?: Record<string, Case> }) {
  // before anything below renders: every text is built in this language, and from the
  // households the server read from the Sherpas MCP (the bundled copy until then)
  setLang(lang);
  if (cases) setCases(cases);
  useEffect(() => {
    document.documentElement.lang = lang;
    // the server routes read the language from here (a ?lang= link sets it too)
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  }, [lang]);
  const [started, setStarted] = useState(false);
  const [caseId, setCaseId] = useState(DEFAULT_CASE);
  const [sound, setSound] = useState(true);
  const [phase, setPhase] = useState<Phase>("wait");
  const exp = useRef<ExpeditionHandle>(null);

  // who's climbing: always picked on the start screen, from the four. The profile in the link
  // (?case=...) only carries over a deliberate reload (switching language, starting over); a
  // plain reload or a saved link opens on the four profiles again
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    const u = new URL(location.href);
    const id = u.searchParams.get("case");
    if (id && CASES[id] && carried()) {
      setCaseId(id);
      setPicked(id);
    } else if (id) {
      u.searchParams.delete("case");
      history.replaceState(null, "", u.toString());
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
  // what Cordi remembers of this family (flags, the promised step), loaded once it is picked.
  // ?reset=1 starts the family over (for the demo)
  useEffect(() => {
    if (!picked) return;
    if (new URLSearchParams(location.search).get("reset")) forget(picked);
    openMemory(picked);
  }, [picked]);
  // the demo clock: Shift+T moves time 3 days ahead, as if the family came back later
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.key.toLowerCase() !== "t" || (e.target as HTMLElement)?.closest?.("input, textarea")) return;
      shiftDays(3);
      if (picked) openMemory(picked);
      showBubble(tr("⏩ +3 days", "⏩ +3 días"), 1600);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [picked]);

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
    // coming back: no need to watch the intro again (first time, it always plays)
    if (memory.get().back) setTimeout(() => exp.current?.skip(), 400);
    markBegun();
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
      {/* tapping Cordi is just play: it bounces and reacts (orb.tapped), nothing to answer */}
      <Orb />
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
            <LangSwitch />
            <ProfileChip c={getCase(caseId)} onSwitch={switchProfile} />
          </div>
        </header>
      )}

      <AnimatePresence>
        {phase === "intro" && (
          <motion.button key="skip" className="act act-quiet skip" onClick={() => exp.current?.skip()} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 1.2 } }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
            {tr("Skip the intro", "Saltar la intro")}
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
