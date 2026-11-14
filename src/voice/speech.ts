// The guide's voice for the scripted mode: ElevenLabs through the Sherpas proxy, with the
// team's own ElevenLabs key as fallback. Every line is cached on disk by its text, so a line is
// paid for once however many times it is said.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config";

const dir = () => join(config.cacheDir, "voice");

// When the proxy fails, skip it for a while instead of paying its round trip on every line.
let proxyDownUntil = 0;

async function viaProxy(text: string): Promise<Buffer | null> {
  if (!config.teamKey || Date.now() < proxyDownUntil) return null;
  const res = await fetch(`${config.llmProxyUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.teamKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.voiceModel, voice: config.voiceId, input: text, response_format: "mp3" }),
  }).catch(() => null);
  if (res?.ok) return Buffer.from(await res.arrayBuffer());
  proxyDownUntil = Date.now() + 10 * 60_000;
  console.error("speech via proxy failed, skipping it for 10 minutes", res?.status);
  return null;
}

async function direct(text: string): Promise<Buffer | null> {
  if (!config.elevenlabsKey) return null;
  const model = config.voiceModel.replace(/^eleven-/, "eleven_").replace(/[-.]/g, "_");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenlabsKey, "Content-Type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model }),
  }).catch(() => null);
  if (res?.ok) return Buffer.from(await res.arrayBuffer());
  console.error("speech direct failed", res?.status);
  return null;
}

export async function speech(text: string): Promise<Buffer | null> {
  const file = join(dir(), `${createHash("sha1").update(`${config.voiceModel}|${config.voiceId}|${text}`).digest("hex").slice(0, 16)}.mp3`);
  if (existsSync(file)) return readFileSync(file);
  const buf = (await viaProxy(text)) ?? (await direct(text));
  if (buf) {
    try {
      mkdirSync(dir(), { recursive: true });
      writeFileSync(file, buf);
    } catch {}
  }
  return buf;
}

/** A short-lived signed WebSocket URL for the private live agent. */
export async function agentSignedUrl(): Promise<string | null> {
  if (!config.elevenlabsKey || !config.agentId) return null;
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(config.agentId)}`, {
    headers: { "xi-api-key": config.elevenlabsKey },
  }).catch(() => null);
  if (!res?.ok) {
    console.error("agent signed url", res?.status);
    return null;
  }
  return (await res.json()).signed_url ?? null;
}
