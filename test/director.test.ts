import assert from "node:assert/strict";
import { test } from "node:test";
import { caseIds, getCase } from "../src/cases/load";
import { sections } from "../src/director/catalog";
import { advance, packet, startState, type SessionState } from "../src/engine/engine";

const ids = new Set(sections.flatMap((s) => s.blocks.map((b) => b.id)));

/** A whole conversation, collecting the steps of every phase. */
function walk(id: string, worry: string, level: string) {
  const c = getCase(id)!;
  let s: SessionState = startState(c, c.members[0]);
  s = advance(c, s, { answers: { worry, level } }).state;
  const phases: { phase: string; steps: string[] }[] = [];
  while (!s.done) {
    const p = packet(c, s);
    phases.push({ phase: p.phase, steps: p.steps.map((x) => x.block) });
    s = advance(c, s, { understood: true, answers: { accepted: true } }).state;
  }
  return phases;
}

test("every phase of every family gets at least one block, all from the catalog", () => {
  for (const id of caseIds())
    for (const level of ["Keep it simple", "Give me the detail"]) {
      for (const p of walk(id, "retirement", level)) {
        assert.ok(p.steps.length >= 1, `${id} ${level} ${p.phase} has no blocks`);
        for (const b of p.steps) assert.ok(ids.has(b), `${b} is not in the catalog`);
      }
    }
});

test("no block is shown twice in a conversation, except the first step at commitment", () => {
  for (const id of caseIds()) {
    const shown = walk(id, "retirement", "I know the basics").filter((p) => p.phase !== "commit").flatMap((p) => p.steps);
    assert.equal(new Set(shown).size, shown.length, `${id}: ${shown.join(", ")}`);
  }
});

test("the worry picks the focus blocks", () => {
  const retire = walk("michael-carter", "¿podré jubilarme a los 58?", "I know the basics").find((p) => p.phase === "focus")!;
  assert.ok(retire.steps.includes("savings-line"), retire.steps.join(", "));
  const kids = walk("timothy-melanie-weah", "que los niños estén protegidos si nos pasa algo", "I know the basics").find((p) => p.phase === "focus")!;
  assert.ok(kids.steps.includes("shield"), kids.steps.join(", "));
});

test("experts get more depth than beginners; beginners get plain blocks", () => {
  const c = getCase("michael-carter")!;
  const at = (level: string) => {
    let s = advance(c, startState(c, c.members[0]), { answers: { worry: "jubilación", level } }).state;
    while (s.plan[s.phase] !== "focus") s = advance(c, s, {}).state;
    return packet(c, s).steps;
  };
  const simple = at("Keep it simple");
  const expert = at("Give me the detail");
  assert.ok(expert.length > simple.length, `${expert.length} vs ${simple.length}`);
  assert.ok(simple.every((x) => x.depth === "plain"));
  assert.ok(expert.some((x) => x.depth === "detailed"));
});

test("tell me more goes down the ladder twice; not following switches to simpler blocks once", () => {
  const c = getCase("michael-carter")!;
  let s = advance(c, startState(c, c.members[0]), { answers: { worry: "jubilación", level: "I know the basics" } }).state;
  while (s.plan[s.phase] !== "focus") s = advance(c, s, {}).state;
  const l0 = packet(c, s).steps.length;
  s = advance(c, s, { wantsMore: true }).state;
  const l1 = packet(c, s).steps.length;
  s = advance(c, s, { wantsMore: true }).state;
  const l2 = packet(c, s).steps.length;
  assert.ok(l0 < l1 && l1 <= l2, `${l0} < ${l1} <= ${l2}`);
  assert.equal(s.plan[s.phase], "focus");
  s = advance(c, s, { wantsMore: true }).state;
  assert.notEqual(s.plan[s.phase], "focus", "a third request moves on");

  while (s.plan[s.phase] !== "route") s = advance(c, s, {}).state;
  s = advance(c, s, { understood: false }).state;
  const simpler = packet(c, s);
  assert.equal(simpler.phase, "route");
  assert.ok(simpler.steps.every((x) => x.depth === "plain"));
  s = advance(c, s, { understood: false }).state;
  assert.notEqual(s.plan[s.phase], "route", "simpler is offered once, then it moves on");
});

test("couples see the blocks for two people", () => {
  const steps = walk("timothy-melanie-weah", "inversiones", "I know the basics").flatMap((p) => p.steps);
  assert.ok(steps.includes("family-lanes") || steps.includes("who-holds"), steps.join(", "));
});
