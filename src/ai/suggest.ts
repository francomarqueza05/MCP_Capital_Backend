// Suggested questions, generated for the moment: after every answer, step or camp change, the
// AI proposes three the person would likely ask next (/api/suggest). On arriving at a camp the
// chips wait for them (about a second) instead of showing the fixed bank and then swapping it
// for the AI's list under the person's eyes. The fixed bank is the fallback: without the AI,
// when it fails, or when it takes too long (and then a late list doesn't replace it).
import { createStore } from "@/lib/store";
import { chat } from "@/stage/chat";
import { explain } from "@/explain/player";
import { checkAI, session, where } from "./client";

export const suggest = createStore({
  key: "",
  list: [] as string[],
  camp: "",
  /** The camp, and the moment, where the AI gave nothing in time: the fixed bank shows there. */
  fallbackCamp: "",
  fallbackKey: "",
});

/** How long the chips wait for the AI's first list at a camp before showing the fixed ones. */
const WAIT_MS = 4000;

/** The pointer is over the chips: a new list waits until it leaves (no swap under the finger). */
let hovering = false;
let parked: { key: string; list: string[]; camp: string } | null = null;
let waitTimer: ReturnType<typeof setTimeout> | undefined;
/** The fixed bank shows at this camp from now on (until the AI has a list for a later moment). */
function fallBack(campId: string, key: string) {
  if (suggest.get().camp === campId) return; // there's already a list for this camp
  suggest.set({ fallbackCamp: campId, fallbackKey: key });
}
export function setHovering(on: boolean) {
  hovering = on;
  if (!on && parked) {
    suggest.set(parked);
    parked = null;
  }
}
const put = (v: { key: string; list: string[]; camp: string }) => {
  if (hovering) parked = v;
  else suggest.set(v);
};

/**
 * What the suggestions depend on: the camp (or the step inside an explanation) and how many
 * questions the person has asked. Cordi's own lines (each step it writes, a remark) don't
 * count, so the chips don't reshuffle while it talks.
 */
export function suggestKey(campId: string) {
  const ex = explain.get();
  const inside = (ex.phase === "playing" || ex.phase === "done") && ex.stepId === campId;
  const asked = chat.get().msgs.filter((m) => m.who === "you").length;
  return `${campId}:${inside ? ex.i : "map"}:${asked}`;
}

const cache = new Map<string, string[]>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight = "";

/** Asks for fresh suggestions for this moment (debounced; cached per moment). */
export function refreshSuggestions(campId: string) {
  const key = suggestKey(campId);
  if (suggest.get().key === key) return;
  const hit = cache.get(key);
  if (hit) return put({ key, list: hit, camp: campId });
  // nothing for this camp yet: the chips wait, but not forever
  clearTimeout(waitTimer);
  if (suggest.get().camp !== campId) waitTimer = setTimeout(() => suggestKey(campId) === key && fallBack(campId, key), WAIT_MS);
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (inflight === key || chat.get().busy) return;
    if (!(await checkAI()).on) return fallBack(campId, key);
    inflight = key;
    try {
      const r = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseId: session.get().caseId,
          where: where(),
          history: chat
            .get()
            .msgs.slice(-6)
            .map((m) => ({ who: m.who, text: m.text })),
        }),
        signal: AbortSignal.timeout(7000),
      });
      if (!r.ok) return fallBack(campId, key);
      const list: string[] = (await r.json()).questions ?? [];
      if (!list.length) return fallBack(campId, key);
      cache.set(key, list);
      // only if it's still the same moment, and the fixed ones aren't already up for it (a late
      // list doesn't swap them out; the next moment brings the AI's)
      const s = suggest.get();
      if (suggestKey(campId) === key && !(s.fallbackCamp === campId && s.fallbackKey === key)) put({ key, list, camp: campId });
    } catch {
      fallBack(campId, key);
    } finally {
      inflight = "";
    }
  }, 450);
}

/** A suggestion was asked: it drops away from this moment's list. */
export function usedSuggestion(q: string) {
  const s = suggest.get();
  suggest.set({ list: s.list.filter((x) => x !== q) });
}
