"use client";
// The orb's DOM and the single animation loop of the whole experience (orb + effects layer).
import { useEffect, useRef } from "react";
import { attachFx, drawFx, resizeFx } from "./fx";
import { orb } from "./engine";

export function Orb({ onTap }: { onTap?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const shadow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const r = root.current!;
    const q = <T extends Element>(s: string) => r.querySelector(s) as T;
    orb.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    orb.attach({
      root: r,
      body: q(".orb-body"),
      jelly: q(".orb-jelly"),
      halo: q(".orb-halo"),
      shadow: shadow.current!,
      face: q("#orb-face"),
      eyes: [
        { cx: -9.5, el: q("#eyeL"), arc: q("#arcL"), shine: q("#shineL"), key: "hL" },
        { cx: 9.5, el: q("#eyeR"), arc: q("#arcR"), shine: q("#shineR"), key: "hR" },
      ],
      mouth: q("#mouth"),
      blush: [q("#blushL"), q("#blushR")],
    });
    attachFx(fxRef.current!);
    const resize = () => {
      orb.resize(innerWidth, innerHeight);
      resizeFx();
    };
    resize();
    addEventListener("resize", resize);
    const onInput = (e: PointerEvent | KeyboardEvent) => orb.input(e);
    addEventListener("pointermove", onInput);
    addEventListener("pointerdown", onInput);
    addEventListener("keydown", onInput);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
      last = now;
      orb.frame(now, dt);
      drawFx(dt, now / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onInput);
      removeEventListener("pointerdown", onInput);
      removeEventListener("keydown", onInput);
    };
  }, []);

  return (
    <>
      <canvas ref={fxRef} className="fx-layer" aria-hidden />
      <div ref={shadow} className="orb-shadow" aria-hidden />
      <div
        ref={root}
        className="orb"
        role="button"
        tabIndex={0}
        aria-label="Cordi, tu guía. Tócame para preguntar."
        onPointerDown={(e) => {
          e.stopPropagation();
          if (orb.mode !== "idle" && orb.mode !== "hold" && orb.mode !== "puppet") return;
          orb.tapped();
          onTap?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            orb.tapped();
            onTap?.();
          }
        }}
        onPointerEnter={() => orb.hovered()}
      >
        <div className="orb-halo" />
        <div className="orb-jelly">
          <div className="orb-body">
            <svg viewBox="-50 -50 100 100" aria-hidden>
              <g id="orb-face">
                <ellipse className="orb-blush" id="blushL" cx="-18" cy="9" rx="5.5" ry="3" />
                <ellipse className="orb-blush" id="blushR" cx="18" cy="9" rx="5.5" ry="3" />
                <rect className="orb-eye" id="eyeL" />
                <path className="orb-arc" id="arcL" />
                <circle className="orb-shine" id="shineL" r="0" />
                <rect className="orb-eye" id="eyeR" />
                <path className="orb-arc" id="arcR" />
                <circle className="orb-shine" id="shineR" r="0" />
                <path className="orb-eye orb-mouth" id="mouth" />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}
