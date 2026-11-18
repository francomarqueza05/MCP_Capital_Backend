// Cordi speaking up on its own: a remark about what you just did, or a question back to you.
// The visuals report what the person does (dragging the range, lighting a bar, sitting idle);
// a provider decides whether Cordi has something to say, and what.
//
// Today the provider is a few rules over the data. When the live agent is in, it replaces the
// provider (setRemarkProvider) and gets the same context: the camp, the step, what was done.
// Nothing else changes: the card, the timing and the answers stay as they are.
import { createStore } from "@/lib/store";
import { tones } from "@/lib/audio";
import { orb } from "@/orb/engine";
import type { Beat, Fmt } from "./beats";
import { fmt } from "./format";
import { remarkFromAI, remember } from "@/ai/client";
import { agentActive, agentNote } from "@/stage/agent";
import { chat, logMsg } from "@/stage/chat";
import { tr } from "@/lib/lang";
import { explain } from "./player";

export type Choice = { id: string; label: string };
export type Remark = { text: string; choices?: Choice[] };

/** What the person did, as the visuals report it. */
export type Act =
  | { type: "what-if"; label: string; value: number; real: number; lo: number; hi: number; fmt: Fmt }
  | { type: "focus"; label: string; value: number; fmt: Fmt; of?: number }
  | { type: "flip"; after: boolean; from: number; to: number }
  | { type: "idle"; seconds: number };

export type Context = { camp: string; beat: Beat | null; act: Act };
export type Provider = (ctx: Context) => Promise<Remark | null> | Remark | null;

/** The remark on screen, if any. `key` changes with every new one. */
export const remark = createStore({ now: null as Remark | null, key: 0 });

/** The live AI decides; the local rules are its idea to build on, and the fallback. */
const aiThenRules: Provider = async (c) => {
  const local = localRules(c);
  const fromAI = await remarkFromAI(c.act, local);
  if (fromAI === undefined) return local; // no AI, or it didn't answer in time
  if (fromAI === null) return null; // the AI thinks it's better to say nothing
  // the idle question's answers drive the explanation: keep them exactly as the app knows them
  if (c.act.type === "idle") return { text: fromAI.text, choices: local?.choices };
  return { text: fromAI.text };
};
let provider: Provider = aiThenRules;
let lastAt = 0;
let answer: ((id: string | null) => void) | null = null;
let ctx: { camp: string; beat: Beat | null; quiet: () => boolean } = { camp: "", beat: null, quiet: () => true };

/** The live agent plugs in here. */
export const setRemarkProvider = (p: Provider) => {
  provider = p;
};

/** Where we are, and when Cordi must keep quiet (while it's already talking). */
export const setRemarkContext = (c: typeof ctx) => {
  ctx = c;
};

const GAP = 7000; // at most one remark this often, so it never nags

/** A visual reports what the person did; Cordi may answer. Resolves with the choice picked. */
export async function notify(act: Act): Promise<string | null> {
  // on a call with the live agent, it hears what the person does and can bring it up itself
  if (agentActive()) {
    if (act.type !== "idle") agentNote(describe(act));
    return null;
  }
  const now = performance.now();
  if (ctx.quiet() || remark.get().now || now - lastAt < GAP) return null;
  const inChat = explain.get().how === "chat";
  if (inChat && !chatHasRoom(act)) return null;
  lastAt = now; // reserve the slot while the provider thinks
  const r = await provider({ camp: ctx.camp, beat: ctx.beat, act });
  if (!r || ctx.quiet() || (inChat && !chatHasRoom(act))) return null;
  lastAt = performance.now();
  return inChat ? intoChat(r, act) : show(r);
}

// ---------------------------------------------------------------- in the chat
// In the chat the conversation is the person's: Cordi's remark joins it as one more message
// (its answers as buttons under it), never while they're writing or just after an exchange,
// and at most once per step (besides the "¿un ejemplo?" question).
const QUIET_AFTER_TALK = 20000;
const QUIET_WHILE_TYPING = 8000;
const remarked = new Set<string>();

function chatHasRoom(act: Act) {
  const c = chat.get();
  const ex = explain.get();
  if (c.busy || c.quick) return false;
  if (Date.now() - c.typedAt < QUIET_WHILE_TYPING) return false;
  const last = c.msgs.at(-1);
  if (last && Date.now() - last.at < QUIET_AFTER_TALK) return false;
  if (act.type !== "idle" && remarked.has(`${ex.stepId}:${ex.i}`)) return false;
  return true;
}

