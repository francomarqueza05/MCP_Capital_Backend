// Creates Cordi's English live agent: a copy of the Spanish "Cordada guide" (same prompt, tools
// and model) set to English, with VOICE_ID_EN as its voice and an English first message. Then
// it writes the new id to .env as ELEVENLABS_AGENT_ID_EN. Safe to run again: if that variable
// is already set, it only updates that agent.
//
//   node scripts/agent-en.mjs
//
// Uses curl, not fetch: from some networks Node's fetch to api.elevenlabs.io hangs while curl
// goes through.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ENV = ".env";
const text = readFileSync(ENV, "utf8");
const get = (k) => (text.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^"|"$/g, "");
const key = get("ELEVENLABS_API_KEY");
const base = get("ELEVENLABS_AGENT_ID");
const voice = get("VOICE_ID_EN");
let agent = get("ELEVENLABS_AGENT_ID_EN");
if (!key || !base || !voice) throw new Error("Needs ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID and VOICE_ID_EN in .env");

function api(method, path, body) {
  const args = ["-s", "--max-time", "60", "-X", method, "-H", `xi-api-key: ${key}`, "-H", "content-type: application/json", "-w", "\n%{http_code}"];
  if (body) args.push("--data-binary", JSON.stringify(body));
  let out;
  try {
    out = execFileSync("curl", [...args, `https://api.elevenlabs.io${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    // never rethrow the original: its message carries the command line, key included
    throw new Error(`${method} ${path}: curl exit ${e.status} (28 = timed out: ElevenLabs agents API not answering, try later)`);
  }
  const i = out.lastIndexOf("\n");
  const status = Number(out.slice(i + 1));
  const json = out.slice(0, i) ? JSON.parse(out.slice(0, i)) : {};
  if (status >= 300 || !status) throw new Error(`${method} ${path}: ${status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

if (!agent) {
  agent = api("POST", `/v1/convai/agents/${base}/duplicate`, { name: "Cordada guide (English)" }).agent_id;
  writeFileSync(ENV, `${text.replace(/\n?$/, "\n")}ELEVENLABS_AGENT_ID_EN=${agent}\n`);
  console.log("created", agent);
}

api("PATCH", `/v1/convai/agents/${agent}`, {
  name: "Cordada guide (English)",
  conversation_config: {
    agent: {
      language: "en",
      first_message: "Hi {{name}}! I'm Cordi, the guide your advisor's team set up for you. I'm an AI, and you can interrupt me any time. Let's start with where you stand today.",
    },
    tts: { voice_id: voice, model_id: "eleven_v3_conversational" },
  },
});
console.log("English agent ready:", agent);
