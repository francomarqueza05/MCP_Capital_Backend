// Server-only settings, from the repo's .env (the shell's environment wins over it), and for
// whatever it leaves empty, the .env one folder up (the team's shared keys live there).
// Nothing here is ever sent to the browser.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let cache: Record<string, string> | null = null;

function shared(): Record<string, string> {
  if (cache) return cache;
  cache = {};
  // on Vercel the keys come in as the project's environment variables: no files to read
  if (process.env.VERCEL) return cache;
  // first file wins; a later one only fills in what the earlier ones left missing or empty.
  // Marked for the bundler to leave alone: traced, these reads pulled the whole project into
  // the server build
  for (const file of [join(process.cwd(), ".env"), join(process.cwd(), "..", ".env")]) {
    if (!existsSync(/*turbopackIgnore: true*/ file)) continue;
    for (const raw of readFileSync(/*turbopackIgnore: true*/ file, "utf8").split(/\r?\n/)) {
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
  /** The Sherpas MCP, where the households come from (src/server/mcp.ts). */
  get mcpUrl() {
    return get("MCP_URL") || "https://mcp-hackathon.sherpaswealth.com/mcp";
  },
  get mcpToken() {
    return get("MCP_TOKEN");
  },
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
  /** The English agent, only once it speaks with the English voice (scripts/agent-en.mjs marks
   * it ready): before that it is a copy of the Spanish one, and Cordi would change voice mid-way. */
  get agentIdEn() {
    return get("ELEVENLABS_AGENT_EN_READY") === "1" ? get("ELEVENLABS_AGENT_ID_EN") : "";
  },
  /** The live agent for a language: English has its own (native voice, English turn-taking). */
  agentIdFor(lang: "en" | "es") {
    return (lang === "en" && get("ELEVENLABS_AGENT_ID_EN")) || get("ELEVENLABS_AGENT_ID");
  },
  get voiceId() {
    return get("VOICE_ID") || "eZxqQzb5CuYo3Kl6EXfZ";
  },
  /** Cordi's voice in a language: a native English voice when one is set. */
  voiceIdFor(lang: "en" | "es") {
    return (lang === "en" && get("VOICE_ID_EN")) || this.voiceId;
  },
  get voiceModel() {
    // v3: the most natural and expressive by far (real intonation, takes direction through
    // audio tags). v4: the model Cordi's Castilian voice is fine-tuned for (the accent holds).
    // It's slower to make a line (~2 s), so lines are fetched ahead of time
    return get("VOICE_MODEL_LIVE") || "eleven-v4";
  },
  /** The natural pace: faster ran the sentences into each other with no breath between them. */
  get voiceSpeed() {
    return Number(get("VOICE_SPEED")) || 1;
  },
};
