// The conversation with Cordi, wherever it starts: a suggested question at a camp, or one
// typed. It lives in the side panel's "Conversación" tab, like a chat: the question, a moment
// of thinking, and the answer streaming in word by word while the orb speaks. The speech
// bubble stays for Cordi's narration of the climb, so the two never step on each other.
import { line } from "@/lib/audio";
import { createStore, wait } from "@/lib/store";
import { orb } from "@/orb/engine";
import type { Visual } from "@/explain/beats";
import { speech } from "./stage";
import { askCordiFull, remember } from "@/ai/client";
import { explain } from "@/explain/player";

export type Msg = { id: number; who: "you" | "cordi"; text: string; topic: string; at: number; visual?: Visual; step?: number; go?: string };
export type Tab = "detail" | "chat";

export const chat = createStore({
  msgs: [] as Msg[],
  /** The Cordi message still streaming in, and how many of its words are out. */
  live: null as { id: number; shown: number } | null,
  busy: false,
  /** The panel is open for the conversation (it can be, with no camp's detail requested). */
  panel: false,
  tab: "detail" as Tab,
  /** Per camp: the suggested questions already asked, and the "not clear yet" count. */
  asked: {} as Record<string, string[]>,
  /** Answers to tap under one of Cordi's messages (a question it asked on its own). */
  quick: null as { msgId: number; choices: { id: string; label: string }[] } | null,
  /** When the person last typed in the box: Cordi doesn't speak up meanwhile. */
  typedAt: 0,
  tries: {} as Record<string, number>,
});

export const openChat = () => chat.set({ panel: true, tab: "chat" });
export const setTab = (tab: Tab) => chat.set({ tab });
export const closePanel = () => chat.set({ panel: false, tab: "detail" });

let seq = 0;
/** Adds a line to the conversation as is (a call's transcript, for instance). */
export const logMsg = (who: Msg["who"], text: string, topic: string, visual?: Visual) => push(who, text, topic, visual);
const push = (who: Msg["who"], text: string, topic: string, visual?: Visual) => {
  const id = ++seq;
  // during an explanation, each line belongs to the step on screen: the chat follows it
  const ex = explain.get();
  const step = (ex.phase === "playing" || ex.phase === "done") && ex.title === topic ? ex.i : undefined;
  chat.set((s) => ({ msgs: [...s.msgs, { id, who, text, topic, at: Date.now(), visual, step }] }));
  return id;
};

/**
 * Cordi writes one message into the chat, streaming word by word while the orb talks.
 * `alive()` is asked between words, so a stopped explanation stops mid-sentence.
 */
export async function cordiWrites(text: string, topic: string, visual?: Visual, alive: () => boolean = () => true) {
  remember(text);
  const words = text.split(" ");
  const id = push("cordi", text, topic, visual);
  chat.set({ live: { id, shown: 0 } });
  speech.set((s) => ({ p: 0, key: s.key + 1 }));
  orb.setEmo("speaking");
  for (let i = 1; i <= words.length; i++) {
    if (!alive()) break;
    await wait(55);
    chat.set({ live: { id, shown: i } });
    speech.set({ p: i / words.length });
    if (i % 2) orb.pulse(0.4, 0.9);
  }
  speech.set({ p: 1 });
  chat.set({ live: null });
  orb.setEmo("neutral");
}

/**
 * One exchange. `answer` null means there's no prepared answer (the live agent isn't wired in
 * yet). Resolves once the answer is fully out, so what follows it (the "is it clear?" check)
 * only appears after Cordi has finished.
 */
export async function converse(question: string, answer: string | null, topic: string) {
  if (chat.get().busy) return;
  chat.set({ busy: true, panel: true, tab: "chat" });
  push("you", question, topic);
  orb.setEmo("thinking");
  // a prepared answer (from the family's numbers) after a short think; otherwise the live AI,
  // and if that can't answer, Cordi says so kindly
  const [res] = await Promise.all([
    answer !== null ? Promise.resolve({ answer, go: null as string | null }) : askCordiFull(question, topic).then((x) => x ?? { answer: line("placeholderAnswer"), go: null }),
    wait(answer !== null ? 750 : 400),
  ]);
  const a = res.answer;
  const words = a.split(" ");
  const id = push("cordi", a, topic);
  // on the map, an offer to go and have it explained there: shown as a button under the answer
  if (res.go) chat.set((s) => ({ msgs: s.msgs.map((m) => (m.id === id ? { ...m, go: res.go ?? undefined } : m)) }));
  chat.set({ live: { id, shown: 0 } });
  orb.setEmo("speaking");
  for (let i = 1; i <= words.length; i++) {
    await wait(45);
    chat.set({ live: { id, shown: i } });
    if (i % 2) orb.pulse(0.4, 0.9);
  }
  chat.set({ live: null, busy: false });
  orb.setEmo("neutral");
  orb.flashEmo("happy", 900);
}

export function markAsked(stepId: string, qid: string) {
  chat.set((s) => ({ asked: { ...s.asked, [stepId]: [...(s.asked[stepId] ?? []), qid] } }));
}
export function addTry(stepId: string) {
  const n = (chat.get().tries[stepId] ?? 0) + 1;
  chat.set((s) => ({ tries: { ...s.tries, [stepId]: n } }));
  return n;
}
