// The agent's client tools that need the plan: lookup (figures on a topic) and the brief that
// follows a phase (phase_done). The browser relays the agent's call here and its answer back.
import { caseById } from "@/server/cordi";
import { explainBrief, figures, lookup, TOPIC_OF } from "@/server/brief";
import { mapBrief, mapLookup, type Known } from "@/server/map";

type Body = { caseId: string; tool: "lookup" | "next_brief" | "explain_brief"; topic?: string; from?: number; next?: string | null; campId?: string; camp?: string; said?: string[]; known?: Known; mode?: "explain" | "map" };

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
  if (b.tool === "next_brief") {
    // right after a camp the screen offers one way on (its "Siguiente" button): Cordi proposes
    // that same camp, not an open choice the screen can't follow
    const after =
      b.next !== undefined
        ? b.next
          ? `RIGHT NOW (the camp was just explained): in one short sentence say what this camp means for them, then propose going on to «${String(b.next)}», the next camp on the route and the one on the screen's button. Do not offer a choice or list other camps. If they ask for a different camp, tell them they can tap its flag on the mountain.`
          : "RIGHT NOW (the camp was just explained): every flag is planted. In one short sentence say what this camp means for them, then propose going up to the summit for the summary and the first step. Do not list camps."
        : "";
    return Response.json({ result: [after, mapBrief(c, b.known ?? {}, b.camp, (b.said ?? []).map(String))].filter(Boolean).join("\n") });
  }
  // the call goes on into another camp's explanation: that camp's brief, as at the start
  if (b.tool === "explain_brief" && b.campId) {
    const brief = explainBrief(c, String(b.campId), Math.max(0, Number(b.from ?? 0)), (b.said ?? []).map(String));
    if (brief) return Response.json({ result: brief });
  }
  return Response.json({ error: "bad_request" }, { status: 400 });
}
