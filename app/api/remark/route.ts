// Cordi speaking up on its own: given what the person just did on the screen, a short remark,
// or a question with two or three answers, or nothing. JSON in, JSON out. The client keeps its
// own rules as a fallback, so a slow or failed model just means the local remark.
import { ask } from "@/server/llm";
import { caseById, systemPrompt, type Where } from "@/server/cordi";
import { loadCases } from "@/server/mcp";
import { langNote, useRequestLang } from "@/server/lang";

type Body = { caseId: string; where?: Where; act: unknown; fallback?: { text: string; choices?: { id: string; label: string }[] } | null };

export async function POST(req: Request) {
  const lang = useRequestLang(req);
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  await loadCases(); // the households, from the Sherpas MCP
  const c = caseById(String(b.caseId ?? ""));
  if (!c) return Response.json({ error: "bad_request" }, { status: 400 });

  const task = [
    "La persona está mirando el gráfico descrito en 'Gráfico en pantalla' y acaba de hacer esto (JSON):",
    JSON.stringify(b.act),
    b.fallback ? `Idea base de comentario (puedes mejorarla o descartarla): ${JSON.stringify(b.fallback)}` : "",
    "Cordi reacciona como quien mira el mismo gráfico a su lado. Reglas:",
    "- Habla SOLO de lo que se ve en ese gráfico y de lo que acaba de hacer (el valor que probó, la barra que tocó, el antes/después que cambió). Nombra el elemento por su etiqueta.",
    "- Aporta algo que el paso no dijo: qué significa ese valor que probó, cuánto le separa de lo sano, o una pregunta que le haga pensar sobre ese dato. Nada genérico.",
    "- No repitas la frase del paso ni nada de 'LO QUE YA LE HAS DICHO'.",
    "- No adelantes lo que se explica en pasos [MÁS ADELANTE].",
    "- Máximo 22 palabras, cifras con números en formato español.",
    "- Si no aporta nada nuevo, mejor callar.",
    'Responde SOLO con JSON: {"text": "..."} o {"text": null}. Sin "choices", salvo en la acción "idle".',
    'Si la acción es "idle" (lleva un rato mirando sin hacer nada): pregúntale algo sobre el gráfico en pantalla que le ayude a entenderlo, y termina ofreciendo un ejemplo. Incluye exactamente estas opciones: {"id":"simpler","label":"Sí, con un ejemplo"}, {"id":"on","label":"No, seguimos"}, {"id":"stay","label":"Sigo mirando"}.',
    lang === "en" ? 'In English, the option labels are "Yes, with an example", "No, let\'s go on" and "I\'m still looking". Write "text" in English, at most 22 words.' : "",
  ]
    .filter(Boolean)
    .join("\n");

  const out = await ask("fast", [
    { role: "system", content: systemPrompt(c, b.where ?? {}) + langNote(lang) },
    { role: "user", content: task },
  ], { json: true });
  if (!out) return Response.json({ error: "unavailable" }, { status: 503 });
  try {
    const j = JSON.parse(out.replace(/^```(?:json)?|```$/g, "").trim());
    if (!j?.text) return Response.json({ remark: null });
    const choices = Array.isArray(j.choices)
      ? j.choices
          .slice(0, 3)
          .map((x: { id?: unknown; label?: unknown }) => ({ id: String(x.id ?? ""), label: String(x.label ?? "") }))
          .filter((x: { id: string; label: string }) => x.id && x.label)
      : undefined;
    return Response.json({ remark: { text: String(j.text).slice(0, 220), ...(choices?.length ? { choices } : {}) } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
