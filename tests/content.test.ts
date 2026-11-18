// Everything Cordi says without AI, for every case in both languages: the route, each camp's
// steps, the questions, the summit commitment. No broken text (undefined, NaN), no figure
// missing, no Spanish in English (or English in Spanish), and every step has something to show.
//   npx tsx --test tests/content.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CASE_IDS, getCase } from "@/data/cases";
import { setLang, type Lang } from "@/lib/lang";
import { buildSteps } from "@/expedition/steps";
import { beatsFor } from "@/explain/beats";
import { questionsFor, firstQuestions } from "@/expedition/qa-bank";
import { howTo, lifeChange, icsFor } from "@/commit/howto";
import { isGo } from "@/explain/confirm";
import { forSpeech } from "@/lib/speech";
import { byImpact } from "@/lib/copy";

const BROKEN = /undefined|NaN|\bnull\b|\[object|\$\{|Infinity/;
// Spanish leaking into English: accents, ¿¡, and common Spanish words
const SPANISH = /[áéíóúñ¿¡]|\b(que|los|las|para|con|del|una|está|tienes|vuestro|nota|ahorros)\b/i;
// English leaking into Spanish
const ENGLISH = /\b(the|your|you|with|and|of every|score|savings)\b/i;

function texts(lang: Lang, id: string) {
  setLang(lang);
  const c = getCase(id, lang);
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: string | undefined | null) => text != null && out.push({ where, text: String(text) });
  for (const s of buildSteps(c)) {
    add(`${s.id}.title`, s.title);
    add(`${s.id}.label`, s.label);
    add(`${s.id}.say`, s.say);
    add(`${s.id}.sign`, `${s.sign.fig} ${s.sign.note}`);
    const beats = beatsFor(s, c);
    assert.ok(beats.length > 0, `${lang} ${id} ${s.id}: no steps`);
    for (const b of beats) {
      add(`${s.id}/${b.id}.say`, b.say);
      add(`${s.id}/${b.id}.simpler`, b.simpler);
      const v = b.visual;
      if (v.kind === "figure") add(`${s.id}/${b.id}.caption`, v.caption), assert.ok(Number.isFinite(v.value), `${s.id}/${b.id} figure value`);
      if (v.kind === "bars") v.items.forEach((it) => (add(`${s.id}/${b.id}.bar`, it.label), assert.ok(Number.isFinite(it.value), `${s.id}/${b.id} bar ${it.label}`)));
      if (v.kind === "list") v.items.forEach((it) => add(`${s.id}/${b.id}.item`, `${it.text} ${it.note ?? ""}`));
      if (v.kind === "range") add(`${s.id}/${b.id}.range`, v.label), assert.ok([v.value, v.lo, v.hi, v.max].every(Number.isFinite));
      if (v.kind === "score") add(`${s.id}/${b.id}.score`, v.label);
    }
    const qs = questionsFor(s, c);
    assert.ok(firstQuestions(qs).length > 0, `${lang} ${id} ${s.id}: no questions`);
    for (const q of qs) add(`${s.id}?${q.id}.q`, q.q), add(`${s.id}?${q.id}.a`, q.a);
  }
  for (const m of byImpact(c.moves)) {
    howTo(m).forEach((h) => add(`move ${m.title}.howto`, h));
    add(`move ${m.title}.life`, lifeChange(c, m));
    add(`move ${m.title}.ics`, icsFor(c, m, "2026-12-01"));
  }
  return out;
}

for (const lang of ["en", "es"] as Lang[])
  for (const id of CASE_IDS)
    test(`${lang} · ${id}: every text is whole and in one language`, () => {
      const all = texts(lang, id);
      const broken = all.filter((t) => BROKEN.test(t.text));
      assert.deepEqual(broken, [], "broken text");
      const empty = all.filter((t) => !t.text.trim());
      assert.deepEqual(empty, [], "empty text");
      const mixed = all.filter((t) => !t.where.endsWith(".ics") && (lang === "en" ? SPANISH : ENGLISH).test(t.text.replace(/«[^»]*»/g, "")));
      assert.deepEqual(mixed.map((m) => `${m.where}: ${m.text}`), [], "other language mixed in");
    });

test("a go-ahead is only a clear go-ahead, in both languages", () => {
  for (const yes of ["yes", "Yes, let's continue.", "ok next", "go on", "sounds good", "sí", "vale, sigue", "Sí, seguimos.", "dale", "continue"]) assert.ok(isGo(yes), `should go: ${yes}`);
  for (const no of ["no", "wait", "why?", "yes but why is that", "what does that mean", "hold on", "no, espera", "¿por qué?", "sí, pero ¿cuánto?", "repeat that", "", "I don't get it"]) assert.ok(!isGo(no), `should NOT go: ${no}`);
});

test("the voice reads figures cleanly", () => {
  setLang("en");
  assert.equal(forSpeech("Between 8–9 months"), "Between 8 to 9 months");
  assert.match(forSpeech("$523k left"), /\$523 thousand/);
  setLang("es");
  assert.match(forSpeech("Faltan $15.032"), /quince mil treinta y dos dólares/);
  assert.doesNotMatch(forSpeech("Tienes 1,4 meses"), /\d/);
});
