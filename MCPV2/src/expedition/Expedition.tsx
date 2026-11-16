"use client";
// The expedition: the whole analysis as one climb. A camera on a spring looks at the mountain;
// Cordi rises from behind the summit, comes down to base camp, and the whole mountain stays in
// view with a short summary beside every flag. Any flag can be picked: Cordi walks there along
// the route and the detail opens. Or Cordi guides the way, camp by camp.
//
// The mountain is painted on a canvas (render.ts), whole, every frame. One loop drives the
// camera, the route, the flags and where Cordi should be; the orb engine gives Cordi its weight.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Case } from "@/data/cases";
import { hasVoice, line, playSfx, speak, stopSfx, stopVoice, tones } from "@/lib/audio";
import { clamp, easeInOut, lerp, wait } from "@/lib/store";
import { orb, type Emotion } from "@/orb/engine";
import { emit, ring, setStars } from "@/orb/fx";
import { openAsk } from "@/stage/Ask";
import { showBubble } from "@/stage/stage";
import { buildSteps, type Step } from "./steps";
import { campU, ROUTE, SUMMIT, WH, WW } from "./world";
import { COLOR, drawOccluder, drawWorld, type Frame } from "./render";
import { Detail } from "./Detail";
import { Narration, type Line } from "./Narration";

const HOVER = 78; // Cordi floats this far above the trail, in world units
const MOOD: Record<Step["status"], Emotion> = { good: "happy", warn: "thinking", bad: "concerned", goal: "happy" };

type Cam = { x: number; y: number; z: number; vx: number; vy: number; vz: number; tx: number; ty: number; tz: number; k: number; kz?: number };
type Cordi =
  | { mode: "hidden" }
  | { mode: "rise"; t0: number; dur: number }
  | { mode: "walk"; from: number; to: number; t0: number; dur: number; wide?: boolean }
  | { mode: "camp"; at: number };

export type ExpeditionHandle = { start: () => void; skip: () => void };
export type Phase = "wait" | "intro" | "overview" | "tour";

