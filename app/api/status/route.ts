// What's switched on, without revealing any key: the client adapts (live answers, voice). The
// live agent counts only if there's one for the page's language.
import { env } from "@/server/env";
import { useRequestLang } from "@/server/lang";

export async function GET(req: Request) {
  const lang = useRequestLang(req);
  const agentId = lang === "en" ? env.agentIdEn : env.agentId;
  return Response.json({ ai: Boolean(env.teamKey), voice: Boolean(env.teamKey || env.elevenlabsKey), agent: Boolean(env.elevenlabsKey && agentId) });
}
