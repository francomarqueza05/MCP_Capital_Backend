// The conversation layer: captions that reveal word by word on the voice's own timing,
// choices, and the speech bubble that follows the orb. Imperative on purpose: the intro is a
// script (`await say(...)`), and React only draws what these stores say.
import { hasVoice, line, speak, stopVoice, tones } from "@/lib/audio";
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
export const bubble = createStore({ text: "", visible: false });
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows a voice line (by id, spoken if it has audio) or a plain text next to the orb. */
export function showBubble(idOrText: string, ms = 2800) {
  clearTimeout(bubbleTimer);
  if (hasVoice(idOrText)) speak(idOrText);
  bubble.set({ text: line(idOrText), visible: true });
  if (ms) bubbleTimer = setTimeout(() => bubble.set({ visible: false }), ms);
}
export function hideBubble() {
  clearTimeout(bubbleTimer);
  bubble.set({ visible: false });
}
