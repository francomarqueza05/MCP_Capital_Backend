// The live voice agent: ElevenLabs "Cordada guide" (gemini-3.1-flash-lite and the
// eleven_v3_conversational voice, chosen by the benchmarks in bench/). It listens, thinks and
// speaks on its own, with its own turn-taking and barge-in; we feed it the phase brief and
// answer its tools:
//   show_block  -> the theater shows that step's visual (the agent says it in its own words)
//   lookup      -> figures from the plan on a topic
//   phase_done  -> the camp is explained: the check comes up, and the call goes on as free talk
// Its words show in the bubble on the audio's own per-character timing, and go to the
// conversation log. When it's not configured or can't connect, the local call takes over.
import { Conversation, stripAudioTags, type VoiceConversation } from "@elevenlabs/client";
import { isGo } from "@/explain/confirm";
import { createStore } from "@/lib/store";
import { getCase } from "@/data/cases";
import { tones } from "@/lib/audio";
import { orb } from "@/orb/engine";
import { remember, session, where } from "@/ai/client";
import { explain, reached, agentFinished, goNextCamp, nextCampAfter, continueWithoutAgent, nextFrom } from "@/explain/player";
import { call } from "./call";
import { chat, logMsg } from "./chat";
import { captionsOn, holdBubble, hideBubble, noteInBubble, speech } from "./stage";
import { lang, tr } from "@/lib/lang";

/** A goodbye: the only thing that lets the agent end the call from the map. */
const BYE = /\b(bye|goodbye|see you|that'?s all|i'?m done|we'?re done|thanks?,? that'?s it|stop the call|hang up|adi[oó]s|hasta luego|hasta pronto|eso es todo|ya est[aá] por hoy|cuelga|terminamos)\b/i;

export const agent = createStore({ mode: null as "explain" | "free" | null });

let conv: VoiceConversation | null = null;
let raf = 0;
let ending = false;
/**
 * The caption runs on one clock. Each character of the audio is due when its chunk started
 * playing (the SDK's chunk_start, sent by the audio worklet as the chunk begins), plus its
 * offset in the chunk, plus the device's output latency (what's played still takes that long
 * to reach the ear). Every frame shows whatever is due: no timer per character to drift.
 */
const cues: { at: number; ch: string }[] = [];
let outLatency = 0;
function measureLatency() {
  try {
    const ctx = new AudioContext();
    outLatency = ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000;
    void ctx.close();
  } catch {
    outLatency = 0;
  }
}
let expected = 1; // rough length of what the agent is saying now, for the visual's build-up

// The caption is exactly what's heard: the audio's own characters, each shown when it plays
// (the written reply says "$18.000" where the voice says "dieciocho mil", so counting the
// written text against the audio drifts). Each reply starts a clean caption.
let said = ""; // the current reply's text, as the agent wrote it (for the log)
let heard = 0; // how many characters have played
let aligned = ""; // the characters as spoken, in order
let lastCharAt = 0;

// Moving on is the person's call: the "Seguimos" button, or a clear yes said out loud.
let allowNext = false;
let lastUser = "";
let shownAny = false;
/** The person pressed "Seguimos": the agent may show the next block. */
export const allowAdvance = () => {
  allowNext = true;
};

export const agentActive = () => conv !== null;

/**
 * On to another camp's explanation on the same call (before, the agent was never told: it
 * kept talking freely about the next camp while the screen didn't move). It gets that camp's
 * brief, its first block goes on screen, and it's asked to explain it.
 */
async function rearm(campId: string, from: number, title: string) {
  const brief = await tool({ tool: "explain_brief", campId, from, said: where().said ?? [] });
  if (!conv) return;
  agent.set({ mode: "explain" });
  allowNext = false;
  lastUser = "";
  shownAny = false;
  const ex = explain.get();
  const at = Math.min(from, ex.beats.length - 1);
  showBlock(at);
  conv.sendContextualUpdate(
    `NEW PHASE. The explanation of the previous camp is over; now explain "${title}". ${brief}
The screen already shows block "${ex.beats[at].id}". Explain it now, then go block by block with show_block as before.`,
  );
  agentSay(tr(`Let's do ${title.toLowerCase()}.`, `Vamos con ${title.toLowerCase()}.`));
}

