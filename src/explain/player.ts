// Plays "Explícame esto". It starts right away, as a call (or the chat, if that's what the
// person switched to last time); the two can be swapped at any moment. Then it walks through the
// camp's beats on its own, one visual and one line at a time, with a short pause between them.
// The person can pause, go back, skip ahead, hear a step again, or say "no lo entiendo" and get
// it said another way. Talking over Cordi on a call pauses it. At the end: "is it clear?".
import type { Case } from "@/data/cases";
import { buildSteps, type Step } from "@/expedition/steps";
import { understanding } from "@/expedition/understanding";
import { holdVoice, line as voiceLine, prefetchSpeech, releaseVoice, stopVoice, tones } from "@/lib/audio";
import { createStore, wait } from "@/lib/store";
import { orb } from "@/orb/engine";
import { call, hangUp, inCall, listenInCall, sayInCall, startCall, stopLine } from "@/stage/call";
import { chat, closePanel, converse, cordiWrites, logMsg, openChat } from "@/stage/chat";
import { advanceLive, agentActive, agentSay, allowAdvance, AUTO_MS, moveLive, restartAuto, startAgent } from "@/stage/agent";
import { askCordi, checkAI, goExplain } from "@/ai/client";
import { hideBubble, showBubble } from "@/stage/stage";
import { beatsFor, type Beat } from "./beats";
import { isGo } from "./confirm";
import { tr } from "@/lib/lang";

export type How = "chat" | "call";
type Phase = "off" | "choose" | "playing" | "done";

/**
 * How the person likes to be explained to: a call by default (nothing to decide to start), or
 * the chat if they switched to it last time (it keeps the whole conversation to read again).
 */
const HOW_KEY = "cordada.how";
function savedHow(): How {
  try {
    return localStorage.getItem(HOW_KEY) === "chat" ? "chat" : "call";
  } catch {
    return "call";
  }
}
function saveHow(how: How) {
  try {
    localStorage.setItem(HOW_KEY, how);
  } catch {
    // no storage (private window): it just starts as a call next time
  }
}

export const explain = createStore({
  phase: "off" as Phase,
  how: null as How | null,
  stepId: "",
  title: "",
  beats: [] as Beat[],
  i: 0,
  paused: false,
  /** Cordi is saying the current beat right now. */
  saying: false,
  /**
   * What Cordi is saying is the step itself (its narration, a repeat, a simpler retelling), so
   * the visual builds along with it. False for anything else said on that step ("¿sigues
   * ahí?", an answer to a question): the visual stays whole then.
   */
  fresh: false,
  /**
   * On a call, after each step Cordi waits ("¿Seguimos?") so the visual can be explored.
   * `until` is when it moves on by itself; null once the person has touched the visual, so it
   * waits for them.
   */
  waiting: false,
  until: null as number | null,
  /**
   * The furthest step reached in this explanation. Going back to an earlier one (an arrow, or
   * asking Cordi to go over it again) is a detour: moving on returns here, not step by step.
   */
  furthest: 0,
  /** Where to start: 0, or the step saved from last time ("seguir donde lo dejé"). */
  from: 0,
  /** When the current countdown to the next step started (it drives the button's fill). */
  waitFrom: 0,
  /** What was left of the countdown when paused. */
  left: null as number | null,
  /**
   * The person took the wheel (said "no lo entiendo", wrote or asked something): no more
   * countdowns in this camp, they move on with "Seguimos" when they want.
   */
  manual: false,
  /** Finished a camp: the next one still to explain (what "Siguiente" or a "vamos" goes to). */
  nextId: null as string | null,
  /**
   * Cordi was cut off mid-step by the person (talking or writing): when they say to go on, that
   * step is told again from the top instead of skipping to the next one.
   */
  redo: false,
  /** Paused because the person talked over Cordi (not with the pause button). */
  cutOff: false,
});

/**
 * How far each camp's explanation got, so leaving halfway and coming back picks it up there.
 * The step is saved as it's reached; finishing it clears it.
 */
