// Suggested questions, generated for the moment: after every answer, step or camp change, the
// AI proposes three the person would likely ask next (/api/suggest). Until they arrive, and
// whenever the AI isn't there, the chips fall back to the fixed bank, so there's never a gap.
import { createStore } from "@/lib/store";
import { chat } from "@/stage/chat";
import { explain } from "@/explain/player";
import { checkAI, session, where } from "./client";

export const suggest = createStore({ key: "", list: [] as string[], camp: "" });

/** The pointer is over the chips: a new list waits until it leaves (no swap under the finger). */
let hovering = false;
let parked: { key: string; list: string[]; camp: string } | null = null;
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
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (inflight === key || chat.get().busy) return;
    if (!(await checkAI()).on) return;
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
      if (!r.ok) return;
      const list: string[] = (await r.json()).questions ?? [];
      if (!list.length) return;
      cache.set(key, list);
      // only if it's still the same moment
      if (suggestKey(campId) === key) put({ key, list, camp: campId });
    } catch {
      // keep the fixed ones
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
