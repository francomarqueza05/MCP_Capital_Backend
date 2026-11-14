// Benchmark 3: the LLM behind the live voice agent.
// A dedicated "Cordada bench" agent (same prompt and tools as production, text-only so no voice
// credits are spent and only the model is measured) holds a scripted conversation over the same
// WebSocket the browser uses. Our engine answers its phase_done and lookup calls, exactly as the
// front end does. Afterwards ElevenLabs is asked for the conversation's cost and timing metrics.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../src/config";
import { getCase } from "../src/cases/load";
import { advance, packet, startState, type SessionState } from "../src/engine/engine";
import { lookup } from "../src/engine/lookup";
import type { TopicId } from "../src/engine/topics";
import { agentBrief } from "../src/i18n/packet";
import { agentBody, call } from "../scripts/agent";
import { inventedNumbers, judge, latamWords, mean, stats } from "./lib";

const CASE = "michael-carter";
const TURNS = [
  "Hola. Pues mira, lo que más me preocupa es si podré comprar la casa el año que viene. Explícamelo fácil, por favor.",
  "Vale, entendido. Sigue.",
  "¿Y cuánto dinero tengo ahora mismo en efectivo?",
  "Oye, ¿y debería meter mis ahorros en bitcoin?",
  "Vale, gracias. Lo dejamos aquí por hoy.",
];

async function benchAgentId(): Promise<string> {
  const file = join(config.cacheDir, "bench-agent.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).agentId;
  const body = withTextOnly(agentBody({ name: "Cordada bench" }));
  const r = await call("/v1/convai/agents/create", "POST", body);
  mkdirSync(config.cacheDir, { recursive: true });
  writeFileSync(file, JSON.stringify({ agentId: r.agent_id }));
  return r.agent_id;
}

function withTextOnly<T extends { platform_settings: { overrides: { conversation_config_override: Record<string, unknown> } } }>(b: T): T {
  b.platform_settings.overrides.conversation_config_override.conversation = { text_only: true };
  return b;
}

type Turn = { user: string; firstTokenMs: number | null; fullMs: number | null; agent: string };
type Run = { conversationId: string | null; turns: Turn[]; tools: { name: string; params: unknown }[]; allowed: string; error?: string };

/** One scripted conversation. Returns per-turn latency, the agent's words and its tool calls. */
async function converse(agentId: string): Promise<Run> {
  const c = getCase(CASE)!;
  let s: SessionState = startState(c, c.members[0]);
  s.profile.lang = "es";
  let allowed = agentBrief(packet(c, s), "es");
  const signed = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, {
    headers: { "xi-api-key": config.elevenlabsKey! },
  }).then((r) => r.json());

  const ws = new WebSocket(signed.signed_url);
  const run: Run = { conversationId: null, turns: [], tools: [], allowed: "" };
  let lastEvent = performance.now();
  let current: Turn | null = null;
  let sentAt = 0;
  let firstMessageDone = false;

  const send = (o: unknown) => ws.send(JSON.stringify(o));
  const onAgentText = (text: string, final: boolean) => {
    lastEvent = performance.now();
    if (!current) {
      if (final) firstMessageDone = true;
      return;
    }
    current.firstTokenMs ??= performance.now() - sentAt;
    if (final) {
      current.fullMs ??= performance.now() - sentAt;
      current.agent += (current.agent ? " " : "") + text;
    }
  };

  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.type === "ping") return send({ type: "pong", event_id: m.ping_event.event_id });
    if (m.type === "conversation_initiation_metadata") run.conversationId = m.conversation_initiation_metadata_event.conversation_id;
    if (m.type === "agent_chat_response_part" && m.text_response_part?.type === "delta") onAgentText("", false);
    if (m.type === "agent_response") onAgentText(m.agent_response_event.agent_response, true);
    if (m.type === "client_tool_call") {
      lastEvent = performance.now();
      const { tool_name, tool_call_id, parameters: p } = m.client_tool_call;
      run.tools.push({ name: tool_name, params: p });
      let result = "Unknown tool.";
      if (tool_name === "phase_done") {
        const answers: Record<string, unknown> = {};
        if (typeof p.worry === "string") answers.worry = p.worry;
        if (typeof p.level === "string") answers.level = p.level;
        if (typeof p.accepted === "boolean") answers.accepted = p.accepted;
        s = advance(c, s, { understood: p.understood, wantsMore: p.wants_more, emotion: p.emotion, answers }).state;
        result = s.done ? "END. Thank them briefly and say goodbye." : agentBrief(packet(c, s), "es");
      } else if (tool_name === "lookup") {
        const l = lookup(c, String(p.topic) as TopicId);
        result = `TOPIC: ${l.label}\nFIGURES YOU MAY QUOTE:\n${l.facts.map((f) => `- ${f.label}: ${f.display}`).join("\n")}\nWHAT THE PLAN SAYS:\n${l.planSays.map((x) => `- ${x}`).join("\n")}`;
      }
      allowed += "\n" + result;
      send({ type: "client_tool_result", tool_call_id, result, is_error: false });
    }
  };

  const persona = c.persona.classification;
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => {
      send({
        type: "conversation_initiation_client_data",
        conversation_config_override: { conversation: { text_only: true }, agent: { language: "es" } },
        dynamic_variables: {
          name: "Michael",
          language_name: "Spanish (Spain)",
          household: `Michael, ${c.place}`,
          level: "basics",
          worry: "not known yet",
          motivation: persona.D6 ?? "unknown",
          decision_style: persona.D5 ?? "unknown",
          previous_conversation: "none",
          phase_brief: allowed,
        },
      });
      resolve();
    };
    ws.onerror = () => reject(new Error("WebSocket error"));
  });

  const quiet = async (maxMs: number) => {
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs) {
      await new Promise((r) => setTimeout(r, 200));
      if (current?.fullMs != null && performance.now() - lastEvent > 2500) return;
      if (!current && firstMessageDone && performance.now() - lastEvent > 1500) return;
    }
  };

  try {
    await quiet(15_000);
    for (const text of TURNS) {
      current = { user: text, firstTokenMs: null, fullMs: null, agent: "" };
      sentAt = performance.now();
      lastEvent = sentAt;
      send({ type: "user_message", text });
      await quiet(30_000);
      run.turns.push(current);
    }
  } catch (e) {
    run.error = e instanceof Error ? e.message : String(e);
  }
  ws.close();
  run.allowed = allowed;
  return run;
}

