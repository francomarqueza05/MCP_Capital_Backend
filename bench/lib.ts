// Shared pieces for the model benchmarks: timed calls with cost, percentiles, and the checks
// that turn "is this answer good?" into numbers.
import { config } from "../src/config";

/** Sherpas proxy prices, USD per million tokens (input, output), from the hackathon README. */
export const PROXY_PRICES: Record<string, [number, number]> = {
  "deepseek-flash": [0.3, 1.2],
  "gemini-3.5-flash-lite": [0.3, 2.5],
  "gpt-5-mini": [0.25, 2.0],
};

export type ChatResult = { text: string; ms: number; inTok: number; outTok: number; cost: number; error?: string };

export async function chat(model: string, messages: { role: string; content: string }[], timeoutMs = 60_000): Promise<ChatResult> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${config.llmProxyUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.teamKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = performance.now() - t0;
    if (!res.ok) return { text: "", ms, inTok: 0, outTok: 0, cost: 0, error: `${res.status} ${(await res.text()).slice(0, 120)}` };
    const d = await res.json();
    const inTok = d?.usage?.prompt_tokens ?? 0;
    const outTok = d?.usage?.completion_tokens ?? 0;
    const [pi, po] = PROXY_PRICES[model] ?? [0, 0];
    return { text: String(d?.choices?.[0]?.message?.content ?? "").trim(), ms, inTok, outTok, cost: (inTok * pi + outTok * po) / 1e6 };
  } catch (e) {
    return { text: "", ms: performance.now() - t0, inTok: 0, outTok: 0, cost: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export function stats(xs: number[]) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, p50: NaN, p95: NaN, mean: NaN };
  const at = (q: number) => v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)];
  return { n: v.length, p50: at(0.5), p95: at(0.95), mean: v.reduce((a, b) => a + b, 0) / v.length };
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as T;
  } catch {
    return null;
  }
}

/** Every number in a text, normalised to digits only, so "$113,300" and "113.300" both read 113300. */
export function numbers(text: string): string[] {
  return (text.match(/\d[\d.,]*\d|\d/g) ?? []).map((n) => {
    const digits = n.replace(/[.,](?=\d{3}(\D|$))/g, "");
    return digits.replace(",", ".").replace(/\.0+$/, "");
  });
}

/** Numbers in `output` that never appear in the allowed material. Years and small counts are fine. */
export function inventedNumbers(output: string, allowed: string): string[] {
  const ok = new Set(numbers(allowed));
  return numbers(output).filter((n) => !ok.has(n) && !/^(19|20)\d\d$/.test(n) && !(Number(n) <= 12 && !n.includes(".")));
}

/** Latin American words and forms a Spain-Spanish guide should not use. */
const LATAM = /\b(ahorita|platic\w*|carro|carros|computadora|celular(es)?|plata|chévere|chamba|departamento|recámara|manejar|apurarse|ustedes)\b/gi;
export const latamWords = (text: string) => [...new Set((text.match(LATAM) ?? []).map((w) => w.toLowerCase()))];

/** A strong model scores against a rubric. Returns 1-5 per criterion and a one-line reason. */
export async function judge(rubric: Record<string, string>, material: string, model = "gpt-5-mini") {
  const r = await chat(
    model,
    [
      {
        role: "system",
        content:
          "You are a strict evaluator. Score each criterion from 1 (bad) to 5 (excellent) using only the material. " +
          `Criteria: ${Object.entries(rubric).map(([k, v]) => `${k}: ${v}`).join("; ")}. ` +
          `Reply only with JSON: {${Object.keys(rubric).map((k) => `"${k}": n`).join(", ")}, "reason": "one short sentence"}`,
      },
      { role: "user", content: material },
    ],
    90_000,
  );
  const scores = parseJson<Record<string, number | string>>(r.text) ?? {};
  return { scores, cost: r.cost };
}

export const usd = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(3)}`;
export const ms = (n: number) => (Number.isFinite(n) ? `${Math.round(n)} ms` : "n/a");
