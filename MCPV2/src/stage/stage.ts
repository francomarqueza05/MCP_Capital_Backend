// The conversation layer: captions that reveal word by word on the voice's own timing,
// choices, and the speech bubble that follows the orb. Imperative on purpose: the intro is a
// script (`await say(...)`), and React only draws what these stores say.
import { hasVoice, isVoiceHeld, line, speak, stopVoice, tones } from "@/lib/audio";
import { createStore } from "@/lib/store";
import { orb, type Emotion } from "@/orb/engine";

export type Choice = { id: string; label: string; sub?: string; primary?: boolean };

export const caption = createStore({
  visible: false,
  words: [] as string[],
  shown: 0,
  hint: false,
  choices: null as Choice[] | null,
  key: 0,
});

let finishFn: (() => void) | null = null;
let advanceFn: (() => void) | null = null;
let choiceFn: ((id: string) => void) | null = null;

/** A tap (or space/enter) while a caption is up: complete it, or move on once complete. */
export function tapCaption() {
  if (!caption.get().visible) return;
  if (finishFn) finishFn();
  else advanceFn?.();
}
export function pick(id: string) {
  stopVoice();
  tones.tap();
  caption.set({ choices: null });
  choiceFn?.(id);
}
export function hideCaption() {
  caption.set({ visible: false, choices: null, hint: false });
}

function reveal(text: string, voice: Awaited<ReturnType<typeof speak>>, onDone: () => void) {
  const words = text.split(" ");
  caption.set((s) => ({ visible: true, words, shown: 0, hint: false, choices: null, key: s.key + 1 }));
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const all = () => caption.set({ shown: words.length });
  if (voice) {
    let i = 0;
    const tick = () => {
      if (stopped) return;
      const t = voice.audio.currentTime;
      let moved = false;
      while (i < words.length && t >= (voice.words[i] ?? 0) - 0.04) {
        i++;
        moved = true;
        orb.pulse(0.4, 1.1);
      }
      if (moved) caption.set({ shown: i });
      if (voice.audio.ended || voice.audio.error) {
        stopped = true;
        all();
        onDone();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  } else {
    words.forEach((_, i) =>
      timers.push(
        setTimeout(() => {
          caption.set({ shown: i + 1 });
          orb.pulse(0.5, 0.8);
        }, 60 + i * 55),
      ),
    );
    timers.push(setTimeout(onDone, 60 + words.length * 55 + 350));
  }
  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
    all();
  };
}

export async function say(id: string, { emo = "speaking" as Emotion, after = "neutral" as Emotion } = {}) {
  const voice = await speak(id);
  return new Promise<void>((res) => {
    orb.setEmo(emo);
    advanceFn = null;
    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      finishFn = null;
      orb.setEmo(after);
      caption.set({ hint: true });
      advanceFn = () => {
        advanceFn = null;
        stopVoice();
        caption.set({ hint: false });
        res();
      };
    };
    const skip = reveal(line(id), voice, complete);
    finishFn = () => {
      skip();
      complete();
    };
  });
}

export async function choose(id: string, options: Choice[]) {
  const voice = await speak(id);
  return new Promise<string>((res) => {
    orb.setEmo("speaking");
    advanceFn = null;
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      finishFn = null;
      orb.setEmo("curious");
      caption.set({ choices: options });
      choiceFn = (cid) => {
        choiceFn = null;
        res(cid);
      };
    };
    const skip = reveal(line(id), voice, show);
    finishFn = () => {
      skip();
      show();
    };
  });
}

// ---------------------------------------------------------------- bubble
// Cordi's narration of the climb only: short lines and reactions. Conversations live in the
// side panel's "Conversación" tab, so the two never step on each other.
export const bubble = createStore({ text: "", visible: false });
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * How far through its current line Cordi is (0 to 1), word by word, as it speaks or writes.
 * Visuals read it to show each part as Cordi gets to it.
 */
export const speech = createStore({ p: 1, key: 0 });

/**
 * A spot on screen Cordi should fly to and hold, instead of its place on the mountain: beside
 * the explanation stage on a call. `maxRight` keeps the speech bubble from covering the stage.
 */