export const progress = createStore({ at: {} as Record<string, number> });

/**
 * What has been explained so far, per camp: how many of its steps were seen, and whether the
 * whole explanation was. The map's chat only gives detail on what's here.
 */
export const known = createStore({ seen: {} as Record<string, number>, done: {} as Record<string, true> });

/**
 * The camp that comes after `stepId`: the next one along the route not yet understood (round
 * to the start if needed), or null when every flag is planted. One rule for the "Siguiente"
 * button and for what Cordi proposes at the end of a camp, so the two always agree.
 */
export function nextCampAfter(c: Case, stepId: string): Step | null {
  const steps = buildSteps(c);
  const marks = understanding.get().marks;
  const done = known.get().done;
  const clear = (id: string) => marks[id] === "yes" || (done[id] && marks[id] !== "meh" && marks[id] !== "no");
  const here = steps.findIndex((s) => s.id === stepId);
  return [...steps.slice(here + 1), ...steps.slice(0, here)].find((s) => !clear(s.id) && s.id !== stepId) ?? null;
}

/** Where moving on goes from step i: back to the furthest step after a detour, else the next. */
export const nextFrom = (i: number) => {
  const f = explain.get().furthest;
  return i < f ? f : i + 1;
};
const save = (stepId: string, i: number) => {
  if (explain.get().stepId === stepId) explain.set((x) => ({ furthest: Math.max(x.furthest, i) }));
  progress.set((p) => ({ at: { ...p.at, [stepId]: i } }));
  known.set((k) => ({ seen: { ...k.seen, [stepId]: Math.max(k.seen[stepId] ?? 0, i + 1) } }));
};
const clear = (stepId: string) => {
  progress.set((p) => {
    const at = { ...p.at };
    delete at[stepId];
    return { at };
  });
  // cleared because it was finished: the whole camp is now explained
  known.set((k) => ({ done: { ...k.done, [stepId]: true } }));
};

let run = 0; // bumps on every start/stop, so an old loop knows to quit
/**
 * While the call for an explanation is being opened (the live agent, then the local call as a
 * fallback), the call state goes idle in between: that is not the person hanging up, and must
 * not close the explanation (it did, when the agent failed for want of a microphone).
 */
let opening = false;
async function openingCall<T>(fn: () => Promise<T>): Promise<T> {
  opening = true;
  try {
    return await fn();
  } finally {
    opening = false;
  }
}
let jumped = false; // a control moved the position: the loop shouldn't advance on its own

const DWELL = 1300; // pause after each beat in the chat, so the visual can be read
// After each step the visual stays for as long as the person wants: no countdown, they move on
// with "Seguimos" (or a clear yes). A timer there read as pressure.

/** The person asked, wrote, or didn't understand: they'll move on themselves from now on. */
export function takeWheel() {
  explain.set({ manual: true, until: null, left: null });
}

/** "Explícame esto": Cordi asks how the person wants it. */
/** The agent showed step i: it counts as reached, for picking up later. */
export const reached = (i: number) => save(explain.get().stepId, i);
/** The agent says the camp is explained: the check comes up. */
export function agentFinished() {
  const s = explain.get();
  clear(s.stepId);
  explain.set({ phase: "done", saying: false, waiting: false });
  orb.flashEmo("happy", 1200);
}
const live = () => explain.get().how === "call" && agentActive();

/** `quiet`: the mode is already decided (it starts right away), so Cordi doesn't ask it. */
export function offerExplain(step: Step, c: Case, quiet = false) {
  if (inCall() && explain.get().phase === "playing") return;
  tones.tap();
  const beats = beatsFor(step, c);
  const saved = progress.get().at[step.id] ?? 0;
  explain.set({ phase: "choose", how: null, stepId: step.id, title: step.title, beats, i: 0, furthest: saved > 0 && saved < beats.length ? saved : 0, from: saved > 0 && saved < beats.length ? saved : 0, paused: false, saying: false, manual: false, left: null, redo: false, cutOff: false });
  if (quiet) return;
  // never asked how: it starts right away, the way the person used last (a call the first time)
  void startExplain(savedHow());
}

