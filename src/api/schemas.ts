// The API contract. These schemas validate requests and generate the OpenAPI document that the
// front end is built against (GET /openapi.json, browsable at /docs).
import { z } from "@hono/zod-openapi";

export const ErrorSchema = z
  .object({ error: z.object({ code: z.string().openapi({ example: "unauthorized" }), message: z.string() }) })
  .openapi("Error");

export const Lang = z.enum(["es", "en"]).openapi({ description: "Language of the family. Spanish by default." });

export const Fact = z
  .object({
    id: z.string(),
    label: z.string().openapi({ example: "Accessible cash (bank accounts plus taxable money market)" }),
    value: z.union([z.number(), z.string()]),
    display: z.string().openapi({ example: "$30,000" }),
    unit: z.string().openapi({ example: "USD" }),
    period: z.string().optional(),
    doNotConfuseWith: z.array(z.string()).optional(),
  })
  .openapi("Fact", { description: "A figure from the family's plan, exactly as the plan states it." });

export const Visual = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("figure"), fact: Fact }),
    z.object({
      kind: z.literal("ridge"),
      toAge: z.number(),
      flags: z.array(z.object({ age: z.number(), label: z.string(), tone: z.literal("attention").optional() })),
    }),
    z.object({ kind: z.literal("quote"), text: z.string() }),
    z.object({ kind: z.literal("step"), title: z.string(), detail: z.string() }),
  ])
  .openapi("Visual", {
    description: "What to show while the guide talks. `ridge` is drawn with GET /v1/visuals/ridge (savings by age).",
  });

export const PhaseId = z.enum(["discovery", "today", "focus", "tension", "route", "step", "commit"]);

export const Packet = z
  .object({
    phase: PhaseId,
    name: z.string().openapi({ example: "Lo que más destaca" }),
    index: z.number(),
    of: z.number(),
    depth: z.number().openapi({ description: "1 when the phase is repeated in more depth." }),
    goal: z.string(),
    facts: z.array(Fact).openapi({ description: "The only figures the guide may quote in this phase." }),
    planSays: z.array(z.string()),
    analogy: z.string().nullable(),
    visual: Visual,
    ask: z.array(
      z.object({ question: z.string(), chips: z.array(z.string()), field: z.enum(["worry", "level", "accepted"]) }),
    ).openapi({ description: "Questions for this phase, with tappable answers." }),
    exit: z.string(),
    avoid: z.array(z.string()),
    fallback: z.array(z.string()).openapi({ description: "Lines a scripted guide can say, in the family's language." }),
    maxTurns: z.number(),
  })
  .openapi("Packet", { description: "One phase of the conversation, decided by the engine." });

export const Persona = z
  .object({
    name: z.string(),
    household: z.object({ adults: z.array(z.string()), children: z.array(z.string()), place: z.string() }),
    language: Lang,
    level: z.enum(["new", "basics", "expert"]),
    worry: z.string().nullable(),
    worryTopic: z.string().nullable(),
    riskProfile: z.string().nullable(),
    motivation: z.string().nullable(),
    decisionStyle: z.string().nullable(),
    previousConversation: z.string().nullable(),
  })
  .openapi("Persona", { description: "Who the guide is talking to. Pass these as the agent's dynamic variables." });

export const Goal = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    detail: z.string(),
    due: z.string().nullable().openapi({ example: "2026-11-21" }),
    status: z.enum(["open", "done"]),
    createdAt: z.string(),
    checkins: z.array(z.object({ at: z.string(), note: z.string().nullable() })),
  })
  .openapi("Goal");

export const SessionView = z
  .object({
    session: z.object({ id: z.string().uuid(), done: z.boolean(), plan: z.array(PhaseId), phase: PhaseId, lang: Lang }),
    persona: Persona,
    packet: Packet.nullable().openapi({ description: "Null once the conversation is over." }),
    agentBrief: z.string().nullable().openapi({
      description: "The current phase as instructions for the live agent: send it as the `phase_brief` dynamic variable at start, and return it from the `phase_done` client tool.",
    }),
  })
  .openapi("SessionView");

export const PhaseDoneInput = z
  .object({
    understood: z.boolean().optional().openapi({ description: "false if they did not follow: the engine repeats the phase in more depth once." }),
    wantsMore: z.boolean().optional(),
    emotion: z.string().max(40).optional(),
    answers: z
      .object({
        worry: z.string().max(300).optional().openapi({ description: "Discovery: their worry, in their own words." }),
        level: z.string().max(40).optional().openapi({ description: "Discovery: simple, basics or detail (Spanish or English)." }),
        accepted: z.boolean().optional().openapi({ description: "Commit: true if they agreed a day for the first step." }),
      })
      .optional(),
  })
  .openapi("PhaseDoneInput");

export const Lookup = z
  .object({
    topic: z.string(),
    label: z.string(),
    facts: z.array(Fact),
    planSays: z.array(z.string()),
    analogy: z.string(),
    rules: z.array(z.string()),
  })
  .openapi("Lookup");

export const Topic = z.enum(["score", "retirement", "cash", "cashflow", "debt", "protection", "education", "investments", "home"]);
