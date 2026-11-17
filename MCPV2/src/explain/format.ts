// How each kind of figure reads, in Spanish: "$18 k", "3,2 meses", "25%".
import { money, num, short } from "@/lib/copy";
import type { Fmt } from "./beats";

export const fmt = (f: Fmt, v: number) => {
  switch (f) {
    case "money":
      return Math.abs(v) >= 1e4 ? short(v) : money(v);
    case "months":
      return `${num(v, 1)} ${Math.abs(v - 1) < 0.05 ? "mes" : "meses"}`;
    case "pct":
      return `${Math.round(v)}%`;
    case "pts":
      return `${Math.round(v)}`;
    case "years":
      return `${Math.round(v)} años`;
    default:
      return num(v, 1);
  }
};
