// Cordi's voice for any line: ElevenLabs through the Sherpas proxy, with the team's own
// ElevenLabs key as fallback (the same order as the Cordada API). Cached on disk by text, so a
// line is paid for once however many times it's said.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "@/server/env";
import { forSpeech } from "@/lib/speech";

const dir = join(process.cwd(), ".cache", "voice");
let proxyDownUntil = 0;

// The proxy limits how many requests arrive at once (it answers 429). So calls to it go out
// at most two at a time, and a 429 waits and tries again instead of giving up: a missing
// voice is a silent Cordi, which is worse than a short wait.
let inFlight = 0;
const queue: (() => void)[] = [];
async function slot() {
  if (inFlight < 2) {
    inFlight++;
    return;
  }
  await new Promise<void>((r) => queue.push(r));
  inFlight++;
}
function release() {
  inFlight--;
  queue.shift()?.();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function viaProxy(text: string) {
  if (!env.teamKey || Date.now() < proxyDownUntil) return null;
  await slot();
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`${env.llmProxyUrl}/v1/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.teamKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: env.voiceModel, voice: env.voiceId, input: text, response_format: "mp3" }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      if (res?.ok) return Buffer.from(await res.arrayBuffer());
      if (res?.status === 429) {
        const after = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 4000) : 800 * (attempt + 1));
        continue;
      }
      // down or unreachable: skip it briefly, then try it again
      proxyDownUntil = Date.now() + 30_000;
      console.error("tts via proxy failed, skipping it for 30 seconds", res?.status);
      return null;
    }
    console.error("tts via proxy still rate-limited after retries");
    return null;
  } finally {
    release();
  }
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
  // the figures written out in words, so the voice reads them the way a person would
  const said = forSpeech(text);
  const file = join(dir, `${createHash("sha1").update(`${env.voiceModel}|${env.voiceId}|${said}`).digest("hex").slice(0, 16)}.mp3`);
  let buf: Buffer | null = existsSync(file) ? readFileSync(file) : null;
  if (!buf) {
    buf = (await viaProxy(said)) ?? (await direct(said));
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