/**
 * Never stuck on silence. After a block goes on screen the agent should start talking within a
 * few seconds. If it doesn't, it gets one nudge; if it still says nothing, the step is marked
 * as told so "Continue" lights up, and the screen moves on without it if needed.
 */
const SILENT_MS = 6500;
let silentTimer: ReturnType<typeof setTimeout> | null = null;
function clearSilence() {
  if (silentTimer) clearTimeout(silentTimer);
  silentTimer = null;
}
function watchSilence(nudged = false) {
  clearSilence();
  silentTimer = setTimeout(() => {
    silentTimer = null;
    if (!conv || explain.get().paused || call.get().state === "speaking") return;
    const ex = explain.get();
    if (ex.phase !== "playing") return;
    if (!nudged) {
      conv.sendContextualUpdate(`The screen shows block "${ex.beats[ex.i]?.id}" and you have not said anything yet. Explain it now, in one to three short sentences.`);
      conv.sendUserActivity();
      watchSilence(true);
      return;
    }
    // still nothing: free the screen, the person moves on with "Continue"
    explain.set({ saying: false, fresh: false, waiting: true, until: null });
    speech.set({ p: 1 });
  }, SILENT_MS);
}

/**
 * Cordi keeps the pace, like an advisor in the room. After a step is told and the person says
 * nothing for AUTO_MS, it moves on by itself (the "Continue" button fills up meanwhile, so it's
 * no surprise). Anyone talking, a question, or the pause stops it; after an answer the count
 * starts again. Families shouldn't have to know there is a button to press.
 */
export const AUTO_MS = 6500;
let autoTimer: ReturnType<typeof setTimeout> | null = null;
let greeted = false; // the agent has spoken once on this call (its greeting)
let voiceAt = 0; // last time the person's microphone heard someone
function clearAuto() {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = null;
  if (explain.get().until !== null) explain.set({ until: null });
}
function armAuto(ms = AUTO_MS) {
  clearAuto();
  const ex = explain.get();
  if (!conv || agent.get().mode !== "explain" || ex.phase !== "playing" || ex.paused) return;
  explain.set({ until: performance.now() + ms, waitFrom: performance.now() });
  autoTimer = setTimeout(() => {
    autoTimer = null;
    const now = explain.get();
    if (!conv || now.phase !== "playing" || now.paused || call.get().state !== "listening") return clearAuto();
    // someone is still talking: give them time
    if (performance.now() - voiceAt < 1500) return armAuto(2500);
    explain.set({ until: null, waiting: false });
    // the next block goes on screen; after the last one, the agent wraps the camp up
    if (!advanceLive()) {
      allowAdvance();
      conv.sendUserMessage(tr("OK, let's wrap this one up.", "Vale, cerremos este tramo."));
    }
  }, ms);
}

/** The person is exploring the chart: the countdown starts over, it never moves on under them. */
export const restartAuto = () => {
  if (autoTimer) armAuto();
};

/** Puts block `to` on screen: what follows is the step itself, so the visual builds with it. */
function showBlock(to: number) {
  watchSilence();
  const ex = explain.get();
  allowNext = false;
  lastUser = "";
  shownAny = true;
  explain.set({ i: to, waiting: false, fresh: true });
  reached(to);
  expected = Math.max(40, ex.beats[to].say.length);
  speech.set((s) => ({ p: 0, key: s.key + 1 }));
}

/**
 * The person moved on ("Seguimos", or a clear yes out loud): the next block goes on screen
 * right here, never left to the model remembering to call show_block (it sometimes answered
 * without it, and the step stayed put). The agent is told it's already showing. False on the
 * last block (there the agent wraps up the camp itself).
 */
/**
 * The person moved to step `to` (an arrow, a chapter): the block goes on screen at once and
 * the agent is told to explain it. For a while after, the agent can't pull the screen back to
 * an earlier block (a show_block it had on its way would otherwise undo the person's click).
 */
