// The browser's side of Cordi's live intelligence. It knows which family is open and where the
// person is (the camp, the step on screen), sends that with the question and the recent
// conversation to /api/ask, and gives back Cordi's answer. Keys never reach the browser: the
// server routes hold them. Every call has a fallback, so without the AI Cordi still answers.
import { DEFAULT_CASE } from "@/data/cases";
import { createStore } from "@/lib/store";
import { setLiveVoice } from "@/lib/audio";
import { chat } from "@/stage/chat";
import { explain, known } from "@/explain/player";
import { understanding } from "@/expedition/understanding";

export const session = createStore({ caseId: DEFAULT_CASE, camp: "", campId: "" });

/**
 * Everything Cordi has already told this person, scripted or live, in order: sent with every
 * question so the model builds on it instead of repeating it.
 */
const said: string[] = [];
export function remember(text: string) {
  const t = text.trim();
  if (!t || said[said.length - 1] === t) return;
  const at = said.indexOf(t);
  if (at >= 0) said.splice(at, 1);
  said.push(t);
  if (said.length > 40) said.shift();
}

/** What the server has switched on (live answers, voice). Checked once. */
export const ai = createStore({ on: false, voice: false, agent: false, checked: false });
export async function checkAI() {
  if (ai.get().checked) return ai.get();
  try {
    const r = await fetch("/api/status");
    const j = await r.json();
    ai.set({ on: Boolean(j.ai), voice: Boolean(j.voice), agent: Boolean(j.agent), checked: true });
    setLiveVoice(Boolean(j.voice));
  } catch {
    ai.set({ checked: true });
    setLiveVoice(false);
  }
  return ai.get();
}

/** Where the person is, for the model. */
export function where(topic?: string) {
  const ex = explain.get();
  const playing = ex.phase === "playing" || ex.phase === "done";
  const beat = playing ? ex.beats[Math.min(ex.i, ex.beats.length - 1)] : null;
  const k = known.get();
  return {
    // outside an explanation, Cordi is the map's guide: it gets what's been explained so far
    mode: playing ? ("explain" as const) : ("map" as const),
    known: { seen: k.seen, done: k.done, marks: understanding.get().marks },
    campId: playing ? ex.stepId : session.get().campId || undefined,
    said: said.slice(-24),
    camp: playing ? ex.title : topic && topic !== "Preguntas libres" && topic !== "Llamada con Cordi" ? topic : session.get().camp || undefined,
    step: beat ? beat.say : undefined,
    stepIndex: playing ? Math.min(ex.i, ex.beats.length - 1) : undefined,
    onScreen: beat ? JSON.stringify(beat.visual.kind === "scene" ? { kind: "scene", topic: beat.visual.topic.id } : beat.visual) : undefined,
  };
}

/** Cordi's answer to a question, or null (no AI, or it failed in time). */
export async function askCordi(question: string, topic?: string): Promise<string | null> {
  return (await askCordiFull(question, topic))?.answer ?? null;
}

/**
 * The answer, and on the map maybe a camp to go to ("go"): the chat offers it as a button
 * instead of explaining what hasn't been explained yet.
 */
export async function askCordiFull(question: string, topic?: string): Promise<{ answer: string; go: string | null } | null> {
  if (!(await checkAI()).on) return null;
  const history = chat
    .get()
    .msgs.slice(-9, -1)
    .map((m) => ({ who: m.who, text: m.text }));
  try {
    const r = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId: session.get().caseId, question, where: where(topic), history }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.answer ? { answer: String(j.answer), go: j.go ?? null } : null;
  } catch {
    return null;
  }
}

/** "Llévame y explícamelo": the mountain flies there and offers the explanation. */
export const nav = createStore({ to: null as string | null, how: null as "chat" | "call" | null, key: 0 });
/** Fly to a camp; with `how`, its explanation starts on arrival in that mode, no question asked. */
export const goExplain = (campId: string, how: "chat" | "call" | null = null) => nav.set((n) => ({ to: campId, how, key: n.key + 1 }));

/** What Cordi might say about what the person just did; null to keep the local rule's. */
export async function remarkFromAI(act: unknown, fallback: unknown): Promise<{ text: string; choices?: { id: string; label: string }[] } | null | undefined> {
  if (!(await checkAI()).on) return undefined;
  try {
    const r = await fetch("/api/remark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId: session.get().caseId, where: where(), act, fallback }),
      signal: AbortSignal.timeout(4500),
    });
    if (!r.ok) return undefined;
    return (await r.json()).remark ?? null;
  } catch {
    return undefined;
  }
}
