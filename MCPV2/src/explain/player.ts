// Plays "Explícame esto". First Cordi asks how: by chat or by call. Then it walks through the
// camp's beats on its own, one visual and one line at a time, with a short pause between them.
// The person can pause, go back, skip ahead, hear a step again, or say "no lo entiendo" and get
// it said another way. Talking over Cordi on a call pauses it. At the end: "is it clear?".
import type { Case } from "@/data/cases";
import type { Step } from "@/expedition/steps";
import { prefetchSpeech, tones } from "@/lib/audio";
import { createStore, wait } from "@/lib/store";
import { orb } from "@/orb/engine";
import { call, hangUp, inCall, listenInCall, sayInCall, startCall, stopLine } from "@/stage/call";
import { chat, closePanel, cordiWrites, logMsg, openChat } from "@/stage/chat";
import { showBubble } from "@/stage/stage";
import { agentActive, agentSay, allowAdvance, startAgent } from "@/stage/agent";
import { checkAI } from "@/ai/client";
import { beatsFor, type Beat } from "./beats";

export type How = "chat" | "call";
type Phase = "off" | "choose" | "playing" | "done";

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
   * On a call, after each step Cordi waits ("¿Seguimos?") so the visual can be explored.
   * `until` is when it moves on by itself; null once the person has touched the visual, so it
   * waits for them.
   */
  waiting: false,
  until: null as number | null,
  /** Where to start: 0, or the step saved from last time ("seguir donde lo dejé"). */
  from: 0,
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

const save = (stepId: string, i: number) => {
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
let jumped = false; // a control moved the position: the loop shouldn't advance on its own

const DWELL = 1300; // pause after each beat in the chat, so the visual can be read

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
  explain.set({ phase: "choose", how: null, stepId: step.id, title: step.title, beats, i: 0, from: saved > 0 && saved < beats.length ? saved : 0, paused: false, saying: false });
  if (quiet) return;
  orb.setEmo("curious");
  orb.hop(0.5);
  showBubble(`¿Te lo explico por chat o por llamada?`, 5000);
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
    if ((await checkAI()).agent && (await startAgent({ mode: "explain", campId: s.stepId, from: i, title: s.title }))) return;
    if (my !== run) return;
    if (!(await startCall({ greet: false }))) {
      explain.set({ how: "chat" });
      openChat();
    }
  } else {
    openChat();
    logMsg("you", "Sigamos por escrito", s.title);
  }
  if (my !== run) return;
  if (explain.get().how === "chat") chat.set({ busy: true });
  explain.set({ i });
  await loop(my);
}

export function cancelExplain() {
  run++;
  explain.set({ phase: "off", paused: false, saying: false, waiting: false, until: null });
  chat.set({ busy: false, live: null });
  orb.setEmo("neutral");
}