let userMovedAt = 0;
export function moveLive(to: number): boolean {
  const ex = explain.get();
  if (!conv || agent.get().mode !== "explain" || to < 0 || to >= ex.beats.length) return false;
  userMovedAt = performance.now();
  showBlock(to);
  conv.sendContextualUpdate(`The person moved the screen to block "${ex.beats[to].id}". Stop what you were saying and explain that block now, in your own words. Do not call show_block for it.`);
  return true;
}

export function advanceLive(): boolean {
  const ex = explain.get();
  const to = nextFrom(ex.i);
  if (!conv || agent.get().mode !== "explain" || to >= ex.beats.length) return false;
  const back = to !== ex.i + 1; // returning from a detour to an earlier block
  showBlock(to);
  conv.sendContextualUpdate(
    back
      ? `The screen is back on block "${ex.beats[to].id}", where the person was before going back. Say in a few words that you are back where you were, then pick it up from there. Do not call show_block for it.`
      : `The screen now shows block "${ex.beats[to].id}". Explain that block now, in your own words. Do not call show_block for it again.`,
  );
  return true;
}

const topic = () => (agent.get().mode === "explain" ? explain.get().title : tr("Call with Cordi", "Llamada con Cordi"));

/**
 * Pause on the live agent. The SDK can't pause a conversation, and left in silence the agent
 * keeps asking "¿sigues ahí?". So while paused: it's told to stay quiet, its voice and the
 * person's mic are off, and a heartbeat of "the user is active" keeps its silence timer from
 * firing. Resuming puts the voice and the mic back as the person had them.
 */
let pauseBeat: ReturnType<typeof setInterval> | null = null;
let pausedMid = false; // paused while Cordi was telling the step (it kept going, muted)
let holdBlock = false; // resumed mid-step: no moving on until that step has been told again
let wasPaused = false;
let watching = false;
/**
 * Follows the explanation's pause, whatever sets or clears it (the button, Space, a step
 * tapped, "No lo entiendo", leaving): the agent is never left mute after a pause ends.
 */
function watchPause() {
  wasPaused = explain.get().paused;
  if (watching) return;
  watching = true;
  explain.subscribe(() => {
    const p = explain.get().paused;
    if (p === wasPaused) return;
    wasPaused = p;
    const c = call.get();
    agentPause(p, { muted: c.muted, quiet: c.quiet });
  });
}
function agentPause(on: boolean, restore: { muted: boolean; quiet: boolean }) {
  if (!conv) return;
  if (on) {
    clearAuto();
    pausedMid = explain.get().saying || call.get().state === "speaking";
    conv.sendContextualUpdate(`The person paused the explanation. Stay completely silent: do not speak and do not ask whether they are still there, until they say \"${tr("OK, go on.", "Ya está, sigue.")}\"`);
    conv.setVolume({ volume: 0 });
    conv.setMicMuted(true);
    pauseBeat ??= setInterval(() => conv?.sendUserActivity(), 1000);
    return;
  }
  if (pauseBeat) clearInterval(pauseBeat);
  pauseBeat = null;
  conv.setVolume({ volume: restore.quiet ? 0 : 1 });
  conv.setMicMuted(restore.muted);
  const ex = explain.get();
  if (agent.get().mode !== "explain" || ex.phase !== "playing") return;
  if (pausedMid) {
    // the agent finished that step into the silence: it tells it again, from where it was cut,
    // and the screen can't move on until it has
    holdBlock = true;
    lastUser = "";
    explain.set({ fresh: false, waiting: false });
    conv.sendContextualUpdate(`The person paused you in the middle of block "${ex.beats[ex.i].id}" and did not hear the rest. Do NOT move on and do NOT call show_block. Pick block "${ex.beats[ex.i].id}" up from where you were cut, briefly.`);
    conv.sendUserMessage(tr("Sorry, I paused. Can you finish this part?", "Perdona, lo había pausado. ¿Terminas esta parte?"));
  } else armAuto();
}

function stopCaption() {
  cues.length = 0;
}
/** Shows what's due by now on the caption's clock (called every frame). */
function tickCaption() {
  const now = performance.now();
  let moved = false;
  while (cues.length && cues[0].at <= now) {
    const c = cues.shift()!;
    heard++;
    aligned += c.ch;
    lastCharAt = now;
    moved = true;
    if (c.ch === " ") orb.pulse(0.35, 0.8);
  }
  if (moved) render();
}
function newReply() {
  stopCaption();
  said = "";
  heard = 0;
  aligned = "";
}

