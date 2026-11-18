// Server-only settings, from the repo's .env (the shell's environment wins over it), and for
// whatever it leaves empty, the .env one folder up (the team's shared keys live there).
// Nothing here is ever sent to the browser.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let cache: Record<string, string> | null = null;

function shared(): Record<string, string> {
  if (cache) return cache;
  cache = {};
  // first file wins; a later one only fills in what the earlier ones left missing or empty
  for (const file of [join(process.cwd(), ".env"), join(process.cwd(), "..", ".env")]) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v && !cache[k]) cache[k] = v;
    }
  }
  return cache;
}

const get = (k: string) => process.env[k] || shared()[k] || "";

export const env = {
  get llmProxyUrl() {
    return get("LLM_PROXY_URL") || "https://llm-hackathon.sherpaswealth.com";
  },
  get teamKey() {
    return get("TEAM_KEY");
  },
  get elevenlabsKey() {
    return get("ELEVENLABS_API_KEY");
  },
  get agentId() {
    return get("ELEVENLABS_AGENT_ID");
  },
  get voiceId() {
    return get("VOICE_ID") || "eZxqQzb5CuYo3Kl6EXfZ";
  },
  get voiceModel() {
    // v3: the most natural and expressive by far (real intonation, takes direction through
    // audio tags). It's slower to make a line (~2 s), so lines are fetched ahead of time
    return get("VOICE_MODEL_LIVE") || "eleven-v3";
  },
  /** The natural pace: faster ran the sentences into each other with no breath between them. */
  get voiceSpeed() {
    return Number(get("VOICE_SPEED")) || 1;
  },
};