/**
 * Switch between chat and call in the middle of an explanation: same camp, same step, the
 * other way. The step on screen is told again in the new mode, and it goes on from there.
 */
export async function switchHow(how: How) {
  const s = explain.get();
  if (s.how === how || (s.phase !== "playing" && s.phase !== "done")) return;
  const my = ++run;
  const old = s.how;
  tones.tap();
  saveHow(how);
  // the new mode first, so hanging up the call doesn't read as leaving the explanation
  explain.set({ how, paused: false, waiting: false, saying: false });
  chat.set({ live: null });
  if (old === "call") hangUp();
  if (s.phase === "done") {
    if (how === "chat") openChat();
    return;
  }
  const i = Math.min(s.i, s.beats.length - 1);
  if (how === "call") {
    if ((await checkAI()).agent && (await openingCall(() => startAgent({ mode: "explain", campId: s.stepId, from: i, title: s.title })))) return;
    if (my !== run) return;
    if (!(await openingCall(() => startCall({ greet: false })))) {
      explain.set({ how: "chat" });
      openChat();
    }
  } else {
    openChat();
    logMsg("you", tr("Let's carry on in writing", "Sigamos por escrito"), s.title);
  }
  if (my !== run) return;
  if (explain.get().how === "chat") chat.set({ busy: true });
  explain.set({ i });
  await loop(my);
}

export function cancelExplain() {
  run++;
  // leaving while paused: nothing stays frozen (the next time starts playing normally)
  if (explain.get().paused) stopVoice();
  explain.set({ phase: "off", paused: false, saying: false, fresh: false, waiting: false, until: null, nextId: null, redo: false, cutOff: false });
  chat.set({ busy: false, live: null });
  orb.setEmo("neutral");
}

export async function startExplain(how: How) {
  const s = explain.get();
  if (s.phase !== "choose" || !s.beats.length) return;
  const my = ++run;
  // the camp's own narration stops here (and one still on its way never starts): otherwise it
  // talks over Cordi's explanation. Its words go from the bubble too: on a call there are no
  // captions, so nothing else would replace them and the old line would stay up
  stopVoice();
  hideBubble();
  // every step's voice on its way now: the expressive voice takes a moment to make each line
  s.beats.slice(s.from).forEach((b) => prefetchSpeech(b.say));
  tones.tap();
  orb.hop(0.4);
  const from = s.from;
  explain.set({ phase: "playing", how, i: from, paused: false });
  if (how === "call" && (await checkAI()).agent) {
    // the live agent narrates in its own words and moves the visuals with show_block
    if (await openingCall(() => startAgent({ mode: "explain", campId: s.stepId, from, title: s.title }))) return;
    if (my !== run) return;
  }
  if (how === "chat") {
    openChat();
    chat.set({ busy: true });
    logMsg("you", from ? tr(`Let's carry on with ${s.title.toLowerCase()}`, `Sigamos con ${s.title.toLowerCase()}`) : tr(`Explain ${s.title.toLowerCase()} to me`, `Explícame ${s.title.toLowerCase()}`), s.title);
  } else if ((prefetchSpeech(s.beats[from].say), !(await openingCall(() => startCall({ greet: false }))))) {
    // no microphone: carry on in the chat instead
    explain.set({ how: "chat" });
    openChat();
    chat.set({ busy: true });
  } else if (inCall()) {
    // the call may already be open (it stays on from the last camp) and listening: Cordi takes
    // the turn to start, or the step would read as "the person is talking" and start paused
    call.set({ state: "speaking" });
  }
  if (my !== run) return;
  if (from) await recap(my, from);
  if (my !== run) return;
  await loop(my);
}

