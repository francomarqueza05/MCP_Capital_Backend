// The language of a request: the page's cookie (set on every load, see Experience). Each route
// calls useRequestLang first, so the texts it builds from the case (steps, beats) come out in
// the person's language, and the model gets told which language to answer in.
import { asLang, LANG_COOKIE, setLang, type Lang } from "@/lib/lang";

export function useRequestLang(req: Request): Lang {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE.replace(".", "\\.")}=([a-z]+)`));
  const l = asLang(m?.[1]);
  setLang(l);
  return l;
}

/**
 * Appended last to the Spanish-written prompts when the person uses the app in English: the
 * last instruction wins, and the examples above become a guide to tone, not to language.
 */
export const ENGLISH_OVERRIDE = [
  "LANGUAGE (this overrides everything above about language and number format): the person uses the app in English.",
  "Write ONLY in natural, warm, plain American English, addressing them as \"you\" (for a couple too).",
  "Figures always with digits, in US format: $18,000, 1.4 months, 25%, 52 out of 100.",
  "The quoted Spanish phrases above are examples of tone: use natural English equivalents (never start with \"Sure\", \"Great question\", \"I understand\").",
  "Buttons on screen are called \"Explain this to me\" and \"Continue\".",
].join("\n");

export const langNote = (l: Lang) => (l === "en" ? `\n\n${ENGLISH_OVERRIDE}` : "");
