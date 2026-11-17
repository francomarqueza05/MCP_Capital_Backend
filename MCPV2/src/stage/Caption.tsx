"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { orb } from "@/orb/engine";
import { bubble, orbSpot } from "./stage";

/**
 * A small speech bubble that rides above the orb wherever it flies. Its size is the whole line
 * from the first word (an invisible copy of it holds the room), so it doesn't grow as the words
 * come in; and when it has to move (the screen's edge, no room above), it glides there instead
 * of jumping.
 */
/** `below`: the bubble goes under Cordi (the intro, where Cordi rises in the sky above it). */
export function Bubble({ below = false }: { below?: boolean }) {
  const s = useStore(bubble, (x) => x);
  const el = useRef<HTMLDivElement>(null);
  const box = useRef({ w: 240, h: 44 });
  const pos = useRef<{ x: number; y: number } | null>(null);
  // the side is decided when a line comes up and kept until it goes: a line that started under
  // Cordi in the intro doesn't climb above it when the intro ends while it's still showing
  const under = useRef(below);
  const wish = useRef(below);
  wish.current = below;
  useEffect(() => {
    const b = el.current;
    if (b) box.current = { w: b.offsetWidth || 240, h: b.offsetHeight || 44 };
  }, [s.text, s.full, s.visible]);
  useEffect(() => {
    if (!s.visible) pos.current = null; // shown again: it starts right where it belongs
  }, [s.visible]);
  // a new line (or the bubble shown again): it takes the side asked for now
  useEffect(() => {
    under.current = wish.current;
  }, [s.full, s.visible]);
  useEffect(
    () =>
      orb.onFrame((o) => {
        const b = el.current;
        if (!b || !bubble.get().visible) return;
        // its size right now (a new line's room is known from its first word): measured here,
        // not after React's commit, so a new line never starts placed by the last one's size
        const w = b.offsetWidth || box.current.w;
        const h = b.offsetHeight || box.current.h;
        const half = Math.min(150, w / 2 + 12);
        // beside the explanation stage, the bubble stays clear of it
        const right = orbSpot.get().at?.maxRight ?? o.W;
        const tx = Math.max(half, Math.min(right - w / 2, o.W - half, o.x));
        const above = o.y - 88 * 0.85 * o.scale + o.bob;
        const beneath = o.y + 88 * 0.7 * o.scale + o.bob + h + 8;
        // under Cordi when asked (unless there's no room left below), else above it (unless
        // there's no room above)
        const ty = under.current ? (beneath > o.H - 12 ? above : beneath) : above - h < 12 ? beneath : above;
        // follow the orb closely, but a change of side (an edge, no room above) is a glide
        const p = pos.current ?? { x: tx, y: ty };
        const far = Math.abs(tx - p.x) > 40 || Math.abs(ty - p.y) > 40;
        const k = far ? 0.14 : 0.5;
        p.x += (tx - p.x) * k;
        p.y += (ty - p.y) * k;
        pos.current = p;
        b.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-100%)`;
      }),
    [],
  );
  return (
    <div ref={el} className={s.visible ? "bubble show" : "bubble"} role="status">
      <span className="bubble-size" aria-hidden>
        {s.full || s.text}
      </span>
      <span className="bubble-text">{s.text}</span>
    </div>
  );
}