export const Expedition = forwardRef<ExpeditionHandle, { c: Case; onPhase?: (p: Phase) => void }>(function Expedition({ c, onPhase }, ref) {
  const steps = useMemo(() => buildSteps(c), [c]);
  const n = steps.length;
  const campPos = useMemo(() => steps.map((_, i) => ROUTE.at(campU(i, n))), [steps, n]);
  // each summary sits on the outer side of its switchback, pointing away from the route;
  // base camp's goes under the tent, the summit's to the left of its flag
  const sides = useMemo(
    () =>
      campPos.map((p, i) => {
        if (i === 0) return "below";
        if (i === n - 1) return "left";
        const mid = (campPos[i - 1][0] + campPos[i + 1][0]) / 2;
        return p[0] >= mid ? "right" : "left";
      }) as ("left" | "right" | "below")[],
    [campPos, n],
  );

  const [phase, setPhaseState] = useState<Phase>("wait");
  const setPhase = useCallback(
    (p: Phase) => {
      setPhaseState(p);
      onPhase?.(p);
    },
    [onPhase],
  );
  const [idx, setIdx] = useState(-1);
  const [visited, setVisited] = useState(0);
  const [walking, setWalking] = useState(false);
  const [detail, setDetail] = useState(false);
  const [narr, setNarr] = useState<Line | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  // everything the loop reads lives in refs, so React renders never touch the animation
  const cam = useRef<Cam>({ x: WW / 2, y: WH / 2, z: 0.5, vx: 0, vy: 0, vz: 0, tx: WW / 2, ty: WH / 2, tz: 0.5, k: 6 });
  const cordi = useRef<Cordi>({ mode: "hidden" });
  const u = useRef(0);
  const walked = useRef(0);
  const touring = useRef(false);
  const cw = useRef({ x: 0, y: 0, vx: 0, vy: 0, ready: false });
  const live = useRef({ idx: -1, detail: false, phase: "wait" as Phase, hover: null as number | null, visited: 0 });
  live.current = { idx, detail, phase, hover, visited };
  const introT0 = useRef(-1);
  const routeK = useRef(0);
  const draw = useRef<{ t0: number; dur: number; popped: number } | null>(null);
  const popT = useRef<number[]>([]);
  const occlude = useRef(false);
  const size = useRef({ W: 1440, H: 900, dpr: 1 });

  const canvas = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  const notes = useRef<(HTMLButtonElement | null)[]>([]);
  const leader = useRef<SVGPathElement>(null);
  const leaderDot = useRef<SVGCircleElement>(null);
  const written = useRef(new Map<Element, string>());
  const put = (el: Element | null | undefined, attr: string, v: string) => {
    if (!el || written.current.get(el) === attr + v) return;
    written.current.set(el, attr + v);
    if (attr === "transform") (el as HTMLElement).style.transform = v;
    else el.setAttribute(attr, v);
  };

  // skipping the opening: every pause resolves at once
  const skipped = useRef(false);
  const waiters = useRef<(() => void)[]>([]);
  const pause = (ms: number) =>
    new Promise<void>((r) => {
      if (skipped.current) return r();
      const t = setTimeout(r, ms);
      waiters.current.push(() => {
        clearTimeout(t);
        r();
      });
    });

  // ---------------------------------------------------------------- framing
  const isNarrow = () => size.current.W < 760;
  const wideZ = () => (isNarrow() ? size.current.W / 1250 : Math.min(size.current.W / 1500, size.current.H / (WH - 80)));
  const campZ = () => size.current.H / (isNarrow() ? 620 : 780);
  const frame = useCallback((wx: number, wy: number, z: number) => {
    const { W, H } = size.current;
    const open = live.current.detail;
    const sheet = open ? Math.min(560, W * 0.46) : 0;
    const ax = isNarrow() ? W * 0.5 : open ? (W - sheet) * 0.5 : W * 0.64;
    const ay = isNarrow() ? H * (open ? 0.16 : 0.24) : H * 0.6;
    const c = cam.current;
    c.tz = z;
    c.tx = wx - (ax - W / 2) / z;
    c.ty = wy - (ay - H / 2) / z;
  }, []);
  const frameWide = useCallback(() => {
    const c = cam.current;
    c.tz = wideZ();
    c.tx = isNarrow() ? 1035 : SUMMIT.x - 520;
    c.ty = isNarrow() ? 790 + (size.current.H / 2 - size.current.H * 0.3) / c.tz : WH / 2 - 40;
  }, []);
  const toScreen = (wx: number, wy: number) => {
    const { W, H } = size.current;
    const c = cam.current;
    return [(wx - c.x) * c.z + W / 2, (wy - c.y) * c.z + H / 2] as const;
  };

  // ---------------------------------------------------------------- the loop
  useEffect(() => {
    const g = canvas.current!.getContext("2d")!;
    const gf = front.current!.getContext("2d")!;
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      size.current = { W: innerWidth, H: innerHeight, dpr };
      for (const cv of [canvas.current!, front.current!]) {
        cv.width = Math.round(innerWidth * dpr);
        cv.height = Math.round(innerHeight * dpr);
      }
      written.current.clear();
    };
    resize();
    addEventListener("resize", resize);
    frameWide();
    const c = cam.current;
    c.x = c.tx;
    c.y = c.ty;
    c.z = c.tz;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
      last = now;
      const { W, H, dpr } = size.current;
      const L = live.current;

      // where Cordi is on the mountain, in world units
      const cd = cordi.current;
      let wx = SUMMIT.x;
      let wy = SUMMIT.y;
      if (cd.mode === "walk") {
        const k = clamp((now - cd.t0) / cd.dur, 0, 1);
        u.current = lerp(cd.from, cd.to, easeInOut(k));
        if (k >= 1) cordi.current = { mode: "camp", at: cd.to };
      } else if (cd.mode === "camp") u.current = cd.at;
      if (cd.mode === "walk" || cd.mode === "camp") {
        const at = ROUTE.at(u.current);
        wx = at[0];
        wy = at[1] - HOVER;
      }

      // camera: follows Cordi while it walks close up, holds still otherwise
      if (cd.mode === "walk" && !cd.wide) {
        const b = cw.current;
        if (b.ready) frame(b.x + b.vx * 0.12, b.y + b.vy * 0.12 + HOVER * 0.5, campZ());
        else frame(wx, wy + HOVER * 0.5, campZ());
      }
      const s = reduced ? 1 : Math.min(1, dt);
      for (const [p, v, t] of [
        ["x", "vx", "tx"],
        ["y", "vy", "ty"],
        ["z", "vz", "tz"],
      ] as const) {
        if (reduced) {
          c[p] = c[t];
          continue;
        }
        const kk = p === "z" ? (c.kz ?? c.k) : c.k;
        c[v] += (kk * (c[t] - c[p]) - 2 * Math.sqrt(kk) * c[v]) * s;
        c[p] += c[v] * s;
      }

      // the route drawing itself in the opening; camps pop up as the line reaches them
      const dr = draw.current;
      let spark: number | null = null;
      if (dr) {
        const k = clamp((now - dr.t0) / dr.dur, 0, 1);
        const e = easeInOut(k);
        routeK.current = e;
        if (k < 1) {
          spark = e;
          if (Math.random() < 0.6) {
            const [x, y] = ROUTE.at(e);
            const [sx, sy] = toScreen(x, y);
            emit(sx, sy, 1, { min: 4, max: 18, life: 1.1, size: 1.3 });
          }
        }
        while (dr.popped < n && e >= campU(dr.popped, n) - 0.002) {
          const i = dr.popped++;
          popT.current[i] = now;
          if (dr.dur > 1) {
            const [sx, sy] = toScreen(campPos[i][0], campPos[i][1]);
            ring(sx, sy, 4, 30, 0.8);
            playSfx(i === n - 1 ? "flag" : "chime", { vol: i === n - 1 ? 0.32 : 0.16, rate: 0.85 + (i / Math.max(1, n - 2)) * 0.75 });
          }
        }
        if (k >= 1 && dr.popped >= n) draw.current = null;
      }

      // the warm line runs with Cordi along the trail, up or down
      walked.current = touring.current ? lerp(walked.current, u.current, Math.min(1, dt * 14)) : 0;

      // paint the mountain
      // -1 means the opening has not started; a time far in the past means it is complete
      const intro = introT0.current === -1 ? -1 : now - introT0.current;
      const f: Frame = {
        W,
        H,
        dpr,
        cam: c,
        now,
        intro,
        route: routeK.current,
        walked: walked.current,
        spark,
        yakAt: [campPos[0][0] - 190, campPos[0][1] + 14],
        camps: steps.map((st, i) => ({
          x: campPos[i][0],
          y: campPos[i][1],
          kind: st.kind,
          color: COLOR[st.status],
          bright: L.phase === "overview" || i === L.hover || (L.phase === "tour" && i <= L.visited),
          current: (L.phase === "tour" && i === L.idx) || (L.phase === "overview" && i === Math.max(0, L.idx)),
          pop: popT.current[i] === undefined ? 0 : clamp((now - popT.current[i]) / 520, 0, 1),
        })),
      };
      drawWorld(g, f);
      drawOccluder(gf, f, occlude.current);

      // summaries beside the flags ride with them; on each side, a pass keeps them apart
      const showNotes = L.phase === "overview";
      if (showNotes || L.hover !== null) {
        const pos = campPos.map(([x, y], i) => toScreen(x, y - (steps[i].kind === "summit" ? 52 : steps[i].kind === "base" ? -8 : 30)));
        const ys = pos.map((p) => p[1]);
        for (const side of ["left", "right"] as const) {
          const order = pos.map((_, i) => i).filter((i) => sides[i] === side).sort((a, b) => ys[a] - ys[b]);
          for (let j = 1; j < order.length; j++) {
            const a = order[j - 1];
            const b = order[j];
            if (ys[b] - ys[a] < 40) ys[b] = ys[a] + 40;
          }
        }
        for (let i = 0; i < n; i++) {
          if (!showNotes && i !== L.hover) continue;
          put(notes.current[i], "transform", `translate3d(${pos[i][0].toFixed(1)}px,${ys[i].toFixed(1)}px,0)`);
        }
      }

      // a hairline from the camp to the open panel
      if (L.detail && L.idx >= 0 && !isNarrow()) {
        const [sx, sy] = toScreen(campPos[L.idx][0], campPos[L.idx][1] - 40);
        const ex = W - Math.min(560, W * 0.46);
        const ey = 92;
        const mx = sx + (ex - sx) * 0.55;
        put(leader.current, "d", `M${sx.toFixed(1)},${sy.toFixed(1)} C${mx.toFixed(1)},${sy.toFixed(1)} ${(mx - 40).toFixed(1)},${ey} ${ex},${ey}`);
        put(leaderDot.current, "cx", sx.toFixed(1));
        put(leaderDot.current, "cy", sy.toFixed(1));
      }

      // Cordi on screen
      const scale = clamp(c.z / campZ(), 0.42, 1) * (isNarrow() ? 0.62 : 0.8);
      if (cd.mode === "rise") {
        const k = clamp((now - cd.t0) / cd.dur, 0, 1);
        const e = 1 - Math.pow(1 - k, 3);
        const [sx, sy] = toScreen(SUMMIT.x, SUMMIT.y + lerp(70, -130, e));
        orb.x = sx;
        orb.y = sy;
        orb.scale = scale * lerp(0.7, 1, e);
        if (Math.random() < 0.25) emit(sx + (Math.random() - 0.5) * 30, sy + 30, 1, { vy: -14, life: 1.4, size: 1.1 });
      } else if (cd.mode !== "hidden") {
        const b = cw.current;
        if (!b.ready) {
          b.x = (orb.x - W / 2) / c.z + c.x;
          b.y = (orb.y - H / 2) / c.z + c.y;
          b.vx = b.vy = 0;
          b.ready = true;
        }
        const K = cd.mode === "walk" ? 120 : 55;
        const D = 2 * Math.sqrt(K) * 0.72;
        const st = Math.min(dt, 0.033);
        b.vx += (K * (wx - b.x) - D * b.vx) * st;
        b.vy += (K * (wy - b.y) - D * b.vy) * st;
        b.x += b.vx * st;
        b.y += b.vy * st;
        orb.mode = "puppet";
        const [sx, sy] = toScreen(b.x, b.y);
        orb.x = sx;
        orb.y = sy;
        orb.scale += (scale - orb.scale) * Math.min(1, dt * 4);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
    };
  }, [frame, frameWide, n, campPos, steps, sides]);

  // reframe when the panel opens or closes
  useEffect(() => {
    if (idx < 0 || walking || phase !== "tour") return;
    const [x, y] = campPos[idx];
    frame(x, y - HOVER * 0.5, campZ());
  }, [detail, idx, walking, campPos, frame, phase]);

  // ---------------------------------------------------------------- narration
  const narrate = useCallback(async (l: Line) => {
    if (skipped.current && l.title === undefined) return;
    stopVoice();
    const voice = l.voice ? await speak(l.voice) : null;
    const words = l.text.split(" ");
    const times = voice ? voice.words : words.map((_, i) => 0.06 + i * 0.052);
    setNarr({ ...l, times, key: Math.random() });
    times.forEach((t) => setTimeout(() => orb.pulse(0.35, 0.9), t * 1000));
    const ms = (times.at(-1) ?? 0) * 1000 + 450;
    if (!voice) orb.speakFor(ms - 300);
    if (l.title === undefined) await pause(voice ? Math.max(ms, (voice.audio.duration || 0) * 1000) : ms);
  }, []);

  // ---------------------------------------------------------------- moving between camps
  const arrive = useCallback(
    (i: number, open: boolean) => {
      const st = steps[i];
      setWalking(false);
      setIdx(i);
      setVisited((v) => Math.max(v, i));
      orb.setEmo(st.kind === "base" ? "speaking" : MOOD[st.status]);
      const [sx, sy] = toScreen(campPos[i][0], campPos[i][1]);
      ring(sx, sy, 8, 46, 0.9);
      tones.soft();
      if (st.status === "goal") {
        orb.hop(1);
        setTimeout(() => (cw.current.vy -= 520), 120);
        orb.spinOnce();
      }
      if (open) setDetail(true);
      narrate({ title: st.title, label: st.label, status: st.status, text: st.say, step: i });
    },
    [steps, campPos, narrate],
  );

  const go = useCallback(
    (i: number, open = false) => {
      if (i < 0 || i >= n || walking || (phase !== "tour" && phase !== "overview")) return;
      const fromAbove = phase === "overview";
      if (i === idx && !fromAbove) {
        if (open) setDetail(true);
        return;
      }
      stopVoice();
      tones.tap();
      const from = u.current;
      const to = campU(i, n);
      const dur = Math.abs(to - from) < 1e-4 ? 300 : clamp(Math.abs(to - from) * 7000, 1100, 4200);
      setWalking(true);
      setDetail(false);
      setHover(null);
      orb.setEmo("happy");
      cam.current.k = 5;
      cam.current.kz = undefined;
      cordi.current = { mode: "walk", from, to, t0: performance.now(), dur, wide: fromAbove };
      setTimeout(() => {
        if (fromAbove) {
          setPhase("tour");
          cam.current.k = 3.2;
          cam.current.kz = 1.7;
          setTimeout(() => {
            cam.current.k = 5;
            cam.current.kz = undefined;
          }, 1800);
        }
        arrive(i, open);
      }, dur + 80);
    },
    [n, walking, phase, idx, arrive, setPhase],
  );

  // ---------------------------------------------------------------- the whole mountain
  const overview = useCallback(() => {
    if (walking) return;
    stopVoice();
    tones.tap();
    setDetail(false);
    setPhase("overview");
    const cc = cam.current;
    cc.k = 3;
    cc.kz = 2;
    frameWide();
    orb.setEmo("happy");
  }, [walking, frameWide, setPhase]);

  const guide = useCallback(() => {
    tones.tap();
    const cc = cam.current;
    cc.k = 3.4;
    cc.kz = 1.6;
    setTimeout(() => {
      cc.k = 5;
      cc.kz = undefined;
    }, 2000);
    const i = Math.max(0, idx);
    cordi.current = { mode: "camp", at: campU(i, n) };
    setPhase("tour");
    arrive(i, false);
  }, [idx, n, arrive, setPhase]);

  // ---------------------------------------------------------------- the opening
  // The camera drifts in on the night; the ranges rise back to front; the yak arrives; the
  // route draws itself up the face, lighting each camp with a chime; dawn breaks behind the
  // peak; Cordi rises from behind it like the sun, turns once, says hello, and comes down the
  // real route to base camp while the whole mountain stays in view.
  const start = useCallback(async () => {
    setPhase("intro");
    setStars(1);
    stopSfx(0);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { H } = size.current;
    frameWide();
    const cc = cam.current;
    cc.z = cc.tz * 0.8;
    cc.x = cc.tx;
    cc.y = cc.ty + H * 0.45;
    cc.vx = cc.vy = cc.vz = 0;
    cc.k = 0.55;
    introT0.current = reduced ? -1e9 : performance.now();
    playSfx("ambient", { vol: 0.34, fadeAt: 11000 });

    await pause(reduced ? 0 : 2300);
    draw.current = { t0: performance.now(), dur: reduced || skipped.current ? 1 : 2600, popped: 0 };
    await pause(2900);
    if (skipped.current) {
      introT0.current = -1e9;
      if (draw.current) draw.current.t0 = -1e9;
      await wait(60);
    }

    cc.k = 1.4;
    if (!skipped.current) {
      occlude.current = true;
      orb.mode = "puppet";
      orb.setEmo("calm");
      playSfx("swell", { vol: 0.42 });
      cordi.current = { mode: "rise", t0: performance.now(), dur: 2800 };
      await pause(2900);
      occlude.current = false;
      const [sx, sy] = toScreen(SUMMIT.x, SUMMIT.y - 130);
      ring(sx, sy, 30, 120, 1.1);
      tones.form();
      orb.spinOnce();
      orb.flashEmo("happy", 1400);
    }
    occlude.current = false;
    if (skipped.current) {
      const [rx, ry] = toScreen(SUMMIT.x, SUMMIT.y - 130);
      orb.x = rx;
      orb.y = ry;
    }
    cw.current.ready = false;
    cordi.current = { mode: "camp", at: 1 };
    u.current = 1;
    await pause(700);
    await narrate({ text: line("hello"), voice: hasVoice("hello") ? "hello" : undefined });
    await pause(250);
    await narrate({ text: line("intro"), voice: hasVoice("intro") ? "intro" : undefined });
    await pause(250);
    orb.setEmo("speaking");
    await narrate({ text: "Tu plan es esta montaña. Cada bandera es una parte de tu análisis." });
    await pause(400);

    setNarr(null);
    orb.setEmo("happy");
    cc.k = 2;
    const dive = skipped.current ? 1600 : 3600;
    cordi.current = { mode: "walk", from: 1, to: 0, t0: performance.now(), dur: dive, wide: true };
    await wait(dive + 200);
    cordi.current = { mode: "camp", at: 0 };
    u.current = 0;
    touring.current = true;
    cc.k = 3;
    setPhase("overview");
    orb.flashEmo("happy", 1200);
  }, [frameWide, narrate, setPhase]);

  const skip = useCallback(() => {
    if (skipped.current) return;
    skipped.current = true;
    stopVoice();
    stopSfx(300);
    waiters.current.forEach((w) => w());
    waiters.current = [];
  }, []);

  useImperativeHandle(ref, () => ({ start, skip }), [start, skip]);

  useEffect(() => {
    orb.onTapHook = () => {
      cw.current.vy -= 380;
    };
    return () => {
      orb.onTapHook = undefined;
    };
  }, []);

  // little signs of life while it waits
  useEffect(() => {
    if (phase !== "tour" && phase !== "overview") return;
    const id = setInterval(() => {
      if (walking) return;
      const r = Math.random();
      if (r < 0.35) orb.flashEmo("curious", 1400);
      else if (r < 0.5) {
        orb.hop(0.6);
        setTimeout(() => (cw.current.vy -= 300), 120);
      }
    }, 5200);
    return () => clearInterval(id);
  }, [phase, walking]);

  // keyboard
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as Element).closest("input")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") go(Math.min(n - 1, idx + 1), phase === "overview");
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") go(Math.max(0, idx - 1), phase === "overview");
      if (e.key === "Escape") {
        if (live.current.detail) setDetail(false);
        else if (live.current.phase === "tour") overview();
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [go, idx, n, phase, overview]);

  // flags on the canvas: find the one under the pointer
  const flagAt = (x: number, y: number) => {
    let best = -1;
    let bd = 34;
    for (let i = 0; i < n; i++) {
      const [sx, sy] = toScreen(campPos[i][0], campPos[i][1] - 18);
      const d = Math.hypot(sx - x, sy - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  const interactive = phase === "overview" || phase === "tour";

  const step = idx >= 0 ? steps[idx] : null;

  return (
    <div className={`exp phase-${phase}${detail ? " with-detail" : ""}`}>
      <canvas
        ref={canvas}
        className={`world${interactive && hover !== null ? " pointing" : ""}`}
        aria-hidden
        onPointerMove={(e) => {
          if (!interactive || walking) return;
          const i = flagAt(e.clientX, e.clientY);
          if ((i < 0 ? null : i) !== hover) setHover(i < 0 ? null : i);
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          if (!interactive) return;
          const i = flagAt(e.clientX, e.clientY);
          if (i >= 0) go(i, true);
        }}
      />
      <canvas ref={front} className="world world-front" aria-hidden />
      <div className="scrim" aria-hidden />

      {/* a short summary beside every flag: on the whole mountain, or the one under the pointer */}
      <div className={`notes${phase === "overview" ? " all" : ""}`}>
        {steps.map((st, i) => (
          <button
            key={st.id}
            ref={(el) => void (notes.current[i] = el)}
            className={`note t-${st.status} ${sides[i]}${hover === i ? " on" : ""}${phase === "overview" && i === Math.max(0, idx) ? " here" : ""}`}
            style={{ ["--i" as string]: i }}
            tabIndex={phase === "overview" ? 0 : -1}
            onClick={() => go(i, true)}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            aria-label={`${st.title}: ${st.sign.fig}, ${st.sign.note}`}
          >
            <span className="note-title">{st.title}</span>
            <span className="note-fig">{st.sign.fig}</span>
            <span className="note-text">{st.sign.note}</span>
          </button>
        ))}
      </div>

      <Narration
        line={narr}
        total={n}
        hidden={(detail && !isNarrow()) || walking || phase === "overview"}
        actions={
          phase === "tour" &&
          step && (
            <>
              <button className="act act-main" onClick={() => setDetail(true)}>
                Ver el detalle
              </button>
              {idx < n - 1 && (
                <button className="act" onClick={() => go(idx + 1)} disabled={walking}>
                  Siguiente campamento
                </button>
              )}
              <button className="act act-quiet" onClick={overview}>
                Ver toda la montaña
              </button>
              <button
                className="act act-quiet"
                onClick={() => {
                  openAsk();
                  showBubble("howCanIHelp", 2200);
                }}
              >
                Preguntar a Cordi
              </button>
            </>
          )
        }
      />

      {phase === "overview" && (
        <section className="overview" aria-label="Toda la ruta">
          <h2 className="overview-title">Toda la ruta</h2>
          <p className="overview-text">
            {n - 2} campamentos entre la base y la cima. Toca una bandera para ir directo, o deja que Cordi {c.household.couple ? "os" : "te"} guíe desde abajo.
          </p>
          <div className="overview-actions">
            <button className="act act-main act-large" onClick={guide}>
              {idx < 0 ? "Empezar la visita guiada" : "Seguir la visita guiada"}
            </button>
          </div>
        </section>
      )}

      <svg className={`leader-layer${detail && !isNarrow() ? " on" : ""}`} aria-hidden>
        <path ref={leader} className="leader" pathLength={1} />
        <circle ref={leaderDot} r={4} className="leader-dot" />
      </svg>

      {step && (
        <Detail
          origin={detail && idx >= 0 ? toScreen(campPos[idx][0], campPos[idx][1] - 40) : null}
          open={detail}
          step={step}
          c={c}
          index={idx}
          total={n}
          onClose={() => setDetail(false)}
          onNext={idx < n - 1 ? () => go(idx + 1, true) : undefined}
        />
      )}
    </div>
  );
});
