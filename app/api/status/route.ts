// What's switched on, without revealing any key: the client adapts (live answers, voice). The
// live agent counts only if there's one for the page's language.
import { env } from "@/server/env";
import { useRequestLang } from "@/server/lang";
import { casesSource, loadCases } from "@/server/mcp";

/**
 * Whether the live agent can really be opened: its id and key are set, and ElevenLabs gives a
 * call URL for it with that key (the agent must live in that key's account). Checked once in a
 * while, so a wrong or missing pairing never offers a call that then fails to connect: the
 * local call takes over from the start instead.
 */
const agentOk = new Map<string, { ok: boolean; at: number }>();
async function agentReady(agentId: string) {
  if (!agentId || !env.agentKey) return false;
  const hit = agentOk.get(agentId);
  if (hit && Date.now() - hit.at < (hit.ok ? 10 * 60_000 : 60_000)) return hit.ok;
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { "xi-api-key": env.agentKey },
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  const ok = Boolean(res?.ok);
  if (!ok) console.error("agent not reachable with this key:", res?.status ?? "network");
  agentOk.set(agentId, { ok, at: Date.now() });
  return ok;
}

export async function GET(req: Request) {
  const lang = useRequestLang(req);
  const agentId = lang === "en" ? env.agentIdEn : env.agentId;
  await loadCases();
  // cases: where the households came from ("mcp", or "bundled" when the MCP couldn't be read)
  return Response.json({ ai: Boolean(env.teamKey), voice: Boolean(env.teamKey || env.elevenlabsKey), agent: await agentReady(agentId), cases: casesSource() });
}