/**
 * What's been heard of the reply so far. A word shows the moment it starts being said (the
 * rest of it is taken from what's queued), so the text is never behind the voice; the bubble
 * keeps the last couple of lines. Shown only when subtitles are on (Cordi silenced); the
 * visual's build-up follows the voice either way.
 */
function render() {
  if (explain.get().paused) return; // paused: nothing Cordi might say shows up
  let raw = aligned;
  if (raw && !/\s$/.test(raw)) {
    for (const c of cues) {
      if (/\s/.test(c.ch)) break;
      raw += c.ch;
    }
  }
  // an audio tag still being said ("[lau…") isn't shown half-way
  let text = stripAudioTags(raw).replace(/\[[^\]]*$/, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return;
  if (agent.get().mode === "explain") speech.set({ p: Math.min(1, text.length / expected) });
  if (!captionsOn()) return;
  const tail = text.length > 170 ? `…${text.slice(text.length - 170).replace(/^\S*\s/, "")}` : text;
  noteInBubble(tail);
}

/** Opens the call. Resolves false when the agent isn't available (the caller falls back). */
export async function startAgent(opts: { mode: "explain" | "free"; campId?: string; from?: number; title?: string }) {
  if (conv) {
    // the call stayed open on the way here: the agent learns this camp, as at the start
    if (opts.mode === "explain" && opts.campId) await rearm(opts.campId, opts.from ?? 0, opts.title ?? "");
    return true;
  }
  ending = false;
  measureLatency();
  allowNext = false;
  lastUser = "";
  shownAny = false;
  greeted = false;
  newReply();
  call.set({ state: "connecting", t0: Date.now(), error: "" });
  holdBubble(true);
  orb.setEmo("curious");

  const history = where().said ?? [];
  const r = await fetch("/api/agent/session", {
    signal: AbortSignal.timeout(10000),
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      caseId: session.get().caseId,
      mode: opts.mode,
      campId: opts.campId,
      camp: session.get().camp || undefined,
      from: opts.from ?? 0,
      said: history,
      known: where().known,
      // the conversation so far (chat or an earlier call), questions and answers
      recent: chat
        .get()
        .msgs.slice(-10)
        .map((m) => ({ who: m.who, text: m.text })),
    }),
  }).catch(() => null);
  if (!r?.ok) return fail();
  const { signedUrl, dynamicVariables } = await r.json();

  const we = getCase(session.get().caseId).household.couple;
  const first =
    opts.mode === "explain"
      ? opts.from
        ? tr(`OK, let's pick up ${opts.title?.toLowerCase()} where we left off.`, `Vale, seguimos con ${opts.title?.toLowerCase()} donde lo dejamos.`)
        : tr(`OK, let's do ${opts.title?.toLowerCase()}. You can stop me any time.`, `Vale, vamos con ${opts.title?.toLowerCase()}. ${we ? "Interrumpidme" : "Interrúmpeme"} cuando ${we ? "queráis" : "quieras"}.`)
      : tr("I'm here. What would you like to look at in your plan?", `Aquí estoy. ¿Qué ${we ? "queréis" : "quieres"} que veamos de ${we ? "vuestro" : "tu"} plan?`);

  agent.set({ mode: opts.mode });
  watchPause();
  try {
    // a connection that never opens must not freeze the explanation: give up after 12 s and
    // let the caller fall back to the local call
    const opening = Conversation.startSession({
      signedUrl,
      connectionType: "websocket",
      dynamicVariables,
      overrides: { agent: { language: lang(), firstMessage: first } },
      clientTools: {
        show_block: ({ block }: { block: string }) => {
          const ex = explain.get();
          const i = ex.beats.findIndex((b) => b.id === block);
          if (i < 0) return;
          // forward only with the person's go-ahead; the first block, the same one, or going
          // back are always fine
          const forward = shownAny && i > ex.i;
          // the person just moved the screen themselves: an older block from the agent doesn't undo it
          if (i < ex.i && performance.now() - userMovedAt < 10000) {
            conv?.sendContextualUpdate(`The screen stays on block "${ex.beats[ex.i].id}", where the person moved it. Explain that one.`);
            return;
          }
          // the person spoke since the step was shown and it wasn't a question: the agent heard a
          // go-ahead in it (a yes isGo doesn't know). Blocking it here left Cordi telling the
          // next step over the old visual
          const said = lastUser.trim().length > 0 && !/[¿?]/.test(lastUser);
          if (forward && (holdBlock || (!allowNext && !isGo(lastUser) && !said))) {
            conv?.sendContextualUpdate(
              `BLOCKED: the person has not asked to move on. Stay on block "${ex.beats[ex.i].id}" and wait, without asking if they want to continue: they move on with the on-screen button (it arrives as "${tr("Yes, let's continue.", "Sí, seguimos.")}") or by saying so.`,
            );
            return;
          }
          if (forward && i > ex.i + 1) conv?.sendContextualUpdate("Move one block at a time: show the next block, not a later one.");
          // forward from a detour goes back to where the person was
          showBlock(forward ? nextFrom(ex.i) : i);
        },
        lookup: async ({ topic: t }: { topic: string }) => tool({ tool: "lookup", topic: t, mode: agent.get().mode === "explain" ? "explain" : "map", known: where().known }),
        phase_done: async () => {
          if (agent.get().mode === "explain") {
            agentFinished();
            agent.set({ mode: "free" });
            // what comes next is the same camp the screen's "Siguiente" button offers
            const ahead = nextCampAfter(getCase(session.get().caseId), explain.get().stepId);
            return tool({ tool: "next_brief", campId: explain.get().stepId, camp: explain.get().title, next: ahead?.title ?? null, said: where().said, known: where().known });
          }
          // On the map the agent may only end the call when the person says goodbye. A "continue"
          // (or anything else) right after a camp used to land here, the call hung up, and that
          // closed the next camp's explanation the moment it started.
          const ex = explain.get();
          const busy = ex.phase === "playing" || ex.phase === "choose" || ex.phase === "done" || Boolean(ex.nextId);
          if (!busy && BYE.test(lastUser)) {
            ending = true;
            return "END";
          }
          return "Do NOT end the call and do not say goodbye. The person is still here: the app moves the screen (the next camp may be starting right now). Keep going with what is on screen, or answer briefly and wait.";
        },
      },
      onModeChange: ({ mode }) => {
        if (!conv && mode) return;
        if (mode === "speaking") {
          greeted = true;
          clearSilence();
          clearAuto();
          // no reply-start event seen (or a long pause): a new caption
          if (performance.now() - lastCharAt > 1500) newReply();
          call.set({ state: "speaking" });
          orb.setEmo("speaking");
          if (explain.get().phase === "playing") explain.set({ saying: true, waiting: false });
        } else {
          call.set({ state: "listening" });
          orb.setEmo("listening");
          // the step has been told: anything said after it leaves the visual whole
          if (explain.get().phase === "playing") explain.set({ saying: false, fresh: false, waiting: true, until: null });
          holdBlock = false;
          speech.set({ p: 1 });
          if (agent.get().mode === "explain" && explain.get().phase === "playing") {
            // just said hello and nothing is on screen yet: straight into the first block,
            // instead of waiting for the person to speak
            if (!shownAny && greeted) {
              const at = Math.min(explain.get().i, explain.get().beats.length - 1);
              showBlock(at);
              conv?.sendContextualUpdate(`The screen now shows block "${explain.get().beats[at].id}". Explain it now.`);
              conv?.sendUserMessage(tr("Go ahead.", "Adelante."));
            } else armAuto();
          }
          if (ending) setTimeout(() => endAgent(), 600);
        }
      },
      // the reply's text as it's written (before its audio): the caption's spelling
      onAgentChatResponsePart: ({ text, type }) => {
        if (type === "start") newReply();
        else if (type === "delta") said += text;
      },
      // its audio as it plays: how much of the text has been heard
      onAudioAlignmentPlayback: ({ alignment }) => {
        const t0 = performance.now() + outLatency;
        alignment.chars.forEach((ch, k) => cues.push({ at: t0 + (alignment.char_start_times_ms[k] ?? 0), ch }));
      },
      // talked over: the caption stops where the voice stopped
      onInterruption: () => stopCaption(),
      onMessage: ({ message, role }) => {
        if (!message) return;
        if (role === "agent") {
          if (explain.get().paused) return; // said into the pause: not part of the conversation
          if (message.length > said.length) said = message; // the final text wins
          logMsg("cordi", stripAudioTags(message), topic());
          remember(stripAudioTags(message));
        } else {
          lastUser = message;
          clearAuto();
          logMsg("you", message, topic());
          // a clear "sí, seguimos" said out loud while the step waits: on to the next one
          if (explain.get().phase === "playing" && explain.get().waiting && isGo(message)) advanceLive();
          // the camp is done and the person says "vamos": on to the next camp, like its button
          else if (explain.get().phase === "done" && explain.get().nextId && isGo(message)) {
            conv?.sendContextualUpdate(`The person wants to go on to the next camp: it is on its way on screen. Answer only with a very short bridge (\"${tr("Let's go!", "¡Vamos allá!")}\") and wait: its explanation starts as soon as it arrives.`);
            goNextCamp();
          }
        }
      },
      onDisconnect: () => {
        if (!conv) return;
        // dropped mid-camp: the explanation carries on locally from the same step
        const mid = explain.get().phase === "playing" && agent.get().mode === "explain";
        endAgent(true);
        if (mid) void continueWithoutAgent();
      },
      onError: (m) => console.error("agent", m),
    });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 12000));
    const opened = (await Promise.race([opening, timeout])) as VoiceConversation | null;
    if (!opened) {
      // it may still open later: close it then, so no second voice turns up
      void opening.then((c) => c.endSession()).catch(() => {});
      throw new Error("agent session timed out");
    }
    conv = opened;
  } catch (e) {
    // expected (no microphone permission, service down): the local call takes over
    console.warn("agent start", e);
    return fail();
  }
  if (call.get().quiet) conv?.setVolume({ volume: 0 });
  tones.soft();
  // the orb breathes with the voices: Cordi's when it speaks, yours when it listens
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!conv) return;
    tickCaption();
    const speaking = call.get().state === "speaking";
    orb.listening = !speaking;
    const input = call.get().muted ? 0 : conv.getInputVolume();
    if (!speaking && input > 0.06) voiceAt = performance.now();
    orb.level = Math.min(1, (speaking ? conv.getOutputVolume() : input) * 2.2);
  };
  loop();
  return true;
}

