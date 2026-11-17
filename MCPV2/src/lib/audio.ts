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
let stockFetched = false;
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
  // the stock lines, fetched once in the live voice, so they play without a wait
  if (!stockFetched) {
    stockFetched = true;
    for (const v of Object.values(VOICE)) prefetchSpeech(v.text);
  }
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
/**
 * A soft descent: airy noise whose colour falls with Cordi (a band-pass sweeping down) and a
 * quiet sine gliding down an octave under it, then a small bell as it lands.
 */
function descend(ms: number, vol = 0.05) {
  if (muted || !ctx) return;
  const c = ctx;
  const t = c.currentTime;
  const d = ms / 1000;
  // air
  const len = Math.ceil(c.sampleRate * d);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(2600, t);
  band.frequency.exponentialRampToValueAtTime(420, t + d);
  const air = c.createGain();
  air.gain.setValueAtTime(0.0001, t);
  air.gain.exponentialRampToValueAtTime(vol, t + d * 0.25);
  air.gain.exponentialRampToValueAtTime(vol * 0.5, t + d * 0.8);
  air.gain.exponentialRampToValueAtTime(0.0001, t + d);
  noise.connect(band).connect(air).connect(c.destination);
  noise.start(t);
  noise.stop(t + d);
  // tone
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(440, t + d);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * 0.35, t + d * 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + d + 0.05);
  // landing
  bell(523, vol * 0.6, d - 0.05);
}

export const tones = {
  descend: (ms: number) => descend(ms),
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

// Paused on purpose (the explanation's pause button): the line freezes where it is and picks
// up from the same instant, instead of counting as finished.
let voiceHeld = false;
export const isVoiceHeld = () => voiceHeld;
export function holdVoice() {
  voiceHeld = true;
  voiceNow?.pause();
}
export function releaseVoice() {
  voiceHeld = false;
  if (voiceNow && voiceNow.paused && !voiceNow.ended) voiceNow.play().catch(() => {});
}

export function stopVoice() {
  voiceSeq++;
  voiceHeld = false;
  if (voiceNow) {
    voiceNow.pause();
    voiceNow = null;
  }
}

export type Spoken = { audio: HTMLAudioElement; words: number[] };

// Cordi's voice can be silenced on its own during a call: the line keeps playing (silently), so
// the captions stay in step and the explanation moves on as usual.
let voiceQuiet = false;
export const isVoiceQuiet = () => voiceQuiet;
export function setVoiceQuiet(v: boolean) {
  voiceQuiet = v;
  if (voiceNow) voiceNow.muted = v;
}

// ---------------------------------------------------------------- live voice (any text)
// Lines that aren't pre-rendered (the explanation's steps, the AI's answers) are spoken through
// /api/tts. Each text is fetched once per page; word timings are estimated from the audio's
// length, by the share of letters before each word.
let tts = true;
const ttsUrls = new Map<string, Promise<string | null>>();
export const setLiveVoice = (on: boolean) => {
  tts = on;
};
// Fetches go out a few at a time (the voice service limits bursts); a line about to be said
// jumps ahead of the ones only being fetched in advance. A failed fetch is tried once more.
let ttsBusy = 0;
type Waiting = { run: () => void; now: boolean };
const ttsWaiting: Waiting[] = [];
const ttsEntry = new Map<string, Waiting>();
function ttsPump() {
  while (ttsBusy < 2 && ttsWaiting.length) {
    const i = ttsWaiting.findIndex((w) => w.now);
    const [next] = ttsWaiting.splice(i >= 0 ? i : 0, 1);
    ttsBusy++;
    next.run();
  }
}
function ttsFetch(text: string, now: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const entry: Waiting = {
      now,
      run: async () => {
        ttsEntry.delete(text);
        let url: string | null = null;
        for (let attempt = 0; attempt < 2 && !url; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 900));
          url = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
            .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
            .catch(() => null);
        }
        ttsBusy--;
        ttsPump();
        resolve(url);
      },
    };
    ttsEntry.set(text, entry);
    ttsWaiting.push(entry);
    ttsPump();
  });
}
function ttsUrl(text: string, now = true) {
  let u = ttsUrls.get(text);
  if (u) {
    // already queued as a prefetch: move it to the front
    const waiting = ttsEntry.get(text);
    if (now && waiting) waiting.now = true;
    return u;
  }
  u = ttsFetch(text, now);
  ttsUrls.set(text, u);
  u.then((x) => x === null && ttsUrls.delete(text));
  return u;
}
/** Starts fetching a line's voice ahead of time, so it plays without a wait. */
export const prefetchSpeech = (text: string) => {
  if (tts && !muted && text && !VOICE[text]) void ttsUrl(text, false);
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
  // the old recording, only when the live voice can't be had
  const recording = () => {
    if (!v?.file || my !== voiceSeq || muted) return Promise.resolve(null);
    const a = new Audio(`/audio/voice/${v.file}`);
    a.muted = voiceQuiet;
    voiceNow = a;
    return a
      .play()
      .then(() => ({ audio: a, words: v.words ?? [] }))
      .catch(() => null);
  };
  // every line, the stock ones included ("¿En qué te ayudo?"), in the one live voice, so Cordi
  // never changes voice mid-experience
  const text = v ? v.text : id;
  if (!tts || !text.trim()) return recording();
  return ttsUrl(text).then(async (url) => {
    if (my !== voiceSeq || muted) return null;
    if (!url) return recording();
    const a = new Audio(url);
    a.muted = voiceQuiet;
    voiceNow = a;
    try {
      await a.play();
      await metadata(a);
      return { audio: a, words: estimate(text, a.duration) };
    } catch {
      return null;
    }
  });
}
