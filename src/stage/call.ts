// A voice call with Cordi. Turn-taking like a phone call: Cordi says hello, then listens; when
// you stop talking it thinks and answers, its words appearing in the speech bubble in step with
// its voice. Talk over it and it stops to listen. Everything said goes to the conversation.
//
// Simulated for now: the microphone is real (it hears when you talk and when you stop), but
// there's no speech-to-text and Cordi answers with a placeholder line. The live agent
// (POST /v1/voice/agent-session, ElevenLabs over WebSocket, with per-character timing for
// exact captions) plugs in where `reply()` is.
import { audioContext, line as voiceLine, setVoiceQuiet, stopVoice, tones } from "@/lib/audio";
import { createStore, lerp, wait } from "@/lib/store";
import { orb } from "@/orb/engine";
import { logMsg } from "./chat";
import { askCordi, checkAI, remember, session } from "@/ai/client";
import { agentActive, agentMute, agentQuiet, agentSay, endAgent, startAgent } from "./agent";
import { explain, explaining, interject, proceed, resumeCut, takeWheel, writeDuring } from "@/explain/player";
import { isGo } from "@/explain/confirm";
import { tr } from "@/lib/lang";
import { captionInBubble, hideBubble, holdBubble, setCaptions } from "./stage";

export type CallState = "idle" | "connecting" | "speaking" | "listening" | "thinking";

export const call = createStore({
  state: "idle" as CallState,
  muted: false,
  /** Cordi's voice silenced: it keeps talking in captions only. */
  quiet: false,
  /** The call goes on without a microphone (no permission): the person writes instead. */
  noMic: false,
  t0: 0,
  /** Shown when the call could not start (no microphone). */
  error: "",
});

export const inCall = () => call.get().state !== "idle";

const TOPIC = () => tr("Call with Cordi", "Llamada con Cordi");
const LOUD = 0.12; // the level that counts as someone talking
// Cutting Cordi off takes real speech, not a slip: louder than talking level (and than the
// room), and held. A cough, an "mm" or a short noise doesn't stop it.
const BARGE = 0.3;
const BARGE_HOLD = 600; // ms of sustained loud voice before Cordi stops
const BARGE_GAP = 180; // a dip shorter than this inside a phrase doesn't reset the count
const SILENCE = 900; // ms of quiet after talking that ends your turn
const CALIBRATE = 700; // ms of room noise measured when the call opens

let stream: MediaStream | null = null;
let raf = 0;
let line: ReturnType<typeof captionInBubble> | null = null;
let heardAt = 0;
let quietSince = 0;
let loudSince = 0;
let turn = 0; // bumps on every hang-up, so stale awaits know to stop

async function openMic() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return false;
  }
  const ac = audioContext();
  if (!ac) return false;
  const an = ac.createAnalyser();
  an.fftSize = 512;
  ac.createMediaStreamSource(stream).connect(an);
  startRecognition();
  const buf = new Uint8Array(an.fftSize);
  let level = 0;
  // the room's own noise, measured at the start: thresholds sit above it
  const calStart = performance.now();
  let floor = 0;
  let floorN = 0;
  let lastLoud = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const s = call.get();
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) {
      const d = (v - 128) / 128;
      sum += d * d;
    }
    level = s.muted ? 0 : lerp(level, Math.min(1, Math.sqrt(sum / buf.length) * 5), 0.35);
    const now = performance.now();
    if (now - calStart < CALIBRATE) {
      floor = (floor * floorN + level) / ++floorN;
      return;
    }
    const talk = Math.max(LOUD, floor * 2.5);
    const barge = Math.max(BARGE, floor * 4);
    if (s.state === "listening") {
      orb.listening = true;
      orb.level = level;
      if (level > talk) {
        if (!heardAt) heardAt = now;
        quietSince = 0;
      } else if (heardAt) {
        quietSince ||= now;
        if (now - quietSince > SILENCE && now - heardAt > 400) endTurn();
      }
    } else if (s.state === "speaking") {
      // talking over Cordi, for real: it stops and listens
      if (level > barge) {
        loudSince ||= now;
        lastLoud = now;
        if (now - loudSince > BARGE_HOLD) interrupt();
      } else if (loudSince && now - lastLoud > BARGE_GAP) loudSince = 0;
    }
  };
  loop();
  return true;
}

function closeMic() {
  stopRecognition();
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  orb.listening = false;
  orb.level = 0;
}

