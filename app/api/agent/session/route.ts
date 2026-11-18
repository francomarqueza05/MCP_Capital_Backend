// Opens a live call with the voice agent: a short-lived signed WebSocket URL (the agent is
// private), plus who the person is and the first phase brief, as the agent's dynamic
// variables. The key never leaves the server.
import { env } from "@/server/env";
import { caseById } from "@/server/cordi";
import { loadCases } from "@/server/mcp";
import { explainBrief, persona } from "@/server/brief";
import { mapBrief, type Known } from "@/server/map";
import { useRequestLang } from "@/server/lang";

// When ElevenLabs does not answer, every "Explain this" would wait for it: after a failure the
// agent is skipped for two minutes and the local call (same voice, same steps) starts at once.
let downUntil = 0;

type Body = { caseId: string; mode: "explain" | "free"; campId?: string; camp?: string; from?: number; said?: string[]; known?: Known; recent?: { who: "you" | "cordi"; text: string }[] };

export async function POST(req: Request) {
  const lang = useRequestLang(req);
  // in English, only an English agent: the Spanish one would speak English with a Spanish voice,
  // and the local call already has the native English voice
  const agentId = lang === "en" ? env.agentIdEn : env.agentId;
  if (Date.now() < downUntil) return Response.json({ error: "agent_unavailable" }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Body | null;
  await loadCases(); // the households, from the Sherpas MCP
  const c = b && caseById(String(b.caseId ?? ""));
  if (!b || !c) return Response.json({ error: "bad_request" }, { status: 400 });
  if (!env.agentKey || !agentId) return Response.json({ error: "agent_unavailable" }, { status: 503 });

  const said = (b.said ?? []).map(String).slice(-24);
  // a free call happens on the map: the same guide rule as the map's chat
  const brief = b.mode === "explain" && b.campId ? explainBrief(c, b.campId, Math.max(0, b.from ?? 0), said) : mapBrief(c, b.known ?? {}, b.camp, said);
  if (!brief) return Response.json({ error: "bad_request" }, { status: 400 });
  // carrying on from the chat (or an earlier call): the agent knows what was asked and answered
  const recent = (b.recent ?? []).slice(-10).map((m) => `${m.who === "you" ? "Person" : "Cordi"}: ${String(m.text).slice(0, 300)}`);
  const phase_brief = recent.length ? `${brief}\nRECENT CONVERSATION (continue from here; do not repeat answers already given):\n${recent.join("\n")}` : brief;

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { "xi-api-key": env.agentKey },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) {
    downUntil = Date.now() + 120_000;
    console.error("agent signed url", res?.status);
    return Response.json({ error: "agent_unavailable" }, { status: 503 });
  }
  const signedUrl = (await res.json()).signed_url;
  if (!signedUrl) return Response.json({ error: "agent_unavailable" }, { status: 503 });
  return Response.json({ signedUrl, dynamicVariables: { ...persona(c, said), phase_brief } });
}
