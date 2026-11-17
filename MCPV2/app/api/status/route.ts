// What's switched on, without revealing any key: the client adapts (live answers, voice).
import { env } from "@/server/env";

export async function GET() {
  return Response.json({ ai: Boolean(env.teamKey), voice: Boolean(env.teamKey || env.elevenlabsKey), agent: Boolean(env.elevenlabsKey && env.agentId) });
}
