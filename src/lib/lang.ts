// The language everything is said in: English by default, Spanish as an option. It is fixed for
// the whole page load (the page reloads to switch), so every text built from a case is built
// once, in one language. Call tr() only inside functions, never at import time: a module's
// top level runs before the language is known.

export type Lang = "en" | "es";
export const LANGS: Lang[] = ["en", "es"];
export const LANG_COOKIE = "cordada.lang";

export const asLang = (v: unknown): Lang => (v === "es" ? "es" : "en");

let current: Lang = typeof document !== "undefined" ? asLang(document.documentElement.lang) : "en";

export const lang = () => current;
export const isEs = () => current === "es";
/** Set by the page root, before anything renders. */
export const setLang = (l: Lang) => {
  current = l;
};

/** The same text in both languages; the current one is returned. */
export const tr = <T,>(en: T, es: T): T => (current === "es" ? es : en);

/**
 * The next load stays on the open profile (switching language, starting over). Any other load,
 * a reload or a saved link, opens on the four profiles: the profile in the link is only carried
 * across these deliberate reloads.
 */
export const CARRY_KEY = "cordada.carryProfile";
export function keepProfile() {
  try {
    sessionStorage.setItem(CARRY_KEY, "1");
  } catch {
    // no storage (private window): it opens on the four profiles
  }
}

/** Switch language: remembered in a cookie (so the server renders it too), then a fresh load. */
export function switchLang(l: Lang) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  keepProfile();
  const u = new URL(location.href);
  u.searchParams.set("lang", l);
  location.replace(u.toString());
}