function intoChat(r: Remark, act: Act): Promise<string | null> {
  const ex = explain.get();
  if (act.type !== "idle") remarked.add(`${ex.stepId}:${ex.i}`);
  answer?.(null);
  orb.flashEmo(r.choices ? "curious" : "happy", 1400);
  tones.soft();
  const id = logMsg("cordi", r.text, ex.title);
  remember(r.text);
  if (!r.choices) return Promise.resolve(null);
  chat.set({ quick: { msgId: id, choices: r.choices } });
  return new Promise((res) => {
    answer = res;
  });
}

/** Puts a remark up; with choices, resolves with the one picked (null if dismissed). */
export function show(r: Remark): Promise<string | null> {
  answer?.(null);
  orb.flashEmo(r.choices ? "curious" : "happy", 1600);
  orb.hop(0.4);
  tones.soft();
  remark.set((s) => ({ now: r, key: s.key + 1 }));
  remember(r.text);
  return new Promise((res) => {
    answer = res;
    if (!r.choices) setTimeout(() => remark.get().now === r && dismiss(), Math.max(3500, r.text.length * 60));
  });
}

export function pick(id: string) {
  tones.tap();
  const a = answer;
  answer = null;
  const q = chat.get().quick;
  if (q) {
    const label = q.choices.find((c) => c.id === id)?.label;
    chat.set({ quick: null });
    if (label) logMsg("you", label, explain.get().title);
  }
  remark.set({ now: null });
  a?.(id);
}

export function dismiss() {
  const a = answer;
  answer = null;
  if (chat.get().quick) chat.set({ quick: null });
  remark.set({ now: null });
  a?.(null);
}

// ---------------------------------------------------------------- the local rules
function localRules({ act }: Context): Remark | null {
  switch (act.type) {
    case "what-if": {
      const inside = act.value >= act.lo && act.value <= act.hi;
      const was = act.real >= act.lo && act.real <= act.hi;
      if (inside && !was) return { text: tr(`That's it! With ${fmt(act.fmt, act.value)} you'd be in the healthy zone.`, `¡Eso es! Con ${fmt(act.fmt, act.value)} estarías en la zona sana.`) };
      if (!inside && act.value < act.lo) return { text: tr(`With ${fmt(act.fmt, act.value)} you'd still be short of ${fmt(act.fmt, act.lo)}.`, `Con ${fmt(act.fmt, act.value)} aún faltaría para llegar a ${fmt(act.fmt, act.lo)}.`) };
      if (!inside && act.value > act.hi) return { text: tr("Going over isn't ideal either: the extra could be working on other goals.", "Pasarse tampoco es ideal: lo que sobra podría trabajar en otras metas.") };
      return null;
    }
    case "focus":
      if (act.of !== undefined && act.of > 0) {
        const left = act.of - act.value;
        return left > 0 ? { text: tr(`In ${act.label.toLowerCase()} there are ${fmt(act.fmt, left)} still to earn.`, `En ${act.label.toLowerCase()} quedan ${fmt(act.fmt, left)} por ganar.`) } : { text: tr(`${act.label}: maxed out. Nice!`, `${act.label}: al máximo. ¡Bien!`) };
      }
      return null;
    case "flip":
      return act.after && act.to > act.from ? { text: tr(`Look: ${act.to - act.from} more points from a single step.`, `Fíjate: ${act.to - act.from} puntos más con un solo paso.`) } : null;
    case "idle":
      return {
        text: tr("Want me to put it with a simpler example?", "¿Quieres que te lo cuente con un ejemplo más sencillo?"),
        choices: [
          { id: "simpler", label: tr("Yes, with an example", "Sí, con un ejemplo") },
          { id: "on", label: tr("No, let's go on", "No, seguimos") },
          { id: "stay", label: tr("I'm still looking", "Sigo mirando") },
        ],
      };
  }
}

/** What the person did, in words, for the live agent's context. */
function describe(act: Act) {
  switch (act.type) {
    case "what-if":
      return `On screen, the person dragged "${act.label}" to try ${fmt(act.fmt, act.value)} (their real figure is ${fmt(act.fmt, act.real)}; healthy range ${fmt(act.fmt, act.lo)} to ${fmt(act.fmt, act.hi)}). If it helps, comment on what that value would mean, briefly.`;
    case "focus":
      return `On screen, the person tapped the bar "${act.label}" (${fmt(act.fmt, act.value)}${act.of ? ` of ${fmt(act.fmt, act.of)}` : ""}).`;
    case "flip":
      return `On screen, the person switched the score view to "${act.after ? "after the step" : "today"}" (${act.from} to ${act.to}).`;
    default:
      return "";
  }
}
