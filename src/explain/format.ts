// How each kind of figure reads: "$18k", "3.2 months", "25%" ("$18 k", "3,2 meses" in Spanish).
import { money, num, short } from "@/lib/copy";
import { tr } from "@/lib/lang";
import type { Fmt } from "./beats";

export const fmt = (f: Fmt, v: number) => {
  switch (f) {
    case "money":
      return Math.abs(v) >= 1e4 ? short(v) : money(v);
    case "months":
      return `${num(v, 1)} ${Math.abs(v - 1) < 0.05 ? tr("month", "mes") : tr("months", "meses")}`;
    case "pct":
      return `${Math.round(v)}%`;
    case "pts":
      return `${Math.round(v)}`;
    case "years":
      return `${Math.round(v)} ${tr("years", "años")}`;
    default:
      return num(v, 1);
  }
};
