// A question to Cordi: the family's analysis, where they are, the recent conversation, and
// the question. Returns Cordi's answer, or 503 when the model can't answer (the client then
// falls back to its own line).
import { ask, type ChatMessage } from "@/server/llm";
import { caseById, stayOnStep, systemPrompt, type Where } from "@/server/cordi";
import { mapPrompt, mapState } from "@/server/map";
import { langNote, useRequestLang } from "@/server/lang";

type Body = { caseId: string; question: string; where?: Where; history?: { who: "you" | "cordi"; text: string }[] };

export async function POST(req: Request) {
  const lang = useRequestLang(req);
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const c = caseById(String(b.caseId ?? ""));
  const question = String(b.question ?? "").trim().slice(0, 600);
  if (!c || !question) return Response.json({ error: "bad_request" }, { status: 400 });

  // on the map: Cordi as guide, with figures limited to what's been explained, and maybe an
  // offer to go to a camp ("go"), which the chat turns into a button
  if (b.where?.mode === "map") {
    const out = await ask("fast", [
      { role: "system", content: mapPrompt(c, b.where.known ?? {}, { camp: b.where.camp, said: b.where.said }) + langNote(lang) },
      ...(b.history ?? []).slice(-8).map<ChatMessage>((m) => ({ role: m.who === "you" ? "user" : "assistant", content: String(m.text).slice(0, 800) })),
      { role: "user", content: question },
    ], { json: true });
    if (!out) return Response.json({ error: "unavailable" }, { status: 503 });
    try {
      const j = JSON.parse(out.replace(/^```(?:json)?|```$/g, "").trim());
      const ids = mapState(c, b.where.known ?? {}).ids;
      const go = typeof j.go === "string" && ids.includes(j.go) ? j.go : null;
      return Response.json({ answer: String(j.text ?? "").replace(/[*_#`]/g, "").trim(), go });
    } catch {
      return Response.json({ answer: out.replace(/[{}"*_#`]/g, "").trim(), go: null });
    }
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(c, b.where ?? {}) + langNote(lang) },
    ...(b.history ?? []).slice(-8).map<ChatMessage>((m) => ({ role: m.who === "you" ? "user" : "assistant", content: String(m.text).slice(0, 800) })),
    // the step rule again, right before the question: where the model looks hardest
    ...(stayOnStep(c, b.where ?? {}) ? [{ role: "system" as const, content: stayOnStep(c, b.where ?? {}) }] : []),
    ...(lang === "en" ? [{ role: "system" as const, content: "Answer in English." }] : []),
    { role: "user", content: question },
  ];
  const answer = await ask("fast", messages);
  if (!answer) return Response.json({ error: "unavailable" }, { status: 503 });
  return Response.json({ answer: answer.replace(/[*_#`]/g, "").trim() });
}