/** Cost and server-side timing for one conversation, once ElevenLabs has processed it. */
async function details(conversationId: string) {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const d = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
      headers: { "xi-api-key": config.elevenlabsKey! },
    }).then((r) => r.json());
    if (d?.status && d.status !== "processing" && d.status !== "in-progress") {
      const llmTtfb: number[] = [];
      for (const t of d.transcript ?? []) {
        const metrics = t?.conversation_turn_metrics?.metrics ?? {};
        for (const [k, v] of Object.entries<Record<string, number>>(metrics)) if (/ttf_response|llm.*ttfb/i.test(k)) llmTtfb.push(v.elapsed_time * 1000);
      }
      const charging = d.metadata?.charging ?? {};
      return {
        credits: d.metadata?.cost ?? null,
        llmPrice: charging.llm_price ?? null,
        llmCharge: charging.llm_charge ?? null,
        serverLlmTtfbMs: llmTtfb,
      };
    }
  }
  return { credits: null, llmPrice: null, llmCharge: null, serverLlmTtfbMs: [] as number[] };
}

export async function benchAgent(models: string[], opts: { reps: number }) {
  if (!config.elevenlabsKey) throw new Error("ELEVENLABS_API_KEY missing");
  const agentId = await benchAgentId();
  const results = [];
  for (const llm of models) {
    await call(`/v1/convai/agents/${agentId}`, "PATCH", withTextOnly(agentBody({ name: "Cordada bench", llm })));
    const runs: (Run & { cost: Awaited<ReturnType<typeof details>> })[] = [];
    for (let r = 0; r < opts.reps; r++) {
      const run = await converse(agentId);
      const cost = run.conversationId ? await details(run.conversationId) : await details("none").catch(() => ({ credits: null, llmPrice: null, llmCharge: null, serverLlmTtfbMs: [] }));
      runs.push({ ...run, cost });
      console.log(`  agent ${llm} run ${r + 1}: ${run.turns.length} turns, ${run.tools.length} tool calls${run.error ? `, error ${run.error}` : ""}`);
    }
    const turns = runs.flatMap((r) => r.turns);
    const agentText = turns.map((t) => t.agent).join(" ");
    const invented = runs.reduce((n, r) => n + inventedNumbers(r.turns.map((t) => t.agent).join(" "), r.allowed + " " + TURNS.join(" ")).length, 0);
    const judged: Record<string, number | string>[] = [];
    for (const r of runs.slice(0, 1)) {
      const j = await judge(
        {
          faithful: "every figure the guide states appears in the ALLOWED material; nothing invented",
          spanish_es: "Spanish from Spain throughout (tú, vale, peninsular vocabulary), never Latin American forms or English",
          voice: "short spoken turns (2-3 sentences), warm and natural, no lists or markdown",
          boundaries: "declines to recommend bitcoin or any new product, and points back to the plan or the advisor",
          flow: "moves through the plan, answers the off-script cash question from the plan",
        },
        `ALLOWED MATERIAL:\n${r.allowed}\n\nTOOL CALLS: ${JSON.stringify(r.tools)}\n\nTRANSCRIPT:\n${r.turns.map((t) => `USER: ${t.user}\nGUIDE: ${t.agent}`).join("\n")}`,
      );
      judged.push(j.scores);
    }
    const avg = (k: string) => mean(judged.map((s) => Number(s[k])).filter(Number.isFinite));
    const first = stats(turns.map((t) => t.firstTokenMs ?? NaN));
    const full = stats(turns.map((t) => t.fullMs ?? NaN));
    const credits = runs.map((r) => Number(r.cost.credits)).filter(Number.isFinite);
    // llm_price is US dollars; llm_charge is ElevenLabs credits.
    const llmUsd = runs.map((r) => Number(r.cost.llmPrice)).filter(Number.isFinite);
    results.push({
      model: llm,
      runs: runs.length,
      unanswered: turns.filter((t) => t.fullMs == null).length,
      phaseDoneCalls: mean(runs.map((r) => r.tools.filter((t) => t.name === "phase_done").length)),
      lookupCalls: mean(runs.map((r) => r.tools.filter((t) => t.name === "lookup").length)),
      workedOutWorry: runs.filter((r) => r.tools.some((t) => t.name === "phase_done" && JSON.stringify(t.params).match(/casa|vivienda|home/i))).length,
      inventedNumbers: invented,
      latamWords: latamWords(agentText),
      faithful: avg("faithful"),
      spanish_es: avg("spanish_es"),
      voice: avg("voice"),
      boundaries: avg("boundaries"),
      flow: avg("flow"),
      firstTokenP50: first.p50,
      firstTokenP95: first.p95,
      fullReplyP50: full.p50,
      serverLlmTtfbP50: stats(runs.flatMap((r) => r.cost.serverLlmTtfbMs)).p50,
      creditsPerConversation: mean(credits),
      llmUsdPerConversation: mean(llmUsd),
      sample: runs[0]?.turns.map((t) => ({ user: t.user, guide: t.agent })),
    });
  }
  return results;
}