export const orbSpot = createStore({ at: null as null | { x: number; y: number; maxRight: number; scale: number } });

/** During a call the bubble carries the call's captions; narration keeps out of it. */
let bubbleHeld = false;
export const holdBubble = (on: boolean) => {
  bubbleHeld = on;
};

/** Shows a voice line (by id, spoken if it has audio) or a plain text next to the orb. */
export function showBubble(idOrText: string, ms = 2800) {
  if (bubbleHeld) return;
  clearTimeout(bubbleTimer);
  if (hasVoice(idOrText)) speak(idOrText);
  bubble.set({ text: line(idOrText), visible: true });
  if (ms) bubbleTimer = setTimeout(() => bubble.set({ visible: false }), ms);
}
/** A short line in the bubble that stays until replaced, even while a call holds it. */
export function noteInBubble(text: string) {
  clearTimeout(bubbleTimer);
  bubble.set({ text, visible: true });
}
/**
 * A narrated line in the bubble (the intro, each camp on the tour): its words appear on the
 * voice's timing (seconds per word) and the bubble goes after `ms`. There are no subtitles
 * anywhere else: what Cordi says lives in its bubble.
 */
let lineTimers: ReturnType<typeof setTimeout>[] = [];
export function lineInBubble(text: string, times: number[], ms: number) {
  if (bubbleHeld) return;
  lineTimers.forEach(clearTimeout);
  lineTimers = [];
  clearTimeout(bubbleTimer);
  const words = text.split(" ");
  bubble.set({ text: words[0] ?? "", visible: true });
  words.forEach((_, i) => {
    if (i) lineTimers.push(setTimeout(() => bubble.set({ text: words.slice(0, i + 1).join(" ") }), (times[i] ?? i * 0.3) * 1000));
  });
  bubbleTimer = setTimeout(() => bubble.set({ visible: false }), ms);
}
export function hideBubble() {
  lineTimers.forEach(clearTimeout);
  lineTimers = [];
  clearTimeout(bubbleTimer);
  bubble.set({ visible: false });
}

/**
 * A call's caption: Cordi's line in the bubble, word by word on the voice's own timing (or a
 * reading pace when there's no audio). `stop()` cuts it where it is, for when Cordi is
 * interrupted. `done` resolves when the line has been said, or cut.
 */
export function captionInBubble(id: string) {
  clearTimeout(bubbleTimer);
  const words = line(id).split(" ");
  let stopped = false;
  let finish = () => {};
  const done = new Promise<void>((r) => (finish = r));
  bubble.set({ text: "", visible: true });
  speech.set((s) => ({ p: 0, key: s.key + 1 }));
  const show = (n: number) => {
    bubble.set({ text: words.slice(0, n).join(" ") });
    speech.set({ p: n / words.length });
  };
  const end = () => {
    if (stopped) return;
    stopped = true;
    speech.set({ p: 1 });
    finish();
  };
  speak(id).then((voice) => {
    if (stopped) return;
    orb.setEmo("speaking");
    if (voice) {
      let i = 0;
      const tick = () => {
        if (stopped) return;
        const t = voice.audio.currentTime;
        let moved = false;
        while (i < words.length && t >= (voice.words[i] ?? 0) - 0.04) {
          i++;
          moved = true;
          orb.pulse(0.4, 1.1);
        }
        if (moved) show(i);
        if (voice.audio.ended || voice.audio.error || (voice.audio.paused && !isVoiceHeld())) {
          show(words.length);
          end();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    } else {
      // no audio: a reading pace on its own clock, which also stops while paused
      let t = 0;
      let last = performance.now();
      let i = 0;
      const tick = () => {
        if (stopped) return;
        const now = performance.now();
        if (!isVoiceHeld()) t += now - last;
        last = now;
        const n = Math.min(words.length, Math.floor(t / 260) + 1);
        if (n > i) {
          i = n;
          show(i);
          orb.pulse(0.5, 0.8);
          orb.speakFor(300);
        }
        if (t > words.length * 260 + 500) {
          end();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    }
  });
  return {
    done,
    stop: () => {
      stopVoice();
      end();
    },
  };
}
