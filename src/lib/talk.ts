// Figures the way a person says them out loud: rounded, with "about", "almost", "a little over"
// ("unos", "casi", "algo más de" in Spanish). Nobody says "one million four hundred twenty-seven
// thousand four hundred fifty-six dollars"; they say "almost one and a half million". Used by
// everything Cordi says (the bubble shows the same words; the voice reads them through forSpeech).

import type { Case, Topic } from "@/data/cases";
import { fixFor } from "./copy";
import { numberWords } from "./speech";
import { isEs } from "./lang";

/** 15000 → "15.000", always grouped (es-ES leaves four digits ungrouped). */
const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const MILLIONS = ["", "un millón", "dos millones", "tres millones", "cuatro millones", "cinco millones", "seis millones", "siete millones", "ocho millones", "nueve millones", "diez millones"];
const EN_N = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** An amount of money, rounded the way it's said: "about $15,000", "almost one and a half million dollars". */
export function money(n: number): string {
  if (!isEs()) return moneyEn(n);
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

function moneyEn(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) {
    const m = a / 1e6;
    const whole = Math.floor(m);
    const f = m - whole;
    const name = (k: number) => (k > 0 && EN_N[k] ? EN_N[k] : String(k));
    if (f < 0.04) return `${name(whole)} million dollars`;
    if (f < 0.2) return `a little over ${name(whole)} million dollars`;
    if (f < 0.42) return `over ${name(whole)} million dollars`;
    if (f < 0.5) return `almost ${name(whole)} and a half million dollars`;
    if (f < 0.6) return `${name(whole)} and a half million dollars`;
    if (f < 0.85) return `over ${name(whole)} and a half million dollars`;
    return `almost ${name(whole + 1)} million dollars`;
  }
  const step = a >= 1e5 ? 1e4 : a >= 1e4 ? 1e3 : a >= 1e3 ? 100 : 10;
  const r = Math.round(a / step) * step;
  const near = Math.abs(r - a) / Math.max(a, 1) < 0.001 ? "" : "about ";
  return `${near}$${r.toLocaleString("en-US")}`;
}

/** Months, said simply: "a month and a half", "almost eight months", "sixteen months". */
export function months(x: number): string {
  if (!isEs()) return monthsEn(x);
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

function monthsEn(x: number): string {
  if (x >= 10) {
    const r = Math.round(x);
    return `${Math.abs(r - x) < 0.08 ? "" : "about "}${r} months`;
  }
  const half = Math.round(x * 2) / 2;
  const whole = Math.floor(half);
  const w = (k: number) => EN_N[k] ?? String(k);
  const pre = Math.abs(half - x) < 0.08 ? "" : half > x ? "almost " : "a little over ";
  if (half === 0) return "nothing";
  if (half % 1) return `${pre}${whole ? `${w(whole)} ${whole === 1 ? "month" : "months"} and a half` : "half a month"}`;
  return `${pre}${w(whole)} ${whole === 1 ? "month" : "months"}`;
}

/** A share as people say it: 0.13 → "13 out of every 100". */
export const ofHundred = (share: number) => `${Math.round(share * 100)} ${isEs() ? "de cada" : "out of every"} 100`;

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

/**
 * A big amount in everyday terms: how many years of everything the household spends today it
 * is (spending = what comes in minus what is left over, from the case's cash flow). Null when
 * the case has no cash flow or the amount is too small to say it that way.
 */
export function yearsOfSpending(c: Case, amount: number): number | null {
  const cf = c.topics.find((t) => t.id === "cashflow")?.numbers as Record<string, number> | undefined;
  const out = cf ? +cf.income - +cf.flow : 0;
  if (!out || amount < out * 0.75) return null;
  return Math.round((amount / out) * 2) / 2;
}
export const yearsSaid = (y: number) =>
  isEs()
    ? `${y % 1 ? `${Math.floor(y)} años y medio` : `${y} ${y === 1 ? "año" : "años"}`} de todo lo que se gasta hoy en casa`
    : `${y % 1 ? `${Math.floor(y)} and a half years` : `${y} ${y === 1 ? "year" : "years"}`} of everything your household spends today`;
