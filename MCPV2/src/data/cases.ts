// Typed access to the precomputed case data (src/data/cases.json, imported from web/orb by
// `npm run data`). Every word and number on the summary comes from here: no AI, no guessing.
import raw from "./cases.json";

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

export const getCase = (id: string | null | undefined): Case => CASES[id ?? ""] ?? CASES[DEFAULT_CASE];

/** "16/30" → { got: 16, of: 30 } */
export const pillarPoints = (p: Pillar) => {
  const [got, of] = p.points.split("/").map(Number);
  return { got: got || 0, of: of || 0 };
};

/** Points the household has climbed, before any cap holds the score down. */
export const climbed = (c: Case) => c.score.pillars.reduce((a, p) => a + pillarPoints(p).got, 0);
