"use client";
// "¿Quién sube hoy?": the start screen as a profile picker. One card per example household,
// with their avatars; picking one brings it to the centre while the rest step back, and the
// greeting and the start buttons come in. The mountain stays behind, waiting.
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useRef } from "react";
import { CASE_IDS, CASES, type Case } from "@/data/cases";
import { names } from "@/lib/copy";
import { tones } from "@/lib/audio";

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
  return `${c.household.couple ? "Pareja" : "Una persona"}${k ? ` · ${k} ${k > 1 ? "hijos" : "hijo"}` : ""}`;
};

export function Login({ selected, onSelect, onBegin }: { selected: string | null; onSelect: (id: string | null) => void; onBegin: (withSound: boolean) => void }) {
  const c = selected ? CASES[selected] : null;
  // back from a profile ("No soy yo"): its card flies home to the row, already visible, and the
  // rest come back quickly instead of replaying the first entrance
  const last = useRef<string | null>(null);
  const back = selected ? null : last.current;
  if (selected) last.current = selected;
  const out = { opacity: 0, y: 8, transition: { duration: 0.2 } };
  return (
    <div className="lg">
      <motion.h1 className="start-mark" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE }}>
        cordada
      </motion.h1>

      <LayoutGroup>
        <AnimatePresence mode="popLayout">
          {!c ? (
            <motion.div key="pick" className="lg-pick" exit={{ opacity: 0, pointerEvents: "none", transition: { duration: 0.25 } }}>
              <motion.p className="lg-ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: back ? 0.15 : 0.35 }}>
                ¿Quién sube hoy?
              </motion.p>
              <ul className="lg-cards">
                {CASE_IDS.map((id, i) => {
                  const k = CASES[id];
                  return (
                    <motion.li
                      key={id}
                      initial={id === back ? false : { opacity: 0, y: back ? 16 : 30, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: back ? 0.5 : 0.7, delay: back ? 0.12 + i * 0.05 : 0.45 + i * 0.09, ease: EASE }}
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
              <motion.p className="lg-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: back ? 0.4 : 1 }}>
                Familias de ejemplo con su análisis de Sherpas Wealth
              </motion.p>
            </motion.div>
          ) : (
            <motion.div key="hello" className="lg-hello">
              <motion.div layoutId={`lg-${selected}`} className="lg-card lg-card-on" transition={{ type: "spring", stiffness: 180, damping: 22 }}>
                <Avatars c={c} size={84} />
                <span className="lg-name">{names(c)}</span>
                <span className="lg-who">{who(c)}</span>
              </motion.div>
              <motion.p className="start-tag" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={out} transition={{ delay: 0.25, duration: 0.6, ease: EASE }}>
                Hola, {names(c)}. {c.household.couple ? "Vuestro" : "Tu"} plan financiero es una montaña. Cordi {c.household.couple ? "os" : "te"} acompaña a subirla.
              </motion.p>
              <motion.div className="start-actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={out} transition={{ delay: 0.4, duration: 0.6, ease: EASE }}>
                <button className="act act-main act-large" onClick={() => onBegin(true)} autoFocus>
                  Empezar la ruta
                </button>
                <button className="act act-quiet" onClick={() => onBegin(false)}>
                  Empezar sin sonido
                </button>
              </motion.div>
              <motion.button className="lg-back" onClick={() => onSelect(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={out} transition={{ delay: 0.6 }}>
                No {c.household.couple ? "somos nosotros" : "soy yo"}: cambiar de perfil
              </motion.button>
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
    <button className="lg-chip" onClick={onSwitch} title="Cambiar de perfil">
      <Avatars c={c} size={26} />
      <span>{names(c)}</span>
      <small>Cambiar</small>
    </button>
  );
}
