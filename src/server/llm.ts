// Text models on the Sherpas proxy (OpenAI-style /v1/chat/completions), the same door the
// Cordada API uses. Tasks ask for a tier, not a model; each tier tries its models in order and
// falls back on a timeout, an error or an empty reply. The team key allows 4 requests at once.
import { env } from "./env";

export type Tier = "fast" | "quality";
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const TIERS: Record<Tier, { models: string[]; timeoutMs: number }> = {
  fast: { models: ["gemini-3.5-flash-lite", "gpt-5-mini"], timeoutMs: 6000 },
  quality: { models: ["gpt-5-mini", "gemini-3.5-flash-lite"], timeoutMs: 20000 },
};

let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 3) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export const llmReady = () => Boolean(env.teamKey);

export async function ask(tier: Tier, messages: ChatMessage[], { json = false } = {}): Promise<string | null> {
  if (!env.teamKey) return null;
  const { models, timeoutMs } = TIERS[tier];
  for (const model of models) {
    try {
      const text = await slot(async () => {
        const res = await fetch(`${env.llmProxyUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.teamKey}`, "Content-Type": "application/json" },
          // a little more variety in the wording where the model allows it (the GPT-5 family only
          // takes its default temperature)
          body: JSON.stringify({ model, messages, ...(model.startsWith("gemini") ? { temperature: 0.9 } : {}), ...(json ? { response_format: { type: "json_object" } } : {}) }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`${model} ${res.status}`);
        const data = await res.json();
        return String(data?.choices?.[0]?.message?.content ?? "").trim();
      });
      if (text) return text;
    } catch (e) {
      console.error("llm", tier, e instanceof Error ? e.message : e);
    }
  }
  return null;
}