function fail() {
  agent.set({ mode: null });
  holdBubble(false);
  call.set({ state: "idle" });
  return false;
}

async function tool(body: Record<string, unknown>) {
  const r = await fetch("/api/agent/tool", {
    signal: AbortSignal.timeout(6000),
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ caseId: session.get().caseId, ...body }),
  }).catch(() => null);
  return r?.ok ? String((await r.json()).result ?? "") : "The plan does not say. Suggest asking their advisor.";
}

/** Hangs up the agent (the call bar's hang-up, or the agent ending it). */
export async function endAgent(dropped = false) {
  const c = conv;
  conv = null;
  clearSilence();
  clearAuto();
  if (pauseBeat) clearInterval(pauseBeat);
  pauseBeat = null;
  cancelAnimationFrame(raf);
  newReply();
  agent.set({ mode: null });
  if (c && !dropped) await c.endSession().catch(() => {});
  orb.listening = false;
  orb.level = 0;
  holdBubble(false);
  hideBubble();
  if (call.get().state !== "idle") {
    call.set({ state: "idle" });
    tones.tap();
    orb.setEmo("neutral");
  }
}

// ---------------------------------------------------------------- what the person does
/** Says something as the person (a button standing in for their voice). */
export const agentSay = (text: string) => {
  lastUser = text;
  logMsg("you", text, topic());
  conv?.sendUserMessage(text);
};
/** Tells the agent something without a turn (what they're doing on screen). */
export const agentNote = (text: string) => conv?.sendContextualUpdate(text);
export const agentMute = (muted: boolean) => conv?.setMicMuted(muted);
/** Silences Cordi's own voice on the live agent (the conversation goes on). */
export const agentQuiet = (quiet: boolean) => conv?.setVolume({ volume: quiet ? 0 : 1 });
