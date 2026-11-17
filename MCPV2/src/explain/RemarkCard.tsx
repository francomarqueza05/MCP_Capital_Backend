"use client";
// What Cordi says or asks on its own, in a small card that rides just under the orb (its
// speech bubble is above). Answers are buttons. It keeps clear of the stage like the bubble.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { orb } from "@/orb/engine";
import { orbSpot } from "@/stage/stage";
import { dismiss, pick, remark } from "./remarks";

export function RemarkCard() {
  const { now, key } = useStore(remark, (s) => s);
  const el = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      orb.onFrame((o) => {
        const b = el.current;
        if (!b) return;
        const w = b.offsetWidth || 260;
        const h = b.offsetHeight || 80;
        const right = orbSpot.get().at?.maxRight ?? o.W - 12;
        const x = Math.max(12 + w / 2, Math.min(right - w / 2, o.x));
        const below = o.y + 88 * 0.6 * o.scale + o.bob + 10;
        const y = below + h > o.H - 90 ? o.y - 88 * 0.9 * o.scale - h - 70 : below;
        b.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,0)`;
      }),
    [],
  );

  useEffect(() => {
    if (!now) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [now]);

  return (
    <div ref={el} className="remark-anchor">
      <AnimatePresence>
        {now && (
          <motion.div
            key={key}
            className="remark"
            role={now.choices ? "dialog" : "status"}
            aria-label="Cordi"
            initial={{ opacity: 0, y: -10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
          >
            <p>{now.text}</p>
            {now.choices && (
              <div className="remark-choices">
                {now.choices.map((c) => (
                  <button key={c.id} onClick={() => pick(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
