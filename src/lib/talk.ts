// Figures the way a person says them out loud: rounded, with "unos", "casi", "algo más de".
// Nobody says "faltan un millón cuatrocientos veintisiete mil cuatrocientos cincuenta y seis
// dólares"; they say "casi un millón y medio". Used by everything Cordi says (the bubble shows
// the same words; the voice reads them through forSpeech).

import type { Case, Topic } from "@/data/cases";
import { fixFor } from "./copy";
import { numberWords } from "./speech";

/** 15000 → "15.000", always grouped (es-ES leaves four digits ungrouped). */
const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const MILLIONS = ["", "un millón", "dos millones", "tres millones", "cuatro millones", "cinco millones", "seis millones", "siete millones", "ocho millones", "nueve millones", "diez millones"];

/** An amount of money, rounded the way it's said: "unos $15.000", "casi un millón y medio de dólares". */
export function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) {
    const m = a / 1e6;
    const whole = Math.floor(m);
    const f = m - whole;
    const name = (k: number) => MILLIONS[k] ?? `${k} millones`;
    if (f < 0.04) return `${name(whole)} de dólares`;
    if (f < 0.2) return `algo más de ${name(whole)} de dólares`;
    if (f < 0.42) return `más de ${name(whole)} de dólares`;
    if (f < 0.5) return `casi ${name(whole)} y medio de dólares`;
    if (f < 0.6) return `${name(whole)} y medio de dólares`;
    if (f < 0.85) return `más de ${name(whole)} y medio de dólares`;
    return `casi ${name(whole + 1)} de dólares`;
  }
  // two significant figures above ten thousand, hundreds below
  const step = a >= 1e5 ? 1e4 : a >= 1e4 ? 1e3 : a >= 1e3 ? 100 : 10;
  const r = Math.round(a / step) * step;
  const near = Math.abs(r - a) / Math.max(a, 1) < 0.001 ? "" : "unos ";
  return `${near}$${group(r)}`;
}

/** Months, said simply: "un mes y medio", "casi ocho meses", "dieciséis meses". */
export function months(x: number): string {
  // a year or more: whole months are plenty ("unos dieciséis meses")
  if (x >= 10) {
    const r = Math.round(x);
    return `${Math.abs(r - x) < 0.08 ? "" : "unos "}${numberWords(r)} meses`;
  }
  const half = Math.round(x * 2) / 2;
  const whole = Math.floor(half);
  const words = ["ningún", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce"];
  const w = (k: number) => words[k] ?? String(k);
  const pre = Math.abs(half - x) < 0.08 ? "" : half > x ? "casi " : "algo más de ";
  if (half === 0) return "nada";
  if (half % 1) return `${pre}${whole ? `${w(whole)} ${whole === 1 ? "mes" : "meses"} y medio` : "medio mes"}`;
  return `${pre}${w(whole)} ${whole === 1 ? "mes" : "meses"}`;
}

/** A share as people say it: 0.13 → "13 de cada 100". */
export const ofHundred = (share: number) => `${Math.round(share * 100)} de cada 100`;

/** One way of saying something, taking turns by position, so neighbours never sound the same. */
export const pickBy = <T,>(i: number, options: T[]): T => options[Math.max(0, i) % options.length];

/** Where this topic falls among the ones with a fix: the fix lines take turns by it. */
export const fixRank = (c: Case, t: Topic) =>
  c.topics
    .filter((x) => {
      const f = fixFor(c, x);
      return f && f.after > f.before;
    })
    .findIndex((x) => x.id === t.id);
