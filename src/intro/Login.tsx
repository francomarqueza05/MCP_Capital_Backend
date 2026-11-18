"use client";
// "Who's climbing today?": the start screen as a profile picker. One card per example household,
// with their avatars; picking one brings it to the centre while the rest step back, and the
// greeting and the start buttons come in. The mountain stays behind, waiting.
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useRef } from "react";
import { CASE_IDS, CASES, getCase, type Case } from "@/data/cases";
import { useStore } from "@/lib/store";
import { forget, memory } from "@/commit/memory";
import { WelcomeBack } from "@/commit/WelcomeBack";
import { names } from "@/lib/copy";
import { tones } from "@/lib/audio";
import { keepProfile, lang, LANGS, switchLang, tr } from "@/lib/lang";

const EASE = [0.16, 1, 0.3, 1] as const;

/** A steady colour per person, from their name. */
const hue = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

function Avatars({ c, size = 64 }: { c: Case; size?: number }) {
  const people = c.household.names.slice(0, 2);
  return (
    <span className="lg-avatars" style={{ ["--s" as string]: `${size}px` }} aria-hidden>
      {people.map((n, i) => (
        <span key={n} className="lg-avatar" style={{ ["--h" as string]: hue(n), zIndex: 2 - i }}>
          {n[0]}
        </span>
      ))}
    </span>
  );
}

const who = (c: Case) => {
  const k = c.household.kids.length;
  return tr(
    `${c.household.couple ? "Couple" : "Single"}${k ? ` · ${k} ${k > 1 ? "kids" : "kid"}` : ""}`,
    `${c.household.couple ? "Pareja" : "Una persona"}${k ? ` · ${k} ${k > 1 ? "hijos" : "hijo"}` : ""}`,
  );
};

/** EN | ES. Switching reloads the page in the other language, on the same profile. */
export function LangSwitch({ className = "" }: { className?: string }) {
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={tr("Language", "Idioma")}>
      {LANGS.map((l) => (
        <button key={l} aria-pressed={lang() === l} onClick={() => lang() !== l && switchLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Login({ selected, onSelect, onBegin }: { selected: string | null; onSelect: (id: string | null) => void; onBegin: (withSound: boolean) => void }) {
  const c = selected ? getCase(selected) : null;
  const back = useStore(memory, (m) => (m.caseId === selected ? m.back : null));
  // back from a profile ("Not me"): its card flies home to the row, already visible, and the
  // rest come back quickly instead of replaying the first entrance
  const last = useRef<string | null>(null);
  const backTo = selected ? null : last.current;
  if (selected) last.current = selected;
  const out = { opacity: 0, y: 8, transition: { duration: 0.2 } };
  const we = c?.household.couple;
  return (
    <div className="lg">
      <LangSwitch className="lang-switch-start" />
      <motion.h1 className="start-mark" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE }}>
        cordada
      </motion.h1>

      <LayoutGroup>
        <AnimatePresence mode="popLayout">
          {!c ? (
            <motion.div key="pick" className="lg-pick" exit={{ opacity: 0, pointerEvents: "none", transition: { duration: 0.25 } }}>
              <motion.p className="lg-ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: backTo ? 0.15 : 0.35 }}>
                {tr("Who's climbing today?", "¿Quién sube hoy?")}
              </motion.p>
              <ul className="lg-cards">
                {CASE_IDS.map((id, i) => {
                  const k = CASES[id];
                  return (
                    <motion.li
                      key={id}
                      initial={id === backTo ? false : { opacity: 0, y: backTo ? 16 : 30, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: backTo ? 0.5 : 0.7, delay: backTo ? 0.12 + i * 0.05 : 0.45 + i * 0.09, ease: EASE }}
                    >
                      <motion.button
                        layoutId={`lg-${id}`}
                        transition={{ type: "spring", stiffness: 180, damping: 22 }}
                        className="lg-card"
                        onClick={() => {
                          // already on its way to the centre: a second tap does nothing
                          if (selected) return;
                          tones.tap();
                          onSelect(id);
                        }}
                        whileHover={{ y: -6 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <Avatars c={k} />
                        <span className="lg-name">{names(k)}</span>
                        <span className="lg-who">{who(k)}</span>
                      </motion.button>
                    </motion.li>
                  );
                })}
              </ul>
              <motion.p className="lg-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: backTo ? 0.4 : 1 }}>
                {tr("Example families with their Sherpas Wealth analysis", "Familias de ejemplo con su análisis de Sherpas Wealth")}
              </motion.p>
            </motion.div>
          ) : (
            <motion.div key="hello" className="lg-hello">
              <motion.div layoutId={`lg-${selected}`} className="lg-card lg-card-on" transition={{ type: "spring", stiffness: 180, damping: 22 }}>
                <Avatars c={c} size={84} />
                <span className="lg-name">{names(c)}</span>
                <span className="lg-who">{who(c)}</span>
              </motion.div>
              {back ? (
                <WelcomeBack c={c} />
              ) : (
              <motion.p className="start-tag" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={out} transition={{ delay: 0.25, duration: 0.6, ease: EASE }}>
                {tr(
                  `Hi, ${names(c)}. Your financial plan is a mountain. Cordi will climb it with you.`,
                  `Hola, ${names(c)}. ${we ? "Vuestro" : "Tu"} plan financiero es una montaña. Cordi ${we ? "os" : "te"} acompaña a subirla.`,
                )}
              </motion.p>
              )}
              <motion.div className="start-actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={out} transition={{ delay: 0.4, duration: 0.6, ease: EASE }}>
                <button className="act act-main act-large" onClick={() => onBegin(true)} autoFocus>
                  {tr("Start the climb", "Empezar la ruta")}
                </button>
                <button className="act act-quiet" onClick={() => onBegin(false)}>
                  {tr("Start without sound", "Empezar sin sonido")}
                </button>
              </motion.div>
              <motion.button className="lg-back" onClick={() => onSelect(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={out} transition={{ delay: 0.6 }}>
                {tr(`Not ${we ? "us" : "me"}: switch profile`, `No ${we ? "somos nosotros" : "soy yo"}: cambiar de perfil`)}
              </motion.button>
              {/* forget this family's climb (flags, the promised step, where they were) and start fresh */}
              {back && (
                <motion.button
                  className="lg-back lg-reset"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={out}
                  transition={{ delay: 0.7 }}
                  onClick={() => {
                    if (!confirm(tr("Start over? Cordi will forget this family's progress in this browser.", "¿Empezar de cero? Cordi olvidará el progreso de esta familia en este navegador."))) return;
                    forget(selected!);
                    keepProfile();
                    const u = new URL(location.href);
                    u.searchParams.set("case", selected!);
                    u.searchParams.delete("days");
                    u.searchParams.delete("reset");
                    location.replace(u.toString());
                  }}
                >
                  {tr("Start over", "Empezar de cero")}
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}

/** The current profile in the top bar, with a way back to the picker. */
export function ProfileChip({ c, onSwitch }: { c: Case; onSwitch: () => void }) {
  return (
    <button className="lg-chip" onClick={onSwitch} title={tr("Switch profile", "Cambiar de perfil")}>
      <Avatars c={c} size={26} />
      <span>{names(c)}</span>
      <small>{tr("Switch", "Cambiar")}</small>
    </button>
  );
}
