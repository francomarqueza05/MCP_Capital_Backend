// Typed access to the households. They come from the Sherpas MCP (src/server/mcp.ts reads it
// on the server and the page hands them to the browser, both through setCases). Until then, and
// whenever the MCP can't be reached, the copy bundled with the app (src/data/cases.json, made
// from the same MCP) stands in. Every word and number on the summary comes from here: no AI,
// no guessing.
import raw from "./cases.json";
import { EN } from "./cases.en";
import { lang, type Lang } from "@/lib/lang";

export type Status = "good" | "warn" | "bad";
export type Band = "critical" | "vulnerable" | "stable" | "strong";

export type Pillar = { name: string; score: number; points: string };

export type Topic = {
  id: string;
  title: string;
  status: Status;
  label: string;
  scene: string;
  headline: string;
  numbers: Record<string, unknown>;
};

export type Move = { title: string; effort: "low" | "medium" | "high"; before: number; after: number; liftsCap: boolean };

export type Case = {
  id: string;
  household: { names: string[]; couple: boolean; kids: string[]; housing: "own" | "rent" };
  score: { value: number; band: Band; pillars: Pillar[]; caps: string[] };
  topics: Topic[];
  moves: Move[];
};

/** Filled in place (setCases), so every module holding these sees the households read last. */
export const CASES: Record<string, Case> = { ...(raw as unknown as Record<string, Case>) };
export const CASE_IDS: string[] = Object.keys(CASES);
export let DEFAULT_CASE = CASE_IDS[0];
let loadedKey = JSON.stringify(CASES);

/**
 * The households read from the MCP take the place of the bundled ones (same objects, filled in
 * place). A no-op when nothing changed, so it can be called on every render and every request.
 */
export function setCases(next: Record<string, Case>) {
  if (!next || !Object.keys(next).length) return;
  const key = JSON.stringify(next);
  if (key === loadedKey) return;
  loadedKey = key;
  for (const k of Object.keys(CASES)) delete CASES[k];
  Object.assign(CASES, next);
  CASE_IDS.splice(0, CASE_IDS.length, ...Object.keys(next));
  DEFAULT_CASE = CASE_IDS[0];
  cache.clear();
}

/** The case in a language: in English, every Spanish string of the data swapped for its translation. */
export function localize(c: Case, l: Lang): Case {
  if (l === "es") return c;
  const t = (s: string) => EN[s] ?? s;
  return {
    ...c,
    score: { ...c.score, pillars: c.score.pillars.map((p) => ({ ...p, name: t(p.name) })) },
    topics: c.topics.map((x) => ({
      ...x,
      title: t(x.title),
      label: t(x.label),
      headline: t(x.headline),
      numbers: Object.fromEntries(Object.entries(x.numbers).map(([k, v]) => [k, typeof v === "string" ? t(v) : v])),
    })),
  };
}

const cache = new Map<string, Case>();
/** A case in the page's language (the same object each time, so React memos hold). */
export const getCase = (id: string | null | undefined, l: Lang = lang()): Case => {
  const c = CASES[id ?? ""] ?? CASES[DEFAULT_CASE];
  const k = `${l}:${c.id}`;
  if (!cache.has(k)) cache.set(k, localize(c, l));
  return cache.get(k)!;
};

/** "16/30" → { got: 16, of: 30 } */
export const pillarPoints = (p: Pillar) => {
  const [got, of] = p.points.split("/").map(Number);
  return { got: got || 0, of: of || 0 };
};

/** Points the household has climbed, before any cap holds the score down. */
export const climbed = (c: Case) => c.score.pillars.reduce((a, p) => a + pillarPoints(p).got, 0);
