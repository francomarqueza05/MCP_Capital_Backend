// Cordi's voice for any line: ElevenLabs with the team's own key first (Cordi's voice lives in
// that account), the Sherpas proxy if there's no key or it fails. Cached on disk by text, so a
// line is paid for once however many times it's said.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "@/server/env";
import { forSpeech } from "@/lib/speech";
import { asLang, setLang, type Lang } from "@/lib/lang";

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

/**
 * Cordi's one voice: the same voice, model, settings, seed and language on every line and by
 * either road (ElevenLabs directly or the proxy), so no line sounds like someone else. These
 * are ElevenLabs' own defaults, what the proxy used when Cordi sounded best; the life comes
 * from v3 and its direction tag (perform, below), not from loosening the settings.
 */
const SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
const SEED = 7;

// some proxies refuse fields they don't know: if it turns down the voice settings, it's asked
// again without them (and from then on), rather than leaving Cordi silent
let proxyTakesSettings = true;

async function viaProxy(text: string, LANG: Lang) {
  if (!env.teamKey || Date.now() < proxyDownUntil) return null;
  await slot();
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const body = { model: env.voiceModel, voice: env.voiceIdFor(LANG), input: text, response_format: "mp3", speed: env.voiceSpeed, seed: SEED, language_code: LANG, ...(proxyTakesSettings ? { voice_settings: { ...SETTINGS, speed: env.voiceSpeed } } : {}) };
      const res = await fetch(`${env.llmProxyUrl}/v1/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.teamKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      if (res?.ok) return Buffer.from(await res.arrayBuffer());
      if (res?.status === 429) {
        const after = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 4000) : 800 * (attempt + 1));
        continue;
      }
      const why = res ? await res.text().catch(() => "") : "";
      if (res && (res.status === 400 || res.status === 422) && proxyTakesSettings && !/budget/i.test(why)) {
        proxyTakesSettings = false;
        continue;
      }
      // down, unreachable or out of budget: skip it briefly, then try it again
      proxyDownUntil = Date.now() + 30_000;
      console.error("tts via proxy failed, skipping it for 30 seconds", res?.status, why.slice(0, 200));
      return null;
    }
    console.error("tts via proxy still rate-limited after retries");
    return null;
  } finally {
    release();
  }
}

async function direct(text: string, LANG: Lang) {
  if (!env.elevenlabsKey) return null;
  const model = env.voiceModel.replace(/^eleven-/, "eleven_").replace(/[-.]/g, "_");
  // a burst of lines fetched ahead can hit the plan's limit on lines at once (429): wait and
  // try again rather than leave the line silent
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${env.voiceIdFor(LANG)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env.elevenlabsKey, "Content-Type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model, seed: SEED, language_code: LANG, voice_settings: { ...SETTINGS, speed: env.voiceSpeed } }),
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);
    if (res?.ok) return Buffer.from(await res.arrayBuffer());
    if (res?.status === 429) {
      await sleep(700 * (attempt + 1));
      continue;
    }
    console.error("tts direct failed", res?.status);
    return null;
  }
  return null;
}

/**
 * Direction for the voice (eleven v3 reads a bracketed audio tag as how to say a line, and
 * never says it). One and the same for every line, with a fixed seed: a different tag per line
 * made the voice itself shift a little from one line to the next, and Cordi must always sound
 * like the same person. Cheerful is how the greeting sounded best.
 */
function perform(text: string) {
  // v3 and v4 read audio tags; an older model would say "[cheerfully]" out loud
  if (!/v[34]/.test(env.voiceModel)) return text;
  // a breath between sentences, as a pause tag. Written as "..." it read as hesitation and the
  // last syllable dragged on ("cada añoooo"): the word ran 25% longer. The tag gives the same
  // pause or more (0.6 s, measured) with the word said at its normal length. Questions and
  // exclamations already get theirs
  // an answer written by the model may bring its own "...": a plain stop, so it doesn't drag
  const plain = text.replace(/\s*(\.\.\.|…)\s*/g, ". ").replace(/\.\s*$/, ".");
  const paced = plain.replace(/([^.])\.\s+(?=[¿¡"«(A-ZÁÉÍÓÚÑ])/g, "$1. [short pause] ");
  return `[cheerfully] ${paced}`;
}

/**
 * Everything that shapes how a line sounds, beyond its text, model, voice and pace: the
 * settings, the seed and the language. Part of each cached line's name, so changing any of it
 * makes every line again in the new voice instead of mixing old takes with new ones.
 */
const VOICE_VERSION = (l: Lang) => `s${SETTINGS.stability}-b${SETTINGS.similarity_boost}-y${SETTINGS.style}-seed${SEED}-${l}`;
const cached = (l: Lang, said: string) =>
  join(dir, `${createHash("sha1").update(`${VOICE_VERSION(l)}|${env.voiceModel}|${env.voiceIdFor(l)}|${env.voiceSpeed}|${said}`).digest("hex").slice(0, 16)}.mp3`);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = String(body?.text ?? "").trim().slice(0, 600);
  if (!text) return new Response("bad request", { status: 400 });
  const l = asLang(body?.lang);
  setLang(l);
  // the figures written out in words, so the voice reads them the way a person would
  const said = perform(forSpeech(text));
  const file = cached(l, said);
  let buf: Buffer | null = existsSync(file) ? readFileSync(file) : null;
  if (!buf) {
    buf = (await direct(said, l)) ?? (await viaProxy(said, l));
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