export async function startExplain(how: How) {
  const s = explain.get();
  if (s.phase !== "choose" || !s.beats.length) return;
  const my = ++run;
  tones.tap();
  orb.spinOnce();
  const from = s.from;
  explain.set({ phase: "playing", how, i: from, paused: false });
  if (how === "call" && (await checkAI()).agent) {
    // the live agent narrates in its own words and moves the visuals with show_block
    if (await startAgent({ mode: "explain", campId: s.stepId, from, title: s.title })) return;
    if (my !== run) return;
  }
  if (how === "chat") {
    openChat();
    chat.set({ busy: true });
    logMsg("you", from ? `Sigamos con ${s.title.toLowerCase()}` : `Explícame ${s.title.toLowerCase()}`, s.title);
  } else if ((prefetchSpeech(s.beats[from].say), !(await startCall({ greet: false })))) {
    // no microphone: carry on in the chat instead
    explain.set({ how: "chat" });
    openChat();
    chat.set({ busy: true });
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
  const text = `Seguimos donde lo dejamos, en el paso ${from + 1} de ${s.beats.length}.${gist ? ` Lo último que vimos: ${gist}` : ""}`;
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
    if (s.how === "call" && !s.paused && (call.get().state === "listening" || call.get().state === "thinking")) explain.set({ paused: true });
    if (explain.get().paused) {
      await wait(120);
      continue;
    }
    jumped = false;
    save(s.stepId, s.i);
    const whole = await sayBeat(s.beats[s.i], my);
    if (my !== run) return;
    if (!whole) {
      // cut off (talked over on a call): wait for the person to resume
      explain.set({ paused: true });
      continue;
    }
    if (s.how === "call" || s.how === "chat") {
      // "¿Seguimos?": the visual stays to be explored; on by itself only if left untouched
      // the on-screen bar asks "¿Seguimos?": Cordi doesn't say it after every step
      // it waits for "Seguimos" (or a chapter, an arrow, "No lo entiendo"): never on its own
      explain.set({ waiting: true, until: null });
      // in the chat, the person can write to Cordi while it waits; on a call, Cordi listens
      // (a spoken "sí, seguimos" moves on; anything else is a question it answers)
      if (s.how === "chat") chat.set({ busy: false });
      else listenInCall();
      while (my === run && explain.get().waiting && !jumped) {
        const u = explain.get().until;
        if (u !== null && !explain.get().paused && performance.now() > u) break;
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
    if (!jumped && !explain.get().paused) explain.set((x) => ({ i: x.i + 1 }));
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
  explain.set({ saying: true });
  let whole = true;
  if (s.how === "call" && inCall()) {
    logMsg("cordi", text, s.title, b.visual);
    whole = await sayInCall(text);
  } else {
    await cordiWrites(text, s.title, b.visual, () => my === run && !jumped);
  }
  explain.set({ saying: false });
  return whole && my === run;
}

async function finish(my: number) {
  const s = explain.get();
  clear(s.stepId);
  explain.set({ phase: "done", saying: false });
  const close = "¿Te ha quedado claro? Si algo no, pregúntame lo que quieras.";
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
export const togglePause = () => {
  const p = !explain.get().paused;
  if (live()) {
    explain.set({ paused: p });
    agentSay(p ? "Espera un momento, por favor." : "Ya está, sigue.");
    return;
  }
  // resuming on a call takes the turn back from listening
  if (!p && explain.get().how === "call" && inCall()) call.set({ state: "speaking" });
  explain.set({ paused: p });
  if (p) orb.setEmo("neutral");
};

function jump(to: number) {
  const s = explain.get();
  const i = Math.max(0, Math.min(s.beats.length - 1, to));
  if (live()) {
    explain.set({ i, paused: false, waiting: false });
    agentSay(i === s.i ? "¿Me lo repites?" : `Vamos al bloque ${s.beats[i].id}.`);
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
  explain.set({ waiting: false, until: null });
  if (live()) {
    allowAdvance();
    agentSay("Sí, seguimos.");
  } else if (explain.get().how === "call" && inCall()) call.set({ state: "speaking" });
};
/** The person is exploring the visual: Cordi waits for them instead of moving on. */
export const hold = () => {
  const s = explain.get();
  if (s.waiting && s.until !== null) explain.set({ until: null });
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
  if (live()) {
    explain.set({ paused: false, waiting: false });
    agentSay("No lo he entendido, ¿me lo explicas más fácil?");
    return;
  }
  const my = ++run; // the old loop stops; this one picks up from here
  cut();
  explain.set({ paused: false, phase: "playing" });
  if (s.how === "chat") logMsg("you", "No lo entiendo", s.title);
  const again = b.simpler ?? `Te lo digo de otra forma. ${b.say}`;
  await sayBeat(b, my, again);
  if (my !== run) return;
  await wait(DWELL);
  explain.set((x) => ({ i: x.i + 1 }));
  if (s.how === "chat") chat.set({ busy: true });
  await loop(my);
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
    agentSay("No me ha quedado claro. ¿Me lo vuelves a explicar desde el principio, más despacio?");
    return;
  }
  const my = ++run;
  explain.set({ phase: "playing", i: 0, paused: false, beats: s.beats.map((b) => (b.simpler ? { ...b, say: `${b.simpler} ${b.say}` } : b)) });
  if (s.how === "call" && inCall()) {
    call.set({ state: "speaking" });
    logMsg("cordi", "Vamos otra vez, más despacio.", s.title);
    await sayInCall("Vamos otra vez, más despacio.");
  } else {
    chat.set({ busy: true });
    await cordiWrites("Vamos otra vez, más despacio.", s.title, undefined, () => my === run);
  }
  if (my === run) await loop(my);
}

export function endExplain() {
  const how = explain.get().how;
  cancelExplain();
  if (how === "call") hangUp();
  closePanel();
}

// hanging up ends a call's explanation too
call.subscribe(() => {
  const s = explain.get();
  if (!inCall() && s.how === "call" && (s.phase === "playing" || s.phase === "done")) cancelExplain();
});
