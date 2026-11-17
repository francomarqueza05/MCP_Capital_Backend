// What the person said they understood, camp by camp. A camp's flag is only "planted" once
// they say it's clear; the summit lists the camps still worth going over, and the same marks
// are what an advisor would want to see before the call.
import { createStore } from "@/lib/store";

export type Mark = "yes" | "meh" | "no";

export const understanding = createStore({ marks: {} as Record<string, Mark> });

export const mark = (id: string, m: Mark) => understanding.set((s) => ({ marks: { ...s.marks, [id]: m } }));

export const MARKS: { id: Mark; label: string; icon: string }[] = [
  { id: "yes", label: "Lo entendí", icon: "🙂" },
  { id: "meh", label: "Más o menos", icon: "🤔" },
  { id: "no", label: "No del todo", icon: "😕" },
];
