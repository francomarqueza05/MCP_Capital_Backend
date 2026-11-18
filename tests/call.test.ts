// Turn-taking on the local call (no live agent): what Cordi treats as the person talking, as
// its own echo, and how a long answer is split so its voice starts sooner.
import { test } from "node:test";
import assert from "node:assert/strict";
// loaded in the app's order (player first): the two modules import each other
import "../src/explain/player";
import { callInternals as c } from "../src/stage/call";

const cordi = "Si mañana dejaras de cobrar, tendrías para aguantar un mes y medio. Lo sensato sería tener entre cinco y seis meses de gastos en el fondo de emergencia.";

test("a question about what Cordi is saying is the person, not echo", () => {
  c.saidLately([cordi]);
  for (const q of ["¿Qué es el fondo de emergencia?", "¿Y cuántos meses de gastos debería tener?", "No entiendo lo del fondo de emergencia", "espera, ¿un mes y medio es poco?"]) {
    assert.equal(c.isEcho(q), false, q);
  }
});

test("Cordi's own words coming back through the microphone are echo", () => {
  c.saidLately([cordi]);
  for (const e of ["tendrías para aguantar un mes y medio", "lo sensato sería tener entre cinco y seis meses", "gastos en el fondo de emergencia"]) {
    assert.equal(c.isEcho(e), true, e);
  }
});

test("words over Cordi's voice: its own half-heard words don't cut it off, the person's do", () => {
  c.saidLately([cordi]);
  assert.ok(c.likeCordi("aguantar mes medio sensato") >= 0.5); // the speakers, misheard
  assert.ok(c.likeCordi("espera espera para un momento") < 0.5); // the person
  assert.ok(c.likeCordi("oye una pregunta rápida") < 0.5);
});

test("a long answer is said in pieces, the first one short", () => {
  const parts = c.pieces(cordi);
  assert.ok(parts.length >= 2);
  assert.equal(parts.join(" "), cordi);
  assert.ok(parts[0].length <= 110, parts[0]);
  assert.deepEqual(c.pieces("¡Hola!"), ["¡Hola!"]);
  const long = "Con los ahorros que tenéis ahora mismo en el fondo de emergencia, podríais aguantar 1,4 meses si los ingresos se pararan de repente. Lo recomendado son 8 o 9.";
  const p = c.pieces(long);
  assert.ok(p[0].length < 80, p[0]);
  assert.equal(p.join(" "), long); // nothing lost or changed: the pieces read back as the answer
});
