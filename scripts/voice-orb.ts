// Pre-renders the orb's scripted lines (web/orb/voice/lines.json) with ElevenLabs as WAV, keeping
// per-word start times so the captions can follow the voice. A line is rendered once per
// text+voice; edited lines replace their old audio. Writes manifest.js, which the page loads
// with a plain <script> so it also works opened from disk.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "web/orb/voice";
// Raquel: young, bright, cheerful peninsular Spanish (picked by ear against six others)
const VOICE = process.env.ORB_VOICE_ID || "1eHrpOW5l98cxiSRjbzJ";
// v3 is the expressive model and reads audio tags like [cheerfully]
const MODEL = "eleven_v3";
const DEFAULT_TAG = "[cheerfully]";
const key = process.env.ELEVENLABS_API_KEY;

type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
type Entry = { text: string; file: string | null; words: number[]; end: number };
// A line is plain text, or text with its own delivery tag
type Line = string | { text: string; tag: string };

// Start time of each space-separated word, matching how the page splits the caption.
// The leading audio tag is spoken as tone, not words, so skip past it.
function wordStarts(text: string, a: Alignment): number[] {
  const starts: number[] = [];
  const chars = a.characters;
  let from = chars.join("").indexOf(text);
  if (from < 0) from = chars.indexOf("]") + 1;
  for (let i = from; i < chars.length; i++) {
    if (chars[i] !== " " && (i === from || chars[i - 1] === " ")) starts.push(a.character_start_times_seconds[i]);
  }
  const count = text.split(" ").length;
  while (starts.length < count) starts.push(starts.at(-1) ?? 0);
  return starts.slice(0, count);
}

const RATE = 24000;

// The model's audio stops dead on the last sample, which sounds like a cut. Ease the
// edges and leave a little air after the last word, then wrap the raw PCM as WAV.
function finish(pcm: Buffer): Buffer {
  const n = pcm.length >> 1, fadeIn = RATE * 0.01, fadeOut = Math.min(n, RATE * 0.12), pad = RATE * 0.25;
  const out = Buffer.alloc((n + pad) * 2);
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < fadeIn) g = i / fadeIn;
    if (i > n - fadeOut) g *= (n - i) / fadeOut;
    out.writeInt16LE(Math.round(pcm.readInt16LE(i * 2) * g), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + out.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(out.length, 40);
  return Buffer.concat([header, out]);
}

// Peak of the last 30 ms, in dBFS: a loud tail is what makes the end sound clipped.
function tailPeak(pcm: Buffer): number {
  const n = pcm.length >> 1;
  let peak = 0;
  for (let i = Math.max(0, n - RATE * 0.03); i < n; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)));
  return Math.round(20 * Math.log10(Math.max(1, peak) / 32768));
}

// Takes are random; retry a take that still ends loud and keep the cleanest ending.
async function render(text: string): Promise<{ audio: Buffer; alignment: Alignment } | null> {
  let best: { pcm: Buffer; alignment: Alignment; tail: number } | null = null;
  for (let attempt = 0; attempt < 3 && (!best || best.tail > -30); attempt++) {
    const take = await renderOnce(text);
    if (!take) break;
    const tail = tailPeak(take.pcm);
    if (!best || tail < best.tail) best = { ...take, tail };
  }
  if (!best) return null;
  console.log(`  tail peak ${best.tail} dBFS`);
  return { audio: finish(best.pcm), alignment: best.alignment };
}

async function renderOnce(text: string): Promise<{ pcm: Buffer; alignment: Alignment } | null> {
  if (!key) return null;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=pcm_${RATE}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5 } }),
  }).catch(() => null);
  if (!res?.ok) {
    console.error("render failed", res?.status, await res?.text().catch(() => ""));
    return null;
  }
  const j = await res.json();
  return { pcm: Buffer.from(j.audio_base64, "base64"), alignment: j.alignment };
}

const lines: Record<string, Line> = JSON.parse(readFileSync(join(DIR, "lines.json"), "utf8"));
mkdirSync(DIR, { recursive: true });
const manifest: Record<string, Entry> = {};

for (const [id, value] of Object.entries(lines)) {
  const { text, tag } = typeof value === "string" ? { text: value, tag: DEFAULT_TAG } : value;
  // the trailing "..." lets the model finish the last word instead of stopping mid-sound
  const spoken = `${tag} ${text} ...`;
  const stem = `${id}-${createHash("sha1").update(`${MODEL}|${VOICE}|${spoken}`).digest("hex").slice(0, 10)}`;
  const wav = join(DIR, `${stem}.wav`), timing = join(DIR, `${stem}.json`);
  if (!existsSync(wav) || !existsSync(timing)) {
    const out = await render(spoken);
    if (!out) {
      manifest[id] = { text, file: null, words: [], end: 0 };
      continue;
    }
    writeFileSync(wav, out.audio);
    writeFileSync(timing, JSON.stringify(out.alignment));
    console.log("rendered", id);
  }
  const a: Alignment = JSON.parse(readFileSync(timing, "utf8"));
  manifest[id] = { text, file: `${stem}.wav`, words: wordStarts(text, a), end: a.character_end_times_seconds.at(-1) ?? 0 };
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${id}-`) && f !== `${stem}.wav` && f !== `${stem}.json`) unlinkSync(join(DIR, f));
  }
}

writeFileSync(join(DIR, "manifest.js"), `// Generated by scripts/voice-orb.ts from lines.json. Do not edit.\nwindow.ORB_VOICE = ${JSON.stringify(manifest, null, 1)};\n`);
const missing = Object.entries(manifest).filter(([, e]) => !e.file).map(([id]) => id);
console.log(`manifest: ${Object.keys(manifest).length} lines${missing.length ? `, no audio for: ${missing.join(", ")}` : ""}`);
