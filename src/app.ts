// The HTTP API. Every route is declared with its schema, so requests are validated and the
// OpenAPI document (GET /openapi.json, browsable at /docs) is always the real contract.
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { config } from "./config";
import { issueToken } from "./auth/token";
import { caseIds, getCase } from "./cases/load";
import { lookup } from "./engine/lookup";
import { TOPICS, type TopicId } from "./engine/topics";
import { advisorBrief, loadSession, nextStep, openSession, phaseDone } from "./api/service";
import { ApiError } from "./api/errors";
import { memberAuth, serverAuth, type Env } from "./api/auth";
import * as S from "./api/schemas";
import { getStore } from "./store/store";
import { agentSignedUrl, speech } from "./voice/speech";

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const errors = {
  400: json(S.ErrorSchema, "Invalid input"),
  401: json(S.ErrorSchema, "Missing or invalid credentials"),
};
const member = { security: [{ Member: [] }], middleware: [memberAuth] };

export function createApp() {
  const app = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const first = result.error.issues[0];
        return c.json({ error: { code: "bad_input", message: `${first?.path.join(".") || "body"}: ${first?.message ?? "invalid"}` } }, 400);
      }
    },
  });

  app.use("*", cors({ origin: config.corsOrigins, allowHeaders: ["authorization", "content-type", "x-api-key"], maxAge: 600 }));

  app.onError((e, c) => {
    if (e instanceof ApiError) return c.json({ error: { code: e.code, message: e.message } }, e.status);
    if (e instanceof HTTPException) return c.json({ error: { code: "http_error", message: e.message } }, e.status);
    console.error(e);
    return c.json({ error: { code: "internal", message: "Something went wrong on our side." } }, 500);
  });

  app.openAPIRegistry.registerComponent("securitySchemes", "Member", {
    type: "http",
    scheme: "bearer",
    description: "The token from a family member's personal link.",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "Server", { type: "apiKey", in: "header", name: "x-api-key" });

  // ---------- Health and docs ----------

  app.get("/health", (c) => c.json({ ok: true, cases: caseIds().length }));
  app.doc31("/openapi.json", (c) => ({
    openapi: "3.1.0",
    info: {
      title: "Cordada API",
      version: "0.1.0",
      description:
        "Backend for Cordada: a voice guide that walks a family through their Sherpas financial plan. " +
        "A phase engine (code, not the model) decides what is covered and which figures may be said; the live voice agent only talks.",
    },
    servers: [{ url: new URL(c.req.url).origin }],
  }));
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  // ---------- Conversations ----------

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/sessions",
      tags: ["Conversation"],
      summary: "Open a conversation",
      description: "Starts the phase plan for the member behind the token, carrying over what was learnt last time.",
      ...member,
      request: { body: { content: { "application/json": { schema: z.object({ lang: S.Lang.optional() }) } } } },
      responses: { 201: json(S.SessionView, "The conversation and its first phase"), ...errors },
    }),
    async (c) => {
      const { caseData, member: m, owner } = c.get("caller");
      const { lang } = c.req.valid("json");
      return c.json(await openSession(caseData, m, owner, lang), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/sessions/{id}",
      tags: ["Conversation"],
      summary: "Get a conversation and its current phase",
      ...member,
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: { 200: json(S.SessionView, "The conversation"), 404: json(S.ErrorSchema, "Not this person's conversation"), ...errors },
    }),
    async (c) => {
      const { caseData, member: m, owner } = c.get("caller");
      return c.json(await loadSession(caseData, m, owner, c.req.valid("param").id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/sessions/{id}/phase-done",
      tags: ["Conversation"],
      summary: "Report that the current phase is over",
      description:
        "Called from the live agent's `phase_done` client tool. The engine decides what comes next: the same phase in more depth, or the next phase. " +
        "On the commitment phase, `answers.accepted` creates the goal.",
      ...member,
      request: { params: z.object({ id: z.string().uuid() }), body: { content: { "application/json": { schema: S.PhaseDoneInput } } } },
      responses: {
        200: json(S.SessionView.extend({ goal: S.Goal.nullable() }), "The next phase, or a null packet when the conversation is over"),
        404: json(S.ErrorSchema, "Not this person's conversation"),
        409: json(S.ErrorSchema, "The conversation has already ended"),
        ...errors,
      },
    }),
    async (c) => {
      const { caseData, member: m, owner } = c.get("caller");
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const t0 = performance.now();
      const out = await phaseDone(caseData, m, owner, id, input);
      getStore()
        .logEvent(owner, "phase_done", { input, next: out.packet?.phase ?? "end", ms: Math.round(performance.now() - t0) }, id)
        .catch(() => {});
      return c.json(out, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/lookup",
      tags: ["Conversation"],
      summary: "Facts from the plan on one topic",
      description: "Called from the live agent's `lookup` client tool, for questions the current phase does not cover.",
      ...member,
      request: { query: z.object({ topic: S.Topic }) },
      responses: { 200: json(S.Lookup, "Figures and the plan's own words on the topic"), ...errors },
    }),
    (c) => {
      const { caseData, owner } = c.get("caller");
      const { topic } = c.req.valid("query");
      getStore().logEvent(owner, "lookup", { topic }).catch(() => {});
      return c.json(lookup(caseData, topic as TopicId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/topics",
      tags: ["Conversation"],
      summary: "Topics lookup can answer",
      responses: { 200: json(z.array(z.object({ id: S.Topic, label: z.string() })), "The closed list of topics") },
    }),
    (c) => c.json(TOPICS.map((t) => ({ id: t.id, label: t.label })), 200),
  );

  // ---------- Visuals ----------

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/visuals/ridge",
      tags: ["Visuals"],
      summary: "Savings and investments by age",
      ...member,
      responses: {
        200: json(
          z.object({
            yearly: z.array(z.object({ year: z.number(), age: z.number(), investable: z.number(), netWorth: z.number() })),
            goals: z.array(z.object({ year: z.number(), type: z.string(), name: z.string() })),
            runOutAge: z.number().nullable(),
          }),
          "The plan's yearly projection",
        ),
        ...errors,
      },
    }),
    (c) => {
      const { caseData } = c.get("caller");
      return c.json({ yearly: caseData.yearly, goals: caseData.goals, runOutAge: caseData.runOutAge }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/visuals/score",
      tags: ["Visuals"],
      summary: "Health score and its pillars",
      ...member,
      responses: {
        200: json(
          z.object({
            score: z.object({ value: z.number(), band: z.string(), message: z.string() }),
            pillars: z.array(z.object({ name: z.string(), score: z.number(), points: z.string() })),
          }),
          "Score",
        ),
        ...errors,
      },
    }),
    (c) => {
      const { caseData } = c.get("caller");
      return c.json({ score: caseData.score, pillars: caseData.pillars }, 200);
    },
  );

  // ---------- Goals and follow-up ----------

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/goals",
      tags: ["Follow-up"],
      summary: "This person's goals",
      ...member,
      responses: { 200: json(z.array(S.Goal), "Goals, oldest first"), ...errors },
    }),
    async (c) => c.json(await getStore().listGoals(c.get("caller").owner), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/goals",
      tags: ["Follow-up"],
      summary: "Create a goal",
      ...member,
      request: {
        body: {
          required: true,
          content: {
            "application/json": {
              schema: z.object({
                title: z.string().trim().min(1).max(140),
                detail: z.string().max(1000).optional(),
                due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().openapi({ example: "2026-11-21" }),
              }),
            },
          },
        },
      },
      responses: { 201: json(S.Goal, "The new goal"), ...errors },
    }),
    async (c) => {
      const b = c.req.valid("json");
      return c.json(await getStore().createGoal(c.get("caller").owner, { title: b.title, detail: b.detail ?? "", due: b.due ?? null }), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/goals/{id}/checkin",
      tags: ["Follow-up"],
      summary: "Record progress on a goal",
      ...member,
      request: {
        params: z.object({ id: z.string().uuid() }),
        body: { content: { "application/json": { schema: z.object({ note: z.string().max(500).optional(), done: z.boolean().optional() }) } } },
      },
      responses: { 200: json(S.Goal, "The goal with its check-ins"), 404: json(S.ErrorSchema, "Not this person's goal"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const b = c.req.valid("json");
      const g = await getStore().checkin(c.get("caller").owner, id, b.note ?? null, b.done ?? false);
      if (!g) throw new ApiError(404, "not_found", "No such goal for this person.");
      return c.json(g, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/next-step",
      tags: ["Follow-up"],
      summary: "The one thing to do next",
      description: "The open goal, otherwise the plan's next recommendation.",
      ...member,
      responses: {
        200: json(
          z.union([
            z.object({ source: z.literal("goal"), goal: S.Goal }),
            z.object({ source: z.literal("plan"), recommendation: z.string() }),
            z.object({ source: z.literal("none") }),
          ]),
          "Next step",
        ),
        ...errors,
      },
    }),
    async (c) => {
      const { caseData, owner } = c.get("caller");
      return c.json(await nextStep(caseData, owner), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/me",
      tags: ["Follow-up"],
      summary: "Who this link belongs to",
      ...member,
      responses: {
        200: json(z.object({ name: z.string(), household: z.string(), place: z.string(), members: z.array(z.string()) }), "The member"),
        ...errors,
      },
    }),
    (c) => {
      const { caseData, member: m } = c.get("caller");
      return c.json({ name: m.name, household: caseData.family, place: caseData.place, members: caseData.members.map((x) => x.name) }, 200);
    },
  );

  // ---------- Voice ----------

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/voice/agent-session",
      tags: ["Voice"],
      summary: "Signed URL for the live voice agent",
      description:
        "Open it with the ElevenLabs SDK: `startSession({ signedUrl, connectionType: 'websocket', overrides: { agent: { language } }, dynamicVariables, clientTools })`. " +
        "WebSocket, not WebRTC: only WebSocket streams per-character timing for exact captions.",
      ...member,
      responses: {
        200: json(z.object({ signedUrl: z.string() }), "Signed URL, valid for a few minutes"),
        503: json(S.ErrorSchema, "The live agent is not configured or not answering"),
        ...errors,
      },
    }),
    async (c) => {
      const url = await agentSignedUrl();
      if (!url) throw new ApiError(503, "agent_unavailable", "The live guide is not available right now.");
      return c.json({ signedUrl: url }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/voice/speech",
      tags: ["Voice"],
      summary: "Speak one line (scripted mode)",
      description: "Returns audio/mpeg. Cached by text, so each line is paid for once.",
      ...member,
      request: { body: { required: true, content: { "application/json": { schema: z.object({ text: z.string().trim().min(1).max(600) }) } } } },
      responses: {
        200: { content: { "audio/mpeg": { schema: z.string().openapi({ format: "binary" }) } }, description: "MP3 audio" },
        502: json(S.ErrorSchema, "The voice service did not answer"),
        ...errors,
      },
    }),
    async (c) => {
      const buf = await speech(c.req.valid("json").text);
      if (!buf) throw new ApiError(502, "voice_unavailable", "The voice service did not answer. Captions still work.");
      return c.body(new Uint8Array(buf), 200, { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" });
    },
  );

  // ---------- For advisors (Sherpas servers) ----------

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/households/{caseId}/advisor-brief",
      tags: ["Advisor"],
      summary: "What the advisor should know before the meeting",
      security: [{ Server: [] }],
      middleware: [serverAuth],
      request: { params: z.object({ caseId: z.string() }) },
      responses: { 200: json(z.record(z.string(), z.unknown()), "Brief per member"), 404: json(S.ErrorSchema, "No such household"), ...errors },
    }),
    async (c) => {
      const caseData = getCase(c.req.valid("param").caseId);
      if (!caseData) throw new ApiError(404, "not_found", "No such household.");
      return c.json(await advisorBrief(caseData), 200);
    },
  );

  // ---------- Demo ----------

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/demo/households",
      tags: ["Demo"],
      summary: "The four Sherpas cases with a personal link token per member",
      description: "Only when DEMO_MODE is on (always in development). In production, each person gets their link from their advisor.",
      responses: {
        200: json(
          z.array(
            z.object({
              id: z.string(),
              family: z.string(),
              place: z.string(),
              score: z.number(),
              members: z.array(z.object({ id: z.string(), name: z.string(), token: z.string() })),
            }),
          ),
          "Households",
        ),
        404: json(S.ErrorSchema, "Demo mode is off"),
      },
    }),
    (c) => {
      if (!config.demo) throw new ApiError(404, "not_found", "Not found.");
      return c.json(
        caseIds().map((id) => {
          const h = getCase(id)!;
          return {
            id,
            family: h.family,
            place: h.place,
            score: h.score.value,
            members: h.members.map((m) => ({ id: m.id, name: m.name, token: issueToken({ caseId: id, memberId: m.id }) })),
          };
        }),
        200,
      );
    },
  );

  return app;
}
