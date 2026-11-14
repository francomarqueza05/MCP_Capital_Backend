// Every setting the server reads, in one place. Values come from the environment (.env in dev).

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 8787),
  production: process.env.NODE_ENV === "production",
  /** Postgres connection string. Without it the server runs an embedded Postgres (PGlite). */
  databaseUrl: process.env.DATABASE_URL || null,
  /** Where PGlite keeps its files when no DATABASE_URL is set. "memory" keeps nothing. */
  pgliteDir: process.env.PGLITE_DIR ?? "./.data/pglite",
  /** Front-end origins allowed to call the API from a browser. */
  corsOrigins: list(process.env.CORS_ORIGINS ?? "http://localhost:3000"),
  /** Hands out personal demo links at /v1/demo/links. On in development, opt-in in production. */
  demo: process.env.DEMO_MODE ? process.env.DEMO_MODE === "1" : process.env.NODE_ENV !== "production",
  appSecret: process.env.APP_SECRET,
  serverKey: process.env.SERVER_KEY,
  llmProxyUrl: (process.env.LLM_PROXY_URL ?? "https://llm-hackathon.sherpaswealth.com").replace(/\/$/, ""),
  teamKey: process.env.TEAM_KEY,
  elevenlabsKey: process.env.ELEVENLABS_API_KEY,
  agentId: process.env.ELEVENLABS_AGENT_ID,
  voiceId: process.env.VOICE_ID ?? "eZxqQzb5CuYo3Kl6EXfZ",
  voiceModel: process.env.VOICE_MODEL_LIVE ?? "eleven-flash-v2.5",
  cacheDir: process.env.CACHE_DIR ?? "./.cache",
};
