// Typed access to the precomputed case data (src/data/cases.json: the four Sherpas example
// households, generated once from their analysis; the generator lives in the `legacy-backend`
// git tag). Every word and number on the summary comes from here: no AI, no guessing.
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

export const CASES = raw as unknown as Record<string, Case>;
export const CASE_IDS = Object.keys(CASES);
export const DEFAULT_CASE = CASE_IDS[0];

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
