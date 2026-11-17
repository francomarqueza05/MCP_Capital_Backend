// Sound: the pre-rendered voice lines (scripts/voice-orb.ts), the intro's sound design
// (scripts/sfx-orb.ts) and two small synthesized bells for taps. Everything is optional:
// muted, or blocked by the browser, the experience carries on silently.
import voiceManifest from "@/data/voice.json";
import sfxManifest from "@/data/sfx.json";

export type VoiceLine = { text: string; file?: string; words?: number[]; end?: number };
const VOICE = voiceManifest as Record<string, VoiceLine>;
const SFX = sfxManifest as Record<string, string>;

export const line = (id: string) => VOICE[id]?.text ?? id;
export const hasVoice = (id: string) => Boolean(VOICE[id]?.file);

let ctx: AudioContext | null = null;
let muted = false;
export const isMuted = () => muted;
export function setMuted(v: boolean) {
  muted = v;
  if (v) {
    stopVoice();
    stopSfx(200);
  }
}

/** Must run inside a user gesture once, so the browser lets us play sound later. */
export function unlock() {
  if (typeof window === "undefined") return null;
  ctx ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}
export const audioContext = () => ctx;

function bell(f = 880, vol = 0.05, when = 0) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + when;
  for (const [m, v] of [
    [1, 1],
    [2.01, 0.35],
    [3, 0.12],
  ]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f * m;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 1.7);
  }
}
export const tones = {
  form: () => {
    bell(659);
    bell(988, 0.035, 0.12);
  },
  tap: () => bell(1318, 0.022),
  soft: () => bell(784, 0.018),
};

// ---------------------------------------------------------------- sound effects
const sfxTimers: ReturnType<typeof setTimeout>[] = [];
const sfxPlaying = new Set<HTMLAudioElement>();

function fadeOut(a: HTMLAudioElement, ms: number) {
  const v0 = a.volume;
  const t0 = performance.now();
  const step = () => {
    const k = ms ? Math.min(1, (performance.now() - t0) / ms) : 1;
    a.volume = v0 * (1 - k);
    if (k < 1) requestAnimationFrame(step);
    else {
      a.pause();
      sfxPlaying.delete(a);
    }
  };
  step();
}

export function playSfx(id: string, { vol = 0.3, rate = 1, delay = 0, fadeAt = 0 } = {}) {
  if (muted || !SFX[id]) return;
  sfxTimers.push(
    setTimeout(() => {
      if (muted) return;
      const a = new Audio(`/audio/sfx/${SFX[id]}`);
      a.volume = vol;
      a.preservesPitch = false;
      a.playbackRate = rate;
      sfxPlaying.add(a);
      a.onended = () => sfxPlaying.delete(a);
      a.play().catch(() => {});
      if (fadeAt) sfxTimers.push(setTimeout(() => fadeOut(a, 1200), fadeAt));
    }, delay),
  );
}

export function stopSfx(ms = 300) {
  sfxTimers.forEach(clearTimeout);
  sfxTimers.length = 0;
  for (const a of [...sfxPlaying]) fadeOut(a, ms);
}

// ---------------------------------------------------------------- voice
let voiceNow: HTMLAudioElement | null = null;
export const isTalking = () => Boolean(voiceNow && !voiceNow.paused && !voiceNow.ended);

export function stopVoice() {
  voiceSeq++;
  if (voiceNow) {
    voiceNow.pause();
    voiceNow = null;
  }
}

export type Spoken = { audio: HTMLAudioElement; words: number[] };

// ---------------------------------------------------------------- live voice (any text)
// Lines that aren't pre-rendered (the explanation's steps, the AI's answers) are spoken through
// /api/tts. Each text is fetched once per page; word timings are estimated from the audio's
// length, by the share of letters before each word.
let tts = true;
const ttsUrls = new Map<string, Promise<string | null>>();
export const setLiveVoice = (on: boolean) => {
  tts = on;
};
function ttsUrl(text: string) {
  let u = ttsUrls.get(text);
  if (!u) {
    u = fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
      .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null);
    ttsUrls.set(text, u);
    u.then((x) => x === null && ttsUrls.delete(text));
  }
  return u;
}
/** Starts fetching a line's voice ahead of time, so it plays without a wait. */
export const prefetchSpeech = (text: string) => {
  if (tts && !muted && text && !VOICE[text]) void ttsUrl(text);
};
const estimate = (text: string, dur: number) => {
  const words = text.split(" ");
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let acc = 0;
  return words.map((w) => {
    const t = (acc / total) * dur;
    acc += w.length + 1;
    return t;
  });
};
const metadata = (a: HTMLAudioElement) =>
  Number.isFinite(a.duration) && a.duration > 0 ? Promise.resolve() : new Promise<void>((r) => a.addEventListener("loadedmetadata", () => r(), { once: true }));

let voiceSeq = 0;

/**
 * Plays a line: its pre-rendered audio when it has one, or else (for any text) the live voice.
 * Resolves to its word timings, or null when silent.
 */
export function speak(id: string): Promise<Spoken | null> {
  stopVoice();
  const my = ++voiceSeq;
  const v = VOICE[id];
  if (muted) return Promise.resolve(null);
  if (v?.file) {
    const a = new Audio(`/audio/voice/${v.file}`);
    voiceNow = a;
    return a
      .play()
      .then(() => ({ audio: a, words: v.words ?? [] }))
      .catch(() => null);
  }
  if (v || !tts || !id.trim()) return Promise.resolve(null);
  return ttsUrl(id).then(async (url) => {
    if (!url || my !== voiceSeq || muted) return null;
    const a = new Audio(url);
    voiceNow = a;
    try {
      await a.play();
      await metadata(a);
      return { audio: a, words: estimate(id, a.duration) };
    } catch {
      return null;
    }
  });
}
