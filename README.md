# Cordada API

Backend for **Cordada**, our entry to the Sherpas x UPV hackathon ("Bring the plan to life"): a voice guide that walks a family through their Sherpas financial plan, then keeps them on track with one next step at a time.

The front end lives in a separate repo ([MCP_Capital](https://github.com/francomarqueza05/MCP_Capital)) and talks to this API over HTTP.

## Run it

Node 22 or later.

```bash
npm install
cp .env.example .env   # fill in the keys
npm run dev            # http://localhost:8787
```

- API docs (try every call from the browser): http://localhost:8787/docs
- OpenAPI document: http://localhost:8787/openapi.json
- Tests: `npm test`. Type-check: `npm run typecheck`.

With no `DATABASE_URL`, the API runs an embedded Postgres (PGlite) in `./.data`, so it works with zero setup. Set `DATABASE_URL` (Neon, Supabase…) to use a hosted Postgres; the schema is the same and migrations run on start.

## How it works

1. **Phase engine** (`src/engine`). Code, not the language model, decides what the conversation covers and in what order: discovery, where you stand, what stands out, the tension, the road ahead, the first step, the commitment. The family's worry steers the focus. Each phase is a *packet*: its goal, the only figures the guide may quote, the plan's own words, a visual, an exit condition and a fallback script.
2. **Live voice** (ElevenLabs agent, opened by the front end). The agent only talks. When a phase is done it calls its `phase_done` tool; the front end forwards that to `POST /v1/sessions/{id}/phase-done`, and the engine answers with the next phase. Off-script questions go through `lookup`.
3. **Figures** come only from the plan's labelled facts (`key_metrics.facts` in each case), so the guide cannot invent numbers. A test checks every figure in every packet against the plan.
4. **Spanish by default**, English supported. What the family sees is translated once and cached; a translation that changes any figure is discarded.
5. **Follow-up**: goals with check-ins, a next step, and a brief for the advisor.

## For the front end

All calls except `/v1/topics` and `/v1/demo/households` need the member's token: `Authorization: Bearer <token>`. In the demo, tokens come from `GET /v1/demo/households`; in the product, each person gets a personal link from their advisor.

A live call:

```ts
const view = await api("POST /v1/sessions", { lang: "es" });          // persona, packet, agentBrief
const { signedUrl } = await api("POST /v1/voice/agent-session");
conversation.startSession({
  signedUrl,
  connectionType: "websocket",             // streams per-character timing for exact captions
  overrides: { agent: { language: "es" } },
  dynamicVariables: { name, language_name, household, level, worry, motivation, decision_style, previous_conversation, phase_brief: view.agentBrief },
  clientTools: {
    phase_done: async (p) => (await api(`POST /v1/sessions/${view.session.id}/phase-done`, mapped(p))).agentBrief ?? "END ...",
    lookup: async ({ topic }) => format(await api(`GET /v1/lookup?topic=${topic}`)),
  },
});
```

Show `packet.visual` while the guide talks (`ridge` uses `GET /v1/visuals/ridge`), and `packet.ask[].chips` as tappable answers.

## Layout

```
src/
  app.ts          routes, validation, OpenAPI
  api/            auth middleware, schemas (the contract), service
  engine/         phase engine, topics, lookup, figure formatting
  cases/          loads the four Sherpas cases from ./cases
  i18n/           Spanish for the screen, brief for the agent
  llm/            model router over the Sherpas proxy (tiers with fallback)
  voice/          ElevenLabs: agent session URL, cached speech
  store/          Postgres / PGlite, migrations, owner-scoped queries
scripts/agent.ts  creates or updates the ElevenLabs agent from code (npm run agent)
cases/            the four synthetic households from the Sherpas hackathon repo
```

## Security

- Personal links are HMAC-signed `(household, member)` pairs; every query filters on them, so nobody can read another person's conversation or goals (covered by tests).
- `APP_SECRET` is required in production. Keys stay on the server; the ElevenLabs agent is private and only opens with a signed URL from this API.
