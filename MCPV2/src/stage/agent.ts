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
import { explain, reached, agentFinished } from "@/explain/player";
import { call } from "./call";
import { chat, logMsg } from "./chat";
import { holdBubble, hideBubble, noteInBubble, speech } from "./stage";

export const agent = createStore({ mode: null as "explain" | "free" | null });

let conv: VoiceConversation | null = null;
let raf = 0;
let ending = false;
const timers: ReturnType<typeof setTimeout>[] = [];
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

const topic = () => (agent.get().mode === "explain" ? explain.get().title : "Llamada con Cordi");

function stopCaption() {
  timers.forEach(clearTimeout);
  timers.length = 0;
}
function newReply() {
  stopCaption();
  said = "";
  heard = 0;
  aligned = "";
}

/** Shows what's been heard of the reply so far, whole words only, the last couple of lines. */
function render() {
  // whole words only: the word being said shows once it's complete
  let text = stripAudioTags(aligned);
  const lastSpace = text.lastIndexOf(" ");
  if (!/[\s.,;:!?…]$/.test(text) && lastSpace > 0) text = text.slice(0, lastSpace);
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return;
  const tail = text.length > 170 ? `…${text.slice(text.length - 170).replace(/^\S*\s/, "")}` : text;
  noteInBubble(tail);
  if (agent.get().mode === "explain") speech.set({ p: Math.min(1, text.length / expected) });
}

/** Opens the call. Resolves false when the agent isn't available (the caller falls back). */
export async function startAgent(opts: { mode: "explain" | "free"; campId?: string; from?: number; title?: string }) {
  if (conv) return true;
  ending = false;
  allowNext = false;
  lastUser = "";
  shownAny = false;
  newReply();
  call.set({ state: "connecting", t0: Date.now(), muted: false, error: "" });
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
          if (forward && !allowNext && !isGo(lastUser)) {
            conv?.sendContextualUpdate(
              `BLOCKED: the person has not asked to move on. Stay on block "${ex.beats[ex.i].id}" and wait, without asking if they want to continue: they move on with the on-screen button (it arrives as "Sí, seguimos.") or by saying so.`,
            );
            return;
          }
          if (forward && i > ex.i + 1) conv?.sendContextualUpdate("Move one block at a time: show the next block, not a later one.");
          const to = forward ? ex.i + 1 : i;
          allowNext = false;
          lastUser = "";
          shownAny = true;
          explain.set({ i: to, waiting: false });
          reached(to);
          expected = Math.max(40, ex.beats[to].say.length);
          speech.set((s) => ({ p: 0, key: s.key + 1 }));
        },
        lookup: async ({ topic: t }: { topic: string }) => tool({ tool: "lookup", topic: t, mode: agent.get().mode === "explain" ? "explain" : "map", known: where().known }),
        phase_done: async () => {
          if (agent.get().mode === "explain") {
            agentFinished();
            agent.set({ mode: "free" });
            return tool({ tool: "next_brief", campId: explain.get().stepId, camp: explain.get().title, said: where().said, known: where().known });
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
          if (explain.get().phase === "playing") explain.set({ saying: false, waiting: true, until: null });
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
        alignment.chars.forEach((ch, k) =>
          timers.push(
            setTimeout(() => {
              heard++;
              aligned += ch;
              lastCharAt = performance.now();
              render();
              if (ch === " ") orb.pulse(0.35, 0.8);
            }, alignment.char_start_times_ms[k] ?? 0),
          ),
        );
      },
      // talked over: the caption stops where the voice stopped
      onInterruption: () => stopCaption(),
      onMessage: ({ message, role }) => {
        if (!message) return;
        if (role === "agent") {
          if (message.length > said.length) said = message; // the final text wins
          logMsg("cordi", stripAudioTags(message), topic());
          remember(stripAudioTags(message));
        } else {
          lastUser = message;
          logMsg("you", message, topic());
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
  tones.soft();
  // the orb breathes with the voices: Cordi's when it speaks, yours when it listens
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!conv) return;
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