// Cordi must never answer itself: the microphone also picks up its voice (from the speakers),
// and the recognizer hands those words back a moment later. So what's heard right after Cordi
// speaks is ignored, and anything that mostly repeats what Cordi just said is dropped as echo.
let quietAt = 0; // when Cordi last stopped talking
const ECHO_WINDOW = 900;
const recentSaid: string[] = [];
const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
function isEcho(heard: string) {
  const words = norm(heard);
  if (!words.length) return true;
  const said = new Set(recentSaid.flatMap(norm));
  const same = words.filter((w) => said.has(w)).length;
  return same / words.length >= 0.5;
}

/** Cordi says one line, captioned in the bubble. Resolves false if it was cut off. */
async function say(id: string) {
  const my = turn;
  call.set({ state: "speaking" });
  loudSince = 0;
  remember(voiceLine(id));
  recentSaid.push(voiceLine(id));
  if (recentSaid.length > 4) recentSaid.shift();
  line = captionInBubble(id);
  await line.done;
  const whole = line !== null;
  // cut off by the person talking: their words count from now, no echo window
  if (whole) quietAt = performance.now();
  line = null;
  return my === turn && whole;
}

function listen() {
  heardAt = 0;
  quietSince = 0;
  clearHeard();
  call.set({ state: "listening" });
  orb.setEmo("listening");
}

async function endTurn() {
  const my = turn;
  heardAt = 0;
  call.set({ state: "thinking" });
  orb.listening = false;
  orb.setEmo("thinking");
  const raw = await transcript();
  if (my !== turn) return;
  // its own voice coming back through the mic: not a turn, keep listening
  if (raw && isEcho(raw)) {
    if (!resumeCut() && inCall()) listen();
    return;
  }
  const heard = raw;
  if (!heard && rec) {
    // a noise, nothing said: Cordi carries on if it had stopped, or keeps listening
    if (!resumeCut() && inCall()) listen();
    return;
  }
  // during an explanation on this call: a yes goes on, anything else is a question to it
  if (heard && explaining() && explain.get().how === "call") {
    const ex = explain.get();
    if (isGo(heard) && (ex.waiting || ex.paused)) {
      logMsg("you", heard, ex.title);
      if (ex.waiting) call.set({ state: "speaking" });
      proceed();
      return;
    }
    void interject(heard);
    return;
  }
  if (!heard) {
    // nothing understood: say so, and listen again
    const again = tr("Sorry, I didn't catch that. Can you say it again, or type it in the conversation?", "Perdona, no te he entendido bien. ¿Me lo repites, o me lo escribes en la conversación?");
    logMsg("cordi", again, TOPIC());
    await say(again);
  } else if (explain.get().waiting && explain.get().how === "call" && isGo(heard)) {
    // a clear "sí, seguimos" while the explanation waits: on to the next step, like the button
    logMsg("you", heard, explain.get().title);
    call.set({ state: "speaking" });
    proceed();
    return;
  } else {
    // a question out loud: no more countdown, the person moves on when they want
    takeWheel();
    logMsg("you", heard, TOPIC());
    await reply(heard);
  }
  if (my === turn && inCall()) listen();
}

/** Cordi's answer: the live AI with the family's analysis, or a kind fallback without it. */
async function reply(question: string) {
  const my = turn;
  const answer = (await askCordi(question, TOPIC())) ?? voiceLine("placeholderAnswer");
  if (my !== turn) return;
  logMsg("cordi", answer, TOPIC());
  await say(answer);
}

// ---------------------------------------------------------------- what you said
// The browser's own speech recognition (Chrome, Edge, Safari) runs for the whole call; each
// turn takes what it heard since the turn began. Where there's none, Cordi asks to write.
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
let rec: Recognition | null = null;
let heardFinal = "";
let heardInterim = "";
let lastResult = 0;

function startRecognition() {
  const SR = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
  if (!SR) return;
  const r = new SR();
  r.lang = "es-ES";
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    // only what's said while Cordi listens, and not the tail of its own voice
    if (call.get().state !== "listening" || performance.now() - quietAt < ECHO_WINDOW) {
      heardFinal = "";
      heardInterim = "";
      return;
    }
    let interim = "";
    for (let k = e.resultIndex; k < e.results.length; k++) {
      const res = e.results[k];
      if (res.isFinal) heardFinal += ` ${res[0].transcript}`;
      else interim += res[0].transcript;
    }
    heardInterim = interim;
    lastResult = performance.now();
  };
  // it stops by itself now and then: keep it going while the call lasts
  r.onend = () => {
    if (rec === r && inCall()) {
      try {
        r.start();
      } catch {}
    }
  };
  r.onerror = () => {};
  try {
    r.start();
    rec = r;
  } catch {
    rec = null;
  }
}
function stopRecognition() {
  const r = rec;
  rec = null;
  try {
    r?.abort();
  } catch {}
}
const clearHeard = () => {
  heardFinal = "";
  heardInterim = "";
};
/** What was said this turn: waits a moment for the recognizer's final words. */
async function transcript() {
  if (!rec) return "";
  const t0 = performance.now();
  while (performance.now() - t0 < 1200 && heardInterim && performance.now() - lastResult < 700) await wait(80);
  const text = `${heardFinal} ${heardInterim}`.replace(/\s+/g, " ").trim();
  clearHeard();
  return text;
}

