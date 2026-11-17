// "Sí, seguimos": is what the person said a clear go-ahead to the next step? Only then may the
// AI (or the voice/typing path) move the explanation on; otherwise it stays where it is until
// the "Seguimos" button. Anything hesitant, negative or a question is not a yes.
// Word edges are Unicode-aware, so accented words ("sí", "continúa") match whole.
const word = (alts: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, "iu");

const GO = word("s[ií]+|vale|venga|seguimos|sigamos|sigue|siguiente|adelante|contin[uú]a|continuemos|continuamos|ok|okay|claro|de acuerdo|perfecto|entendido|listo|dale|pasa|pasemos");
const STOP = word("no|espera|esperad|para|parad|todav[ií]a|repite|repetir|otra vez|por qu[eé]|c[oó]mo|cu[aá]nto|cu[aá]l|d[oó]nde|qu[eé] es|qu[eé] significa");

export const isGo = (text: string) => {
  const t = text.trim();
  return t.length > 0 && t.length <= 60 && !/[¿?]/.test(t) && GO.test(t) && !STOP.test(t);
};