/** Coming back halfway: one line on where we left it, then on from there. */
async function recap(my: number, from: number) {
  const s = explain.get();
  const prev = s.beats[from - 1];
  const gist = prev ? prev.say.split(/(?<=[.!?])\s/)[0] : "";
  const text = tr(
    `Picking up where we left off, at step ${from + 1} of ${s.beats.length}.${gist ? ` The last thing we saw: ${gist}` : ""}`,
    `Seguimos donde lo dejamos, en el paso ${from + 1} de ${s.beats.length}.${gist ? ` Lo último que vimos: ${gist}` : ""}`,
  );
  explain.set({ saying: true });
  if (s.how === "call" && inCall()) {
    logMsg("cordi", text, s.title);
    await sayInCall(text);
  } else await cordiWrites(text, s.title, undefined, () => my === run);
  explain.set({ saying: false });
}

async function loop(my: number) {
  while (my === run) {
    const s = explain.get();
    if (s.i >= s.beats.length) break;
    // on a call, the person talking (or Cordi answering them) holds the explanation
    if (s.how === "call" && !s.paused && (call.get().state === "listening" || call.get().state === "thinking")) explain.set({ paused: true, cutOff: true });
    if (explain.get().paused) {
      await wait(120);
      continue;
    }
    jumped = false;
    save(s.stepId, s.i);
    const whole = await sayBeat(s.beats[s.i], my);
    if (my !== run) return;
    if (!whole) {
      // cut off (talked over on a call): what they say decides (see interject / resumeCut)
      explain.set({ paused: true, cutOff: true });
      continue;
    }
    if (s.how === "call" || s.how === "chat") {
      // "¿Seguimos?": the visual stays to be explored; on by itself only if left untouched
      // the on-screen bar asks "¿Seguimos?": Cordi doesn't say it after every step
      // it waits for "Seguimos" (or a chapter, an arrow, "No lo entiendo"): never on its own
      // on a call Cordi keeps the pace: after a quiet moment it goes on by itself (the button
      // fills meanwhile). Once the person has taken the wheel (asked, "I don't get it"), it waits.
      const auto = s.how === "call" && !explain.get().manual;
      explain.set({ waiting: true, until: auto ? performance.now() + AUTO_MS : null, waitFrom: performance.now(), left: null });
      // in the chat, the person can write to Cordi while it waits; on a call, Cordi listens
      // (a spoken "sí, seguimos" moves on; anything else is a question it answers)
      if (s.how === "chat") chat.set({ busy: false });
      else listenInCall();
      while (my === run && explain.get().waiting && !jumped) {
        // Cordi still answering something: the step waits for that to finish
        const busyNow = (s.how === "call" && call.get().state !== "listening") || (s.how === "chat" && chat.get().busy);
        if (busyNow && explain.get().until !== null) explain.set({ until: Math.max(explain.get().until ?? 0, performance.now() + 1500) });
        const u = explain.get().until;
        if (u !== null && !explain.get().paused && performance.now() > u) {
          // on by itself: on a call, Cordi takes the turn back to say the next step
          if (s.how === "call" && inCall()) call.set({ state: "speaking" });
          break;
        }
        await wait(80);
      }
      explain.set({ waiting: false, until: null });
      if (s.how === "chat") {
        // a question asked meanwhile finishes before the next step starts
        while (my === run && chat.get().busy) await wait(100);
        chat.set({ busy: true });
      }
    } else {
      // dwell on the visual, unless paused or moved meanwhile
      const t = performance.now();
      while (my === run && performance.now() - t < DWELL && !explain.get().paused && !jumped) await wait(60);
    }
    if (my !== run) return;
    if (!jumped && !explain.get().paused) explain.set((x) => ({ i: nextFrom(x.i) }));
  }
  if (my === run) await finish(my);
}