function interrupt() {
  if (call.get().state !== "speaking") return;
  const cut = line;
  line = null;
  cut?.stop();
  orb.flashEmo("surprised", 500);
  listen();
  heardAt = performance.now(); // they're already talking
}

/** The person is talking right now (their turn has started and not ended). */
export const userTalking = () => heardAt > 0;
/** Ends the line Cordi is saying, as if it had finished (for skipping ahead). */
export const stopLine = () => line?.stop();
/** Cordi says a line on the call (an explanation's step). False if it was cut off. */
export const sayInCall = (text: string) => say(text);
/** Hand the call back to the person: Cordi listens. */
export const listenInCall = () => {
  if (inCall()) listen();
};

/** Starts a call. With `greet: false` it only connects, for an explanation to take over. */
export async function startCall({ greet = true } = {}) {
  if (inCall()) return true;
  // a call to talk: the live agent when it's there; this local call otherwise
  if (greet && (await checkAI()).agent && (await startAgent({ mode: "free", campId: session.get().campId || undefined }))) return true;
  const my = ++turn;
  tones.tap();
  holdBubble(true);
  call.set({ state: "connecting", t0: Date.now(), error: "", noMic: false });
  orb.setEmo("curious");
  if (!(await openMic())) {
    if (!greet) {
      // an explanation: Cordi still talks; without a microphone the person writes in the card
      call.set({ noMic: true, muted: true });
      await wait(400);
      if (my !== turn) return false;
      call.set({ state: "speaking" });
      return true;
    }
    holdBubble(false);
    call.set({ state: "idle", error: tr("I couldn't access the microphone. Check the browser's permission, or write to me in the conversation.", "No pude acceder al micrófono. Revisa el permiso del navegador, o escríbeme en la conversación.") });
    orb.setEmo("concerned");
    return false;
  }
  await wait(900);
  if (my !== turn) return false;
  tones.soft();
  if (!greet) {
    call.set({ state: "speaking" });
    return true;
  }
  logMsg("cordi", tr("Hi! I'm Cordi. How can I help?", "¡Hola! Soy Cordi. ¿En qué te ayudo?"), TOPIC());
  if ((await say("hello")) && (await say("howCanIHelp")) && my === turn) listen();
  else if (my === turn && inCall() && call.get().state !== "listening") listen();
  return true;
}

export function hangUp() {
  if (agentActive()) {
    void endAgent();
    return;
  }
  if (!inCall()) return;
  turn++;
  line?.stop();
  line = null;
  stopVoice();
  closeMic();
  call.set({ state: "idle" });
  holdBubble(false);
  hideBubble();
  tones.tap();
  orb.setEmo("neutral");
  orb.flashEmo("happy", 900);
}

/** Silences Cordi's voice (or brings it back); the call and its captions go on. */
export const toggleQuiet = () => {
  const q = !call.get().quiet;
  call.set({ quiet: q });
  setVoiceQuiet(q);
  agentQuiet(q);
  // Cordi silenced: subtitles take over; its voice back: they go
  setCaptions(q);
  if (!q && inCall()) hideBubble();
};

/**
 * A question written during the call: Cordi stops what it's saying, answers it out loud (the
 * captions show it), and the explanation picks up again where it was.
 */
export async function typeInCall(text: string) {
  const q = text.trim();
  if (!q || !inCall()) return;
  if (agentActive()) {
    // a written "sí, seguimos" while the step waits moves on, like the button
    const ex = explain.get();
    if (ex.phase === "playing" && ex.waiting && isGo(q)) proceed();
    else agentSay(q);
    return;
  }
  // during an explanation: on to the chat, where it can be read (see writeDuring)
  if (explaining()) {
    void writeDuring(q);
    return;
  }
  takeWheel();
  if (call.get().state === "speaking") {
    const cut = line;
    line = null;
    cut?.stop();
  }
  heardAt = 0;
  call.set({ state: "thinking" });
  orb.setEmo("thinking");
  logMsg("you", q, TOPIC());
  const my = turn;
  await reply(q);
  if (my === turn && inCall()) listen();
}

export const toggleMute = () => {
  call.set((s) => ({ muted: !s.muted }));
  agentMute(call.get().muted);
};

/** "Stop talking": the same as talking over Cordi, from a button. */
export const cutIn = () => interrupt();
