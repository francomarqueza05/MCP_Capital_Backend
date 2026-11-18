// What Cordi remembers about a family between visits, in this browser: the flags planted, how
// far each camp was explained, the first step they committed to (and its date), and when they
// came. It is what makes day 3 and day 30 possible: on the way back, Cordi knows where they
// left it and asks about the step. Stored per household; nothing leaves the browser.
//
// For the demo, time can be moved forward: ?days=30 in the link (or Shift+T, +3 days a press)
// makes the app believe that many days have passed since the last visit.
import { createStore } from "@/lib/store";
import { understanding, type Mark } from "@/expedition/understanding";
import { known, progress } from "@/explain/player";

export type Plan = {
  /** The Sherpas move they chose (its English title, as in the data). */
  move: string;
  /** When they said they'd do it, yyyy-mm-dd. */
  due: string;
  /** When they committed (ms, on the app's clock). */
  at: number;
  /** Who in the household said "I'm in" (a couple needs both). */
  agreed: string[];
  /** The sub-steps ticked off. */
  ticks: number[];
  /** When they said it was done. */
  done?: number;
  /** The last thing they said was in the way, if they haven't done it yet. */
  blocker?: string;
};

export type Saved = {
  marks: Record<string, Mark>;
  done: Record<string, true>;
  seen: Record<string, number>;
  at: Record<string, number>;
  plan: Plan | null;
  /** Steps finished before, newest last: the climb so far. */
  history: Plan[];
  firstVisit: number;
  lastVisit: number;
  visits: number;
};

const KEY = (caseId: string) => `cordada.v1.${caseId}`;
const SHIFT = "cordada.shiftDays";
const DAY = 86_400_000;

function read<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

/** Days the demo clock is ahead of the real one. */
export const clock = createStore({ shift: 0 });
export const now = () => Date.now() + clock.get().shift * DAY;

/** Moves the demo clock forward (and remembers it for reloads). */
export function shiftDays(d: number) {
  const shift = Math.max(0, clock.get().shift + d);
  clock.set({ shift });
  write(SHIFT, shift);
}

/**
 * The memory of the open household. `back` is what the person sees on arrival: null on a
 * first visit, or how long they've been away and what they left pending.
 */
export const memory = createStore({
  caseId: "",
  saved: null as Saved | null,
  back: null as { days: number; plan: Plan | null; planted: number } | null,
});

let unsub: (() => void)[] = [];

/** Loads a household's memory into the app's stores and keeps it saved from then on. */
export function openMemory(caseId: string) {
  unsub.forEach((u) => u());
  unsub = [];
  if (typeof window === "undefined") return;
  // the demo clock: from the link, else from the last session
  const q = Number(new URLSearchParams(location.search).get("days"));
  clock.set({ shift: Number.isFinite(q) && q > 0 ? q : (read<number>(SHIFT) ?? 0) });

  const saved = read<Saved>(KEY(caseId));
  const t = now();
  if (saved) {
    understanding.set({ marks: saved.marks ?? {} });
    known.set({ done: saved.done ?? {}, seen: saved.seen ?? {} });
    progress.set({ at: saved.at ?? {} });
    const days = Math.floor((t - saved.lastVisit) / DAY);
    const planted = Object.values(saved.marks ?? {}).filter((m) => m === "yes").length;
    memory.set({ caseId, saved, back: { days, plan: saved.plan, planted } });
  } else {
    memory.set({ caseId, saved: null, back: null });
  }
  const base: Saved = saved ?? { marks: {}, done: {}, seen: {}, at: {}, plan: null, history: [], firstVisit: t, lastVisit: t, visits: 0 };
  base.lastVisit = t;
  base.visits += 1;
  base.history ??= [];
  write(KEY(caseId), base);
  memory.set({ saved: base });

  const persist = () => {
    const s = memory.get().saved;
    if (!s) return;
    const next: Saved = { ...s, marks: understanding.get().marks, done: known.get().done, seen: known.get().seen, at: progress.get().at, lastVisit: now() };
    memory.set({ saved: next });
    write(KEY(caseId), next);
  };
  unsub = [understanding.subscribe(persist), known.subscribe(persist), progress.subscribe(persist)];
}

/** Changes the plan (the commitment) and saves it. */
export function setPlan(fn: (p: Plan | null) => Plan | null) {
  const s = memory.get().saved;
  if (!s) return;
  const plan = fn(s.plan);
  const next = { ...s, plan };
  memory.set({ saved: next });
  write(KEY(memory.get().caseId), next);
}

/** The step is done: it goes into the history and the plan is cleared for the next one. */
export function finishPlan() {
  const s = memory.get().saved;
  if (!s?.plan) return;
  const doneStep = { ...s.plan, done: now() };
  const next = { ...s, plan: null, history: [...(s.history ?? []), doneStep] };
  memory.set({ saved: next, back: memory.get().back ? { ...memory.get().back!, plan: doneStep } : null });
  write(KEY(memory.get().caseId), next);
}

/** Forget this household (start over), for the demo. */
export function forget(caseId: string) {
  try {
    localStorage.removeItem(KEY(caseId));
    localStorage.removeItem(SHIFT);
  } catch {}
}

export const daysUntil = (due: string) => Math.round((new Date(`${due}T12:00:00`).getTime() - now()) / DAY);
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