/** Says one beat the chosen way. Resolves false if it was interrupted. */
async function sayBeat(b: Beat, my: number, text = b.say) {
  const s = explain.get();
  // on a call, fetch the next step's voice while this one plays
  if (s.how === "call") {
    const nb = s.beats[s.i + 1];
    if (nb) prefetchSpeech(nb.say);
  }
  explain.set({ saying: true, fresh: true });
  let whole = true;
  if (s.how === "call" && inCall()) {
    logMsg("cordi", text, s.title, b.visual);
    whole = await sayInCall(text);
  } else {
    await cordiWrites(text, s.title, b.visual, () => my === run && !jumped);
  }
  explain.set({ saying: false, fresh: false });
  return whole && my === run;
}

async function finish(my: number) {
  const s = explain.get();
  clear(s.stepId);
  explain.set({ phase: "done", saying: false });
  const close = tr("If anything's still unclear, write to me or ask me anything.", "Si te queda alguna duda, escríbeme o pregúntame lo que quieras.");
  if (s.how === "call" && inCall()) {
    logMsg("cordi", close, s.title);
    await sayInCall(close);
    if (my === run) listenInCall();
  } else {
    await cordiWrites(close, s.title, undefined, () => my === run);
    chat.set({ busy: false });
  }
  orb.flashEmo("happy", 1200);
}

// ---------------------------------------------------------------- controls
/**
 * Pause freezes everything where it is: the voice mid-word, the caption, the visual, the
 * countdown. Play picks up from that same instant.
 */
export const togglePause = () => {
  const s = explain.get();
  const p = !s.paused;
  if (live()) {
    // the agent goes silent (and comes back) with the pause itself: see watchPause in agent.ts
    // (resuming is told to the agent by agentPause in agent.ts: same step, from where it was)
    explain.set({ paused: p });
    if (p) orb.setEmo("neutral");
    return;
  }
  const now = performance.now();
  if (p) {
    holdVoice();
    explain.set({ paused: true, left: s.until !== null ? Math.max(0, s.until - now) : null });
    orb.setEmo("neutral");
    return;
  }
  releaseVoice();
  explain.set({ cutOff: false });
  // cut off earlier by the person talking: Cordi takes the turn back to go on
  if (!s.waiting && !s.saying && s.how === "call" && inCall() && call.get().state === "listening") call.set({ state: "speaking" });
  explain.set({ paused: false, until: s.left !== null ? now + s.left : s.until, left: null });
  if (s.saying) orb.setEmo("speaking");
};

function jump(to: number) {
  const s = explain.get();
  const i = Math.max(0, Math.min(s.beats.length - 1, to));
  if (live()) {
    explain.set({ paused: false, waiting: false });
    // the screen moves now and the place is saved, whatever the agent was about to do
    if (i !== s.i && moveLive(i)) return;
    explain.set({ i });
    agentSay(i === s.i ? tr("Can you say that again?", "¿Me lo repites?") : tr(`Let's go to block ${s.beats[i].id}.`, `Vamos al bloque ${s.beats[i].id}.`));
    return;
  }
  jumped = true;
  if (s.how === "call" && inCall()) call.set({ state: "speaking" });
  explain.set({ i, paused: false });
  cut();
}
export const next = () => jump(explain.get().i + 1);
/** "Seguimos": on to the next step (or to the end, after the last). */
export const proceed = () => {
  tones.tap();
  // stopped mid-step (the pause button, or cut off): "Seguimos" carries on from there
  const s0 = explain.get();
  if (s0.paused && !s0.waiting && !live()) {
    togglePause();
    return;
  }
  // still talking (or stuck waiting on a voice that never came): "Continue" is never a dead
  // button. It skips to the next step right away; on the last one it closes the camp
  if (!s0.waiting && !s0.paused && !live()) {
    if (s0.i < s0.beats.length - 1) next();
    else {
      cut();
      explain.set((x) => ({ i: x.beats.length }));
      jumped = true;
    }
    return;
  }
  explain.set({ waiting: false, until: null });
  if (live()) {
    // the next block goes on screen now; on the last one, the agent wraps the camp up
    if (!advanceLive()) allowAdvance();
    agentSay(tr("Yes, let's continue.", "Sí, seguimos."));
  } else if (explain.get().how === "call" && inCall()) call.set({ state: "speaking" });
};

