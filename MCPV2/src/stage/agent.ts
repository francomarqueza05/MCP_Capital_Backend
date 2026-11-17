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
import { explain, reached, agentFinished, goNextCamp, nextCampAfter } from "@/explain/player";
import { call } from "./call";
import { chat, logMsg } from "./chat";
import { captionsOn, holdBubble, hideBubble, noteInBubble, speech } from "./stage";

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
  agentSay(`Vamos con ${title.toLowerCase()}.`);
}

/** Puts block `to` on screen: what follows is the step itself, so the visual builds with it. */
function showBlock(to: number) {
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
export function advanceLive(): boolean {
  const ex = explain.get();
  const to = ex.i + 1;
  if (!conv || agent.get().mode !== "explain" || to >= ex.beats.length) return false;
  showBlock(to);
  conv.sendContextualUpdate(`The screen now shows block "${ex.beats[to].id}". Explain that block now, in your own words. Do not call show_block for it again.`);
  return true;
}

const topic = () => (agent.get().mode === "explain" ? explain.get().title : "Llamada con Cordi");

/**
 * Pause on the live agent. The SDK can't pause a conversation, and left in silence the agent
 * keeps asking "¿sigues ahí?". So while paused: it's told to stay quiet, its voice and the
 * person's mic are off, and a heartbeat of "the user is active" keeps its silence timer from
 * firing. Resuming puts the voice and the mic back as the person had them.
 */
let pauseBeat: ReturnType<typeof setInterval> | null = null;
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
    conv.sendContextualUpdate("The person paused the explanation. Stay completely silent: do not speak and do not ask whether they are still there, until they say \"Ya está, sigue.\"");
    conv.setVolume({ volume: 0 });
    conv.setMicMuted(true);
    pauseBeat ??= setInterval(() => conv?.sendUserActivity(), 1000);
    return;
  }
  if (pauseBeat) clearInterval(pauseBeat);
  pauseBeat = null;
  conv.setVolume({ volume: restore.quiet ? 0 : 1 });
  conv.setMicMuted(restore.muted);
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
  newReply();
  call.set({ state: "connecting", t0: Date.now(), error: "" });
  holdBubble(true);
  orb.setEmo("curious");

  const history = where().said ?? [];
  const r = await fetch("/api/agent/session", {
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
        ? `Vale, seguimos con ${opts.title?.toLowerCase()} donde lo dejamos.`
        : `Vale, vamos con ${opts.title?.toLowerCase()}. ${we ? "Interrumpidme" : "Interrúmpeme"} cuando ${we ? "queráis" : "quieras"}.`
      : `Aquí estoy. ¿Qué ${we ? "queréis" : "quieres"} que veamos de ${we ? "vuestro" : "tu"} plan?`;

  agent.set({ mode: opts.mode });
  watchPause();
  try {
    conv = (await Conversation.startSession({
      signedUrl,
      connectionType: "websocket",
      dynamicVariables,
      overrides: { agent: { language: "es", firstMessage: first } },
      clientTools: {
        show_block: ({ block }: { block: string }) => {
          const ex = explain.get();
          const i = ex.beats.findIndex((b) => b.id === block);
          if (i < 0) return;
          // forward only with the person's go-ahead; the first block, the same one, or going
          // back are always fine
          const forward = shownAny && i > ex.i;
          // the person spoke since the step was shown and it wasn't a question: the agent heard a
          // go-ahead in it (a yes isGo doesn't know). Blocking it here left Cordi telling the
          // next step over the old visual
          const said = lastUser.trim().length > 0 && !/[¿?]/.test(lastUser);
          if (forward && !allowNext && !isGo(lastUser) && !said) {
            conv?.sendContextualUpdate(
              `BLOCKED: the person has not asked to move on. Stay on block "${ex.beats[ex.i].id}" and wait, without asking if they want to continue: they move on with the on-screen button (it arrives as "Sí, seguimos.") or by saying so.`,
            );
            return;
          }
          if (forward && i > ex.i + 1) conv?.sendContextualUpdate("Move one block at a time: show the next block, not a later one.");
          showBlock(forward ? ex.i + 1 : i);
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
          ending = true;
          return "END";
        },
      },
      onModeChange: ({ mode }) => {
        if (!conv && mode) return;
        if (mode === "speaking") {
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
          speech.set({ p: 1 });
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
          logMsg("you", message, topic());
          // a clear "sí, seguimos" said out loud while the step waits: on to the next one
          if (explain.get().phase === "playing" && explain.get().waiting && isGo(message)) advanceLive();
          // the camp is done and the person says "vamos": on to the next camp, like its button
          else if (explain.get().phase === "done" && explain.get().nextId && isGo(message)) {
            conv?.sendContextualUpdate("The person wants to go on to the next camp: it is on its way on screen. Answer only with a very short bridge (\"¡Vamos allá!\") and wait: its explanation starts as soon as it arrives.");
            goNextCamp();
          }
        }
      },
      onDisconnect: () => {
        if (conv) endAgent(true);
      },
      onError: (m) => console.error("agent", m),
    })) as VoiceConversation;
  } catch (e) {
    console.error("agent start", e);
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
    orb.level = Math.min(1, (speaking ? conv.getOutputVolume() : call.get().muted ? 0 : conv.getInputVolume()) * 2.2);
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
