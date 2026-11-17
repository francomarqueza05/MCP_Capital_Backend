// What the voice reads, in words. The screen says "$280 k", "$15.032" or "45%", but read as is
// the voice trips over them ("quince punto cero treinta y dos", "doscientos ochenta ka"). Before
// a line goes to text-to-speech, every figure is written out the way a person would say it.

const UNITS = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

/** "uno" → "un", "veintiuno" → "veintiún", "y uno" → "y un": before "mil", "millones" or a noun. */
const apocope = (w: string) => w.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");

function below1000(n: number): string {
  if (n < 30) return UNITS[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${TENS[t]} y ${UNITS[u]}` : TENS[t];
  }
  if (n === 100) return "cien";
  const h = Math.floor(n / 100);
  const r = n % 100;
  return r ? `${HUNDREDS[h]} ${below1000(r)}` : HUNDREDS[h];
}

/** A whole number in Spanish words (up to the hundreds of thousands of millions). */
export function numberWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n < 1000) return below1000(n);
  const parts: string[] = [];
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  if (millions) parts.push(millions === 1 ? "un millón" : `${apocope(numberWords(millions))} millones`);
  if (thousands) parts.push(thousands === 1 ? "mil" : `${apocope(below1000(thousands))} mil`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/**
 * "15.032" → 15032, "1,43" → 1.43. In Spanish the dot groups thousands and the comma marks
 * decimals; a dot not followed by exactly three digits is taken as a decimal point.
 */
function parse(raw: string): { int: number; dec: string } {
  let s = raw;
  // English grouping from the data ("1,427,456", "15,032.5"): commas group, the dot is decimal
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "").replace(".", ",");
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "");
  else s = s.replace(".", ",");
  const [i, d = ""] = s.split(",");
  return { int: Number(i), dec: d };
}

function amount(raw: string, apo = false) {
  const { int, dec } = parse(raw);
  let w = numberWords(int);
  if (dec) {
    const lead = dec.match(/^0+/)?.[0].length ?? 0;
    w += ` coma ${"cero ".repeat(lead)}${dec.slice(lead) ? numberWords(Number(dec.slice(lead))) : ""}`.trimEnd();
  } else if (apo) w = apocope(w);
  return { w, one: int === 1 && !dec };
}

const NUM = String.raw`\d(?:[\d.,]*\d)?`;
const SIGN = String.raw`([−–-]\s?|\+\s?)?`;
const said = (sign: string | undefined) => (!sign ? "" : sign.trim() === "+" ? "más " : "menos ");

export function forSpeech(text: string): string {
  return (
    text
      // ranges: "8–9", "15 a 20" stays; "8-9 meses" → "8 a 9 meses"
      .replace(/(\d)\s?[–-]\s?(\d)/g, "$1 a $2")
      // money with a scale: "$280 k", "$1,43 M", "−$12 k"
      .replace(new RegExp(String.raw`${SIGN}\$\s?(${NUM})\s?(k|M)\b`, "g"), (_, sign, n, unit) => {
        if (unit === "k") return `${said(sign)}${amount(n, true).w} mil dólares`;
        const a = amount(n, true);
        return `${said(sign)}${a.one ? "un millón" : `${a.w} millones`} de dólares`;
      })
      // plain money: "$15.032"
      .replace(new RegExp(String.raw`${SIGN}\$\s?(${NUM})`, "g"), (_, sign, n) => {
        const a = amount(n, true);
        return `${said(sign)}${a.one ? "un dólar" : `${a.w} dólares`}`;
      })
      // percentages: "45%", "45 %"
      .replace(new RegExp(String.raw`${SIGN}(${NUM})\s?%`, "g"), (_, sign, n) => `${said(sign)}${amount(n).w} por ciento`)
      // any other figure, signed or not
      .replace(new RegExp(String.raw`(^|[\s(«"])([−–]\s?|\+\s?)(?=\d)`, "g"), (_, pre, sign) => `${pre}${said(sign)}`)
      .replace(new RegExp(NUM, "g"), (n) => amount(n).w)
  );
}