/**
 * The live agent dropped (network, the service) in the middle of a camp: the explanation goes
 * on from the same step with the local call (or the chat without a microphone), so the person
 * never sees it stop. Called by agent.ts.
 */
export async function continueWithoutAgent() {
  const s = explain.get();
  if (s.phase !== "playing" || s.how !== "call") return;
  const my = ++run;
  explain.set({ waiting: false, paused: false, saying: false, cutOff: false });
  if (!(await openingCall(() => startCall({ greet: false })))) {
    explain.set({ how: "chat" });
    openChat();
    chat.set({ busy: true });
  } else if (inCall()) call.set({ state: "speaking" });
  if (my !== run) return;
  await loop(my);
}
/** The person is exploring the visual: on a call, the countdown to the next step starts over. */
export const hold = () => {
  const s = explain.get();
  if (!s.waiting || s.until === null) return;
  if (live()) restartAuto();
  else explain.set({ until: performance.now() + AUTO_MS, waitFrom: performance.now() });
};
/** A chapter tapped: that step, from the top (also from the end, to look again). */
export function goTo(k: number) {
  const s = explain.get();
  if (live()) {
    explain.set({ phase: "playing" });
    jump(k);
    return;
  }
  if (s.phase === "done") {
    explain.set({ i: k, phase: "playing" });
    const my = ++run;
    if (s.how === "call" && inCall()) call.set({ state: "speaking" });
    if (s.how === "chat") chat.set({ busy: true });
    void loop(my);
    return;
  }
  jump(k);
}
/** A call's explanation is on screen: the mountain keeps its keys to itself. */
export const inTheater = () => {
  const s = explain.get();
  return s.how !== null && (s.phase === "playing" || s.phase === "done");
};
export const prev = () => jump(explain.get().i - 1);
export const repeat = () => jump(explain.get().i);

/** "No lo entiendo": the step again, said another way, then on. */
export async function notClear() {
  const s = explain.get();
  const b = s.beats[s.i];
  if (!b) return;
  takeWheel();
  if (live()) {
    explain.set({ paused: false, waiting: false });
    agentSay(tr("I didn't get that. Can you explain it more simply?", "No lo he entendido, ¿me lo explicas más fácil?"));
    return;
  }
  takeWheel();
  const my = ++run; // the old loop stops; this one picks up from here
  cut();
  explain.set({ paused: false, phase: "playing" });
  if (s.how === "chat") logMsg("you", tr("I don't get it", "No lo entiendo"), s.title);
  const again = b.simpler ?? tr(`Let me put it another way. ${b.say}`, `Te lo digo de otra forma. ${b.say}`);
  await sayBeat(b, my, again);
  if (my !== run) return;
  await wait(DWELL);
  explain.set((x) => ({ i: x.i + 1 }));
  if (s.how === "chat") chat.set({ busy: true });
  await loop(my);
}

// ---------------------------------------------------------------- talking over Cordi
// The person talks or writes during an explanation: Cordi stops right there, answers, asks if
// they go on, and waits. A yes (said, written, or "Seguimos") picks up where it was: the step it
// was cut off in, told again, or the next one if the step had finished.
const GO_ON_ES = ["¿Seguimos?", "¿Te parece si seguimos?", "¿Lo dejamos aquí o seguimos?", "¿Continuamos?", "Cuando quieras, seguimos."];
const GO_ON_EN = ["Shall we go on?", "Ready to keep going?", "Stop here, or carry on?", "Shall we continue?", "Whenever you're ready, we'll go on."];
let goOnTurn = 0;
const goOnLine = (couple: boolean) => {
  const list = tr(GO_ON_EN, GO_ON_ES);
  const l = list[goOnTurn++ % list.length];
  return couple ? l.replace("¿Te parece", "¿Os parece") : l;
};
let couple = false;
export const setCouple = (v: boolean) => {
  couple = v;
};

