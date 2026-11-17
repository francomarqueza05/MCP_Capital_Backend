// Cordi's voice for any line: ElevenLabs through the Sherpas proxy, with the team's own
// ElevenLabs key as fallback (the same order as the Cordada API). Cached on disk by text, so a
// line is paid for once however many times it's said.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "@/server/env";

const dir = join(process.cwd(), ".cache", "voice");
let proxyDownUntil = 0;

async function viaProxy(text: string) {
  if (!env.teamKey || Date.now() < proxyDownUntil) return null;
  const res = await fetch(`${env.llmProxyUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.teamKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.voiceModel, voice: env.voiceId, input: text, response_format: "mp3" }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (res?.ok) return Buffer.from(await res.arrayBuffer());
  proxyDownUntil = Date.now() + 10 * 60_000;
  console.error("tts via proxy failed, skipping it for 10 minutes", res?.status);
  return null;
}

async function direct(text: string) {
  if (!env.elevenlabsKey) return null;
  const model = env.voiceModel.replace(/^eleven-/, "eleven_").replace(/[-.]/g, "_");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${env.voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.elevenlabsKey, "Content-Type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (res?.ok) return Buffer.from(await res.arrayBuffer());
  console.error("tts direct failed", res?.status);
  return null;
}

export async function POST(req: Request) {
  const text = String((await req.json().catch(() => ({})))?.text ?? "").trim().slice(0, 600);
  if (!text) return new Response("bad request", { status: 400 });
  const file = join(dir, `${createHash("sha1").update(`${env.voiceModel}|${env.voiceId}|${text}`).digest("hex").slice(0, 16)}.mp3`);
  let buf: Buffer | null = existsSync(file) ? readFileSync(file) : null;
  if (!buf) {
    buf = (await viaProxy(text)) ?? (await direct(text));
    if (buf) {
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, buf);
      } catch {}
    }
  }
  if (!buf) return new Response("voice unavailable", { status: 502 });
  return new Response(new Uint8Array(buf), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
}
