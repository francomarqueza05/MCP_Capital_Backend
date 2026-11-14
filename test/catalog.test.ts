import assert from "node:assert/strict";
import { test } from "node:test";
import { caseIds } from "../src/cases/load";
import { sections } from "../src/director/catalog";
import { buildPlan } from "../src/plan/build";

test("every block's applicability and line evaluate for every family, person and depth", () => {
  const blocks = sections.flatMap((s) => s.blocks);
  assert.ok(blocks.length >= 60, `catalog has ${blocks.length} blocks`);
  assert.equal(new Set(blocks.map((b) => b.id)).size, blocks.length, "block ids are unique");
  for (const id of caseIds()) {
    const data = buildPlan(id);
    let applicable = 0;
    for (const a of data.household.adults)
      for (const depth of ["plain", "detailed"] as const)
        for (const b of blocks) {
          const c = { data, who: a.id, depth };
          const ok = b.when ? b.when(c) : true;
          if (!ok) continue;
          applicable++;
          const line = b.says?.(c);
          if (line !== undefined) assert.ok(!/undefined|NaN/.test(line), `${id} ${b.id}: "${line}"`);
        }
    assert.ok(applicable > 20, `${id}: only ${applicable} applicable`);
  }
});
