// The whole API through HTTP, against a real (embedded) Postgres. No network needed: the
// conversations use English so nothing is translated.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";
import { issueToken } from "../src/auth/token";
import { config } from "../src/config";
import { openDb, type Db } from "../src/store/db";
import { SqlStore, useStore } from "../src/store/store";

let db: Db;
let app: ReturnType<typeof createApp>;

before(async () => {
  db = await openDb({ url: null, dir: "memory" });
  useStore(new SqlStore(db));
  config.serverKey = "test-server-key";
  app = createApp();
});
after(() => db.close());

const timothy = issueToken({ caseId: "timothy-melanie-weah", memberId: "timothy" });
const melanie = issueToken({ caseId: "timothy-melanie-weah", memberId: "melanie" });
const michael = issueToken({ caseId: "michael-carter", memberId: "michael" });

const call = (path: string, token?: string, init: RequestInit & { body?: string } = {}) =>
  app.request(path, {
    ...init,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(init.headers ?? {}) },
  });
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

test("a full conversation ends in a goal, a next step and a memory of it", async () => {
  const open = await call("/v1/sessions", timothy, post({ lang: "en" }));
  assert.equal(open.status, 201);
  const o = await open.json();
  assert.equal(o.packet.phase, "discovery");
  assert.equal(o.persona.name, "Timothy");
  assert.match(o.agentBrief, /PHASE 1 of/);

  let r = await (await call(`/v1/sessions/${o.session.id}/phase-done`, timothy, post({ answers: { worry: "Paying for college", level: "Keep it simple" } }))).json();
  assert.equal(r.packet.phase, "today");
  assert.equal(r.persona.level, "new");
  let guard = 0;
  while (r.packet && guard++ < 12) {
    r = await (await call(`/v1/sessions/${o.session.id}/phase-done`, timothy, post({ understood: true, emotion: "calm", answers: { accepted: true } }))).json();
  }
  assert.equal(r.session.done, true);
  assert.ok(r.goal?.due, "accepting creates a goal with a date");

  const goals = await (await call("/v1/goals", timothy)).json();
  assert.equal(goals.length, 1);
  const checked = await (await call(`/v1/goals/${goals[0].id}/checkin`, timothy, post({ note: "Called the bank", done: true }))).json();
  assert.equal(checked.status, "done");
  assert.equal(checked.checkins[0].note, "Called the bank");

  const again = await (await call("/v1/sessions", timothy, post({ lang: "en" }))).json();
  assert.equal(again.persona.worry, "Paying for college");
  assert.match(again.persona.previousConversation, /college/i);

  const events = await db.query<{ kind: string }>(`select kind from events where case_id = 'timothy-melanie-weah'`);
  assert.ok(events.some((e) => e.kind === "phase_done"));
});

test("nobody reads someone else's conversation or goals", async () => {
  const o = await (await call("/v1/sessions", timothy, post({ lang: "en" }))).json();
  for (const token of [melanie, michael]) {
    assert.equal((await call(`/v1/sessions/${o.session.id}`, token)).status, 404);
    assert.equal((await call(`/v1/sessions/${o.session.id}/phase-done`, token, post({}))).status, 404);
  }
  assert.deepEqual(await (await call("/v1/goals", melanie)).json(), []);
});

test("bad tokens and bad input are refused with a clear error", async () => {
  assert.equal((await call("/v1/sessions", undefined, post({}))).status, 401);
  const forged = timothy.split(".")[0] + ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  assert.equal((await call("/v1/sessions", forged, post({}))).status, 401);
  const bad = await call("/v1/lookup?topic=crypto", timothy);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, "bad_input");
  const o = await (await call("/v1/sessions", timothy, post({ lang: "en" }))).json();
  assert.equal((await call(`/v1/sessions/${o.session.id}/phase-done`, timothy, post({ understood: "yes" }))).status, 400);
  assert.equal((await call(`/v1/sessions/not-a-uuid`, timothy)).status, 400);
});

test("advisor brief needs the server key; demo lists every member with a working token", async () => {
  assert.equal((await call("/v1/households/timothy-melanie-weah/advisor-brief", timothy)).status, 401);
  const b = await call("/v1/households/timothy-melanie-weah/advisor-brief", undefined, { headers: { "x-api-key": "test-server-key" } });
  assert.equal(b.status, 200);
  assert.equal((await b.json()).members.length, 2);

  const demo = await (await call("/v1/demo/households")).json();
  assert.equal(demo.length, 4);
  const token = demo[0].members[0].token;
  assert.equal((await call("/v1/me", token)).status, 200);
});

test("the OpenAPI document describes every route", async () => {
  const doc = await (await call("/openapi.json")).json();
  for (const p of ["/v1/sessions", "/v1/sessions/{id}/phase-done", "/v1/lookup", "/v1/goals", "/v1/voice/agent-session", "/v1/demo/households"])
    assert.ok(doc.paths[p], `${p} missing from OpenAPI`);
  assert.ok(doc.components.securitySchemes.Member);
});