/** Is an explanation on screen that a question would interrupt? */
export const explaining = () => {
  const s = explain.get();
  return s.phase === "playing" || s.phase === "done";
};

/**
 * A question in the middle of an explanation. Returns once Cordi has answered and asked to go
 * on; the explanation itself resumes later, on the person's yes.
 */
/**
 * "Go back", "the previous one again", "step 2": which earlier step they want to see again, or
 * null. The screen goes there, Cordi tells it again, and moving on returns to where they were.
 */
export function earlierStep(q: string): number | null {
  const s = explain.get();
  // once the camp is done every step lies behind ("go back" is its last one); the live agent
  // leaves i on its last block there, the local player one past it, so both count from the end
  const at = s.phase === "done" ? s.beats.length : s.i;
  const n = q.match(/\b(?:step|paso|bloque)\s*(\d+)/i);
  if (n) {
    const k = Number(n[1]) - 1;
    return k >= 0 && k < at ? k : null;
  }
  if (at > 0 && /(previous|last one|one before|go back|back to the|again the|el anterior|la anterior|paso anterior|lo de antes|lo anterior|vuelve atr[aá]s|volver atr[aá]s|vuelve al|otra vez (el|la|lo) (de antes|anterior))/i.test(q)) return at - 1;
  return null;
}
function goBackTo(k: number, q: string) {
  const s = explain.get();
  logMsg("you", q, s.title);
  // the flag is already planted: the explanation has ended, so a jump alone moved nothing.
  // The same as tapping that step's chapter: it plays again from there
  if (s.phase === "done") goTo(k);
  else if (live()) moveLive(k);
  else jump(k);
}

export async function interject(question: string, wasMid?: boolean) {
  const s = explain.get();
  if (!explaining()) return false;
  const back = earlierStep(question);
  if (back !== null) {
    goBackTo(back, question);
    return true;
  }
  takeWheel();
  const midStep = wasMid ?? (s.saying || s.cutOff || (s.paused && !s.waiting));
  const my = ++run; // whatever was playing stops listening for its turn
  jumped = false;
  cut();
  releaseVoice();
  explain.set({ saying: false, fresh: false, paused: false, cutOff: false, waiting: false, redo: s.redo || midStep });
  const done = s.phase === "done";
  if (s.how === "call" && inCall()) {
    call.set({ state: "thinking" });
    orb.setEmo("thinking");
    logMsg("you", question, s.title);
    const answer = (await askCordi(question, s.title)) ?? voiceLine("placeholderAnswer");
    if (my !== run) return true;
    logMsg("cordi", answer, s.title);
    await sayInCall(answer);
    if (my !== run) return true;
    if (!done) {
      const ask = goOnLine(couple);
      logMsg("cordi", ask, s.title);
      await sayInCall(ask);
    }
    if (my !== run) return true;
    listenInCall();
  } else {
    chat.set({ busy: false, live: null });
    await converse(question, null, s.title);
    if (my !== run) return true;
    if (!done) await cordiWrites(goOnLine(couple), s.title, undefined, () => my === run);
    chat.set({ busy: false });
  }
  if (my !== run || done) return true;
  // waiting for the go-ahead
  explain.set({ waiting: true, until: null, waitFrom: performance.now() });
  while (my === run && explain.get().waiting && !jumped) await wait(80);
  if (my !== run) return true;
  const redo = explain.get().redo;
  explain.set({ redo: false });
  if (!jumped && !redo) explain.set((x) => ({ i: x.i + 1 }));
  if (explain.get().how === "call" && inCall()) call.set({ state: "speaking" });
  else chat.set({ busy: true });
  await loop(my);
  return true;
}

/**
 * Something written during an explanation. A clear "sí, seguimos" while it waits (or stopped)
 * goes on; anything else is a question. Writing on a call moves the explanation to the chat,
 * where the question and the answer can be read.
 */
