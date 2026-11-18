// The questions to suggest right now: three short ones the person would likely ask next, given
// what's on screen, what was just said and what they've already asked. Same rules as Cordi's
// answers: inside an explanation nothing from later steps; on the map, only what's explained
// (or orientation). The chips show them; tapping one asks Cordi.
import { ask, type ChatMessage } from "@/server/llm";
import { caseById, stayOnStep, systemPrompt, type Where } from "@/server/cordi";
import { loadCases } from "@/server/mcp";
import { mapPrompt } from "@/server/map";
import { langNote, useRequestLang } from "@/server/lang";

type Body = { caseId: string; where?: Where; history?: { who: "you" | "cordi"; text: string }[] };

export async function POST(req: Request) {
  const lang = useRequestLang(req);
  const b = (await req.json().catch(() => null)) as Body | null;
  await loadCases(); // the households, from the Sherpas MCP
  const c = b && caseById(String(b.caseId ?? ""));
  if (!b || !c) return Response.json({ error: "bad_request" }, { status: 400 });
  const w = b.where ?? {};
  const map = w.mode === "map";
  const we = c.household.couple;

  const system = map ? mapPrompt(c, w.known ?? {}, { camp: w.camp, said: w.said }) : [systemPrompt(c, w), stayOnStep(c, w)].filter(Boolean).join("\n\n");
  const recent = (b.history ?? []).slice(-6).map((m) => `${m.who === "you" ? "Persona" : "Cordi"}: ${m.text}`).join("\n");
  const task = [
    "TAREA NUEVA (ignora el formato de respuesta anterior).",
    "Propón 3 preguntas que esta persona probablemente quiera hacerle a Cordi AHORA, escritas como las diría ella, en primera persona" + (we ? " del plural (somos una pareja: «nuestra», «pagamos»)" : "") + ".",
    "- Cortas: máximo 8 palabras cada una. Sin cifras inventadas.",
    "- Concretas sobre lo que tiene en pantalla o lo último que se dijo; variadas (una de por qué, una de qué significa para mí, una de qué puedo hacer).",
    "- No repitas preguntas ya hechas ni cosas ya respondidas en la conversación.",
    map
      ? "- Estás en el mapa: preguntas de orientación, repaso o sobre campamentos ya EXPLICADOS; puede haber una para ir a un campamento sin explicar (p. ej. «¿Por qué no baja mi deuda?»)."
      : "- No preguntes por lo que se explica en pasos posteriores (MÁS ADELANTE / PRÓXIMOS PASOS).",
    recent ? `CONVERSACIÓN RECIENTE:\n${recent}` : "",
    'Responde SOLO con JSON: {"questions": ["...", "...", "..."]}',
    lang === "en" ? `Write the 3 questions in natural American English, first person${we ? " plural (we are a couple: \"our\", \"we pay\")" : ""}, max 8 words each.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: system + langNote(lang) },
    { role: "user", content: task },
  ];
  const out = await ask("fast", messages, { json: true });
  if (!out) return Response.json({ error: "unavailable" }, { status: 503 });
  try {
    const j = JSON.parse(out.replace(/^```(?:json)?|```$/g, "").trim());
    const questions = (Array.isArray(j.questions) ? j.questions : [])
      // the model sometimes runs two questions together ("…día?,¿Podemos…?"): split them
      .flatMap((q: unknown) => String(q).split(/(?<=\?)\s*,?\s*(?=[¿A-ZÁÉÍÓÚ])/))
      .map((q: string) => q.replace(/[*_#`"]/g, "").replace(/^,\s*/, "").trim())
      .filter((q: string) => q.length > 3 && q.length <= 80)
      .slice(0, 3);
    return Response.json({ questions });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
