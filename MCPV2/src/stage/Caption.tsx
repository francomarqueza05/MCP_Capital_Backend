"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { orb } from "@/orb/engine";
import { bubble } from "./stage";

/** A small speech bubble that rides above the orb wherever it flies. */
export function Bubble() {
  const s = useStore(bubble, (x) => x);
  const el = useRef<HTMLDivElement>(null);
  const box = useRef({ w: 240, h: 44 });
  useEffect(() => {
    const b = el.current;
    if (b) box.current = { w: b.offsetWidth || 240, h: b.offsetHeight || 44 };
  }, [s.text, s.visible]);
  useEffect(
    () =>
      orb.onFrame((o) => {
        const b = el.current;
        if (!b || !bubble.get().visible) return;
        const { w, h } = box.current;
        const half = Math.min(150, w / 2 + 12);
        const x = Math.max(half, Math.min(o.W - half, o.x));
        const above = o.y - 88 * 0.85 * o.scale + o.bob;
        const y = above - h < 12 ? o.y + 88 * 0.7 * o.scale + o.bob + h + 8 : above;
        b.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-100%)`;
      }),
    [],
  );
  return (
    <div ref={el} className={s.visible ? "bubble show" : "bubble"} role="status">
      {s.text}
    </div>
  );
}
