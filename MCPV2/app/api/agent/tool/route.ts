// The agent's client tools that need the plan: lookup (figures on a topic) and the brief that
// follows a phase (phase_done). The browser relays the agent's call here and its answer back.
import { caseById } from "@/server/cordi";
import { figures, lookup, TOPIC_OF } from "@/server/brief";
import { mapBrief, mapLookup, type Known } from "@/server/map";

type Body = { caseId: string; tool: "lookup" | "next_brief"; topic?: string; campId?: string; camp?: string; said?: string[]; known?: Known; mode?: "explain" | "map" };

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Body | null;
  const c = b && caseById(String(b.caseId ?? ""));
  if (!b || !c) return Response.json({ error: "bad_request" }, { status: 400 });
  // on the map, lookup only gives the detail of what has been explained
  if (b.tool === "lookup")
    return Response.json({
      result: b.mode === "map" ? mapLookup(c, b.known ?? {}, TOPIC_OF[String(b.topic ?? "")] ?? [], (id) => figures(c, id)) || lookup(c, "none") : lookup(c, String(b.topic ?? "")),
    });
  // after an explanation, the call goes on as the map's guide
  if (b.tool === "next_brief") return Response.json({ result: mapBrief(c, b.known ?? {}, b.camp, (b.said ?? []).map(String)) });
  return Response.json({ error: "bad_request" }, { status: 400 });
}