export async function writeDuring(q: string) {
  const s = explain.get();
  if (!explaining()) return false;
  if (isGo(q) && (s.waiting || s.paused)) {
    logMsg("you", q, s.title);
    proceed();
    return true;
  }
  const back = earlierStep(q);
  if (back !== null) {
    goBackTo(back, q);
    return true;
  }
  const wasMid = s.saying || s.cutOff || (s.paused && !s.waiting);
  if (s.how === "call") {
    saveHow("chat");
    // the mode first, so hanging up doesn't read as leaving the explanation
    explain.set({ how: "chat" });
    run++;
    cut();
    hangUp();
    openChat();
  }
  return interject(q, wasMid);
}

/**
 * The person talked over Cordi but nothing came of it (a cough, a word the recognizer didn't
 * catch): Cordi carries on with the step instead of staying stopped.
 */
export function resumeCut() {
  const s = explain.get();
  if (!s.cutOff || s.how !== "call" || !inCall()) return false;
  explain.set({ paused: false, cutOff: false });
  call.set({ state: "speaking" });
  return true;
}

/** Stops what Cordi is saying right now, without ending the explanation. */
function cut() {
  if (explain.get().how === "call") stopLine();
}

/** From the top again (after "not clear" at the end), each step with its simpler wording. */
export async function replay() {
  const s = explain.get();
  if (!s.beats.length) return;
  if (live()) {
    explain.set({ phase: "playing", i: 0, waiting: false });
    agentSay(tr("That wasn't clear to me. Can you explain it again from the start, more slowly?", "No me ha quedado claro. ¿Me lo vuelves a explicar desde el principio, más despacio?"));
    return;
  }
  const my = ++run;
  explain.set({ phase: "playing", i: 0, paused: false, beats: s.beats.map((b) => (b.simpler ? { ...b, say: `${b.simpler} ${b.say}` } : b)) });
  if (s.how === "call" && inCall()) {
    call.set({ state: "speaking" });
    logMsg("cordi", tr("Let's go again, more slowly.", "Vamos otra vez, más despacio."), s.title);
    await sayInCall(tr("Let's go again, more slowly.", "Vamos otra vez, más despacio."));
  } else {
    chat.set({ busy: true });
    await cordiWrites(tr("Let's go again, more slowly.", "Vamos otra vez, más despacio."), s.title, undefined, () => my === run);
  }
  if (my === run) await loop(my);
}

/** On to the next camp's explanation, the same way (its button, or a "vamos" said at the end). */
export function goNextCamp() {
  const s = explain.get();
  if (!s.nextId) return;
  const to = s.nextId;
  const how = s.how ?? "call";
  tones.tap();
  leaveExplain();
  goExplain(to, how);
}

/** Ends this explanation but keeps the call on (on the way to the next camp's). */
export function leaveExplain() {
  cancelExplain();
  closePanel();
}

/**
 * "Leave": the explanation closes, the call hangs up, and the place is kept. Cordi says in one
 * line where it was left, so leaving never feels like losing it ("Continue (2/3)" picks it up).
 */
export function endExplain() {
  const s = explain.get();
  const how = s.how;
  // only worth saying from step 2 on (on step 1 there is nothing to pick up)
  const mid = s.phase === "playing" && s.i > 0 && s.i < s.beats.length - 1;
  if (mid) save(s.stepId, Math.min(s.i, s.beats.length - 1));
  cancelExplain();
  if (how === "call") hangUp();
  closePanel();
  if (mid)
    setTimeout(
      () => showBubble(tr(`Saved. We'll pick it up at step ${s.i + 1} of ${s.beats.length} whenever you like.`, `Guardado. Seguimos en el paso ${s.i + 1} de ${s.beats.length} cuando quieras.`), 3200),
      350,
    );
}

// hanging up ends a call's explanation too
call.subscribe(() => {
  const s = explain.get();
  if (opening) return;
  if (!inCall() && s.how === "call" && (s.phase === "playing" || s.phase === "done")) cancelExplain();
});
