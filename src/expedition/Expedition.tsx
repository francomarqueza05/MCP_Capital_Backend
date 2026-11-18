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
import { line, playSfx, prefetchSpeech, speak, stopSfx, stopVoice, tones } from "@/lib/audio";
import { clamp, easeInOut, lerp, useStore, wait } from "@/lib/store";
import { orb, type Emotion } from "@/orb/engine";
import { emit, ring, setStars } from "@/orb/fx";
import { hideBubble, lineInBubble, orbSpot } from "@/stage/stage";
import { buildSteps, type Step } from "./steps";
import { campU, ROUTE, SUMMIT, WH, WW } from "./world";
import { COLOR, drawOccluder, drawWorld, type Frame } from "./render";
import { Detail } from "./Detail";
import { Narration, type Line } from "./Narration";
import { understanding } from "./understanding";
import { chat, closePanel, setTab } from "@/stage/chat";
import { inCall } from "@/stage/call";
import { nav, remember, session } from "@/ai/client";
import { offerExplain, startExplain } from "@/explain/player";
import { ExplainButton } from "@/explain/ExplainUI";
import { beatsFor } from "@/explain/beats";
import { explain, inTheater } from "@/explain/player";

const HOVER = 78; // Cordi floats this far above the trail, in world units
const MOOD: Record<Step["status"], Emotion> = { good: "happy", warn: "thinking", bad: "concerned", goal: "happy" };

type Cam = { x: number; y: number; z: number; vx: number; vy: number; vz: number; tx: number; ty: number; tz: number; k: number; kz?: number };
type Cordi =
  | { mode: "hidden" }
  | { mode: "rise"; t0: number; dur: number }
  | { mode: "walk"; from: number; to: number; t0: number; dur: number; wide?: boolean }
  | { mode: "camp"; at: number }
  /** Pops out of (or into) existence at a point of the world: a little swell, then gone. */
  | { mode: "pop"; x: number; y: number; t0: number; dur: number; out: boolean; keep?: number; at?: number; placed?: boolean; leap?: boolean }
  /** A spark of light with a trail, looping and twirling from one point of the world to another. */
  | { mode: "fairy"; from: readonly [number, number]; to: readonly [number, number]; t0: number; dur: number };

export type ExpeditionHandle = { start: () => void; skip: () => void };
export type Phase = "wait" | "intro" | "overview" | "tour";
const GUIDE_IN = 3000; // ms on the whole mountain before the guided tour starts by itself

export const Expedition = forwardRef<ExpeditionHandle, { c: Case; onPhase?: (p: Phase) => void }>(function Expedition({ c, onPhase }, ref) {
  const steps = useMemo(() => buildSteps(c), [c]);
  const mountainLine = c.household.couple ? "Vuestro plan es esta montaña. Cada bandera es una parte de vuestro análisis." : "Tu plan es esta montaña. Cada bandera es una parte de tu análisis.";
  const n = steps.length;
  const marks = useStore(understanding, (s) => s.marks);
  // "Llévame y explícamelo" from the chat: fly to that camp, open it, offer the explanation
  const navKey = useStore(nav, (n) => n.key);
  const goRef = useRef<(i: number, open?: boolean) => void>(() => {});
  const pending = useRef<{ i: number; how: "chat" | "call" } | null>(null);
  // on the way to an explanation that starts on arrival: no camp narration in between
  const [transit, setTransit] = useState(false);
  useEffect(() => {
    const { to, how } = nav.get();
    if (!to) return;
    const i = steps.findIndex((s) => s.id === to);
    if (i < 0) return;
    closePanel();
    if (how) {
      // straight on: fly there, and the explanation starts once Cordi has arrived
      pending.current = { i, how };
      setTransit(true);
      setNarr(null);
      goRef.current(i, false);
      return;
    }
    goRef.current(i, true);
    offerExplain(steps[i], c);
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // marks belong to one family's climb: a new case starts with no flags planted
  useEffect(() => {
    understanding.set({ marks: {} });
  }, [c.id]);
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
  // the side panel is up for a camp's detail, or for the conversation with Cordi
  const chatPanel = useStore(chat, (s) => s.panel);
  const sheet = detail || chatPanel;
  // a call's explanation takes the screen: the side panel steps aside, and comes back after
  const theater = useStore(explain, (s) => s.how !== null && (s.phase === "playing" || s.phase === "done"));
  useEffect(() => {
    if (detail) setTab("detail");
  }, [detail]);
  const [narr, setNarr] = useState<Line | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  // everything the loop reads lives in refs, so React renders never touch the animation
  const cam = useRef<Cam>({ x: WW / 2, y: WH / 2, z: 0.5, vx: 0, vy: 0, vz: 0, tx: WW / 2, ty: WH / 2, tz: 0.5, k: 6 });
  const cordi = useRef<Cordi>({ mode: "hidden" });
  const u = useRef(0);
  const walked = useRef(0);
  const touring = useRef(false);
  const cw = useRef({ x: 0, y: 0, vx: 0, vy: 0, ready: false });
  const cs = useRef({ x: 0, y: 0, vx: 0, vy: 0, ready: false }); // Cordi held at a screen spot
  // the guided tour has started (by itself or by tap); camps never move on without a tap: a
  // countdown to the next camp felt like pressure
  const [auto, setAuto] = useState(false);
  const live = useRef({ idx: -1, detail: false, phase: "wait" as Phase, hover: null as number | null, visited: 0 });
  live.current = { idx, detail: sheet && !theater, phase, hover, visited };
  const introT0 = useRef(-1);
  const routeK = useRef(0);
  const draw = useRef<{ t0: number; dur: number; popped: number } | null>(null);
  const popT = useRef<number[]>([]);
  const occlude = useRef(false);
  /** The opening's camera follows the route's light as it climbs. */
  const follow = useRef(false);
  /** Where the fairy spark was last frame, to lay its trail without gaps. */
  const fairyLast = useRef<[number, number] | null>(null);
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
        // the light at the tip is drawn on the mountain itself (render.ts). No screen-space
        // sparks or rings here: the camera moves with the light, so they were left hanging in
        // the sky (a stray dotted trail and a circle over the summit)
        if (k < 1) spark = e;
        // in the opening the camera rides with the light, flag after flag, up to the summit
        if (follow.current && k < 1) {
          const [fx, fy] = ROUTE.at(e);
          frame(fx, fy - 30, campZ() * 0.82);
        }
        while (dr.popped < n && e >= campU(dr.popped, n) - 0.002) {
          const i = dr.popped++;
          popT.current[i] = now;
          if (dr.dur > 1) {
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
      const spot = orbSpot.get().at;
      if (spot && cd.mode !== "hidden" && cd.mode !== "rise" && cd.mode !== "pop") {
        // called away from the mountain (beside a call's explanation): fly there on a spring,
        // in screen space; when released, the world spring picks up from wherever it is
        const s = cs.current;
        if (!s.ready) {
          s.x = orb.x;
          s.y = orb.y;
          s.vx = s.vy = 0;
          s.ready = true;
        }
        const K = 70;
        const D = 2 * Math.sqrt(K) * 0.7;
        const st = Math.min(dt, 0.033);
        s.vx += (K * (spot.x - s.x) - D * s.vx) * st;
        s.vy += (K * (spot.y - s.y) - D * s.vy) * st;
        s.x += s.vx * st;
        s.y += s.vy * st;
        orb.mode = "puppet";
        orb.x = s.x;
        orb.y = s.y;
        orb.scale += (spot.scale - orb.scale) * Math.min(1, dt * 4);
        cw.current.ready = false;
      } else if (cd.mode === "rise") {
        // it floats up like something light, not on a rail: a soft overshoot at the top, a
        // lazy side-to-side sway that dies down, and a breathing bob once it's up
        const k = clamp((now - cd.t0) / cd.dur, 0, 1);
        const back = 1.25;
        const e = 1 + (back + 1) * Math.pow(k - 1, 3) + back * Math.pow(k - 1, 2);
        const sway = Math.sin(k * Math.PI * 2.4) * 26 * (1 - k * 0.75);
        const bob = Math.sin(now / 520) * 4 * k;
        const [sx, sy] = toScreen(SUMMIT.x + sway, SUMMIT.y + lerp(70, -130, e) + bob);
        orb.x = sx;
        orb.y = sy;
        orb.scale = scale * lerp(0.7, 1, Math.min(1, e));
      } else if (cd.mode === "pop") {
        const k = clamp((now - cd.t0) / cd.dur, 0, 1);
        let grow: number;
        const keep = cd.keep ?? 0;
        if (cd.out) {
          // swells a touch, then shrinks fast (to nothing, or to a spark of light)
          grow = k < 0.32 ? lerp(1, 1.28, Math.sin((k / 0.32) * (Math.PI / 2))) : lerp(1.28, keep, Math.pow((k - 0.32) / 0.68, 2));
        } else {
          // from nothing (or a spark), past its size, and settles
          const e = 1 - Math.pow(1 - k, 3);
          grow = k < 0.62 ? lerp(keep, 1.22, e / (1 - Math.pow(0.38, 3))) : lerp(1.22, 1, (k - 0.62) / 0.38);
        }
        // a leap into being: it springs up from just below its spot, goes past it, and drops
        // back onto it while it grows (the jelly stretches up on the way and squashes landing)
        let lift = 0;
        if (cd.leap && !cd.out) {
          if (k < 0.5) lift = lerp(60, -70, 1 - Math.pow(1 - k / 0.5, 2));
          else lift = lerp(-70, 0, Math.pow((k - 0.5) / 0.5, 1.6));
        }
        const [lx, ly] = toScreen(cd.x, cd.y + lift);
        orb.mode = "puppet";
        // appearing from nowhere: placed there, still, so it pops in round instead of stretched
        if (!cd.placed) {
          cd.placed = true;
          if (!cd.out) {
            orb.teleport(lx, ly);
            if (cd.leap) orb.hop(0.8);
          }
        }
        orb.x = lx;
        orb.y = ly;
        orb.scale = scale * Math.max(0.001, grow);
        if (k >= 1 && !(cd.out && keep > 0)) {
          cw.current.ready = false;
          cordi.current = cd.out ? { mode: "hidden" } : { mode: "camp", at: cd.at ?? 0 };
        }
      } else if (cd.mode === "fairy") {
        // a fairy's flight, unhurried: a tiny spark gliding down a soft arc to base camp at a
        // steady pace (a gentle ease, no rush in the middle), with two medium loops on the way,
        // the first one way round and the second the other, and a trail of light all along
        const k = clamp((now - cd.t0) / cd.dur, 0, 1);
        const e = 0.75 * k + 0.25 * ((1 - Math.cos(Math.PI * k)) / 2);
        const [ax, ay] = cd.from;
        const [bx, by] = cd.to;
        const cx = (ax + bx) / 2 - 200;
        const cy = Math.min(ay, by) + 30;
        const px = (1 - e) * (1 - e) * ax + 2 * (1 - e) * e * cx + e * e * bx;
        const py = (1 - e) * (1 - e) * ay + 2 * (1 - e) * e * cy + e * e * by;
        const R = 62;
        // each loop is a full circle drawn over its own stretch of the flight
        const loopAt = (from: number, to: number) => {
          const w = clamp((e - from) / (to - from), 0, 1);
          return (1 - Math.cos(Math.PI * w)) / 2 * Math.PI * 2;
        };
        const a1 = loopAt(0.18, 0.46);
        const a2 = loopAt(0.56, 0.84);
        const fx = px + Math.sin(a1) * R - Math.sin(a2) * R;
        const fy = py - (1 - Math.cos(a1)) * R - (1 - Math.cos(a2)) * R;
        const [sx, sy] = toScreen(fx, fy);
        // the trail: sparks laid evenly along the path travelled since the last frame, so it
        // stays continuous however fast the spark goes
        const lp = fairyLast.current ?? [sx, sy];
        const dist = Math.hypot(sx - lp[0], sy - lp[1]);
        const steps = Math.max(1, Math.round(dist / 3));
        for (let j = 1; j <= steps; j++) {
          const t = j / steps;
          emit(lp[0] + (sx - lp[0]) * t, lp[1] + (sy - lp[1]) * t, 1, { min: 0, max: 5, vy: 3, life: 1.8, size: 0.95 });
        }
        fairyLast.current = [sx, sy];
        orb.mode = "puppet";
        orb.x = sx;
        orb.y = sy;
        orb.scale = scale * (0.07 + Math.sin(now / 70) * 0.008);
        if (k >= 1) fairyLast.current = null;
        if (k >= 1) cordi.current = { mode: "pop", x: bx, y: by, t0: now, dur: 600, out: false, keep: 0.07 };
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
      if (cd.mode === "hidden") {
        // not on stage yet (or gone): truly out of sight, not left standing where it was
        orb.mode = "puppet";
        orb.x = -400;
        orb.y = -400;
        orb.scale = 0.001;
      }
      if (!spot) cs.current.ready = false;
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
  }, [sheet, theater, idx, walking, campPos, frame, phase]);

  // ---------------------------------------------------------------- narration
  const narrate = useCallback(async (l: Line) => {
    if (skipped.current && l.title === undefined) return;
    // on a call the voice belongs to the call: never cut Cordi off mid-sentence there
    if (!inCall()) stopVoice();
    // on a call, Cordi's voice belongs to the call: narration shows as text only
    const voice = l.voice && !inCall() ? await speak(l.voice) : null;
    const words = l.text.split(" ");
    const times = voice ? voice.words : words.map((_, i) => 0.06 + i * 0.052);
    const key = Math.random();
    remember(l.text);
    setNarr({ ...l, times, key });
    // the words go in Cordi's bubble; on the tour it stays a while so it can be read again
    lineInBubble(l.text, times, (times.at(-1) ?? 0) * 1000 + (l.title !== undefined ? 6000 : 900));
    const ms = (times.at(-1) ?? 0) * 1000 + 450;
    const pulses = times.map((t) => setTimeout(() => orb.pulse(0.35, 0.9), t * 1000));
    if (!voice) orb.speakFor(ms - 300);
    if (l.title !== undefined) return;

    // The opening's lines play like a game's dialogue box: a tap while the words are still
    // appearing shows the whole line at once (the voice carries on); a tap once it's whole
    // stops the voice and moves to the next line. Left alone, it moves on when the voice ends.
    await new Promise<void>((res) => {
      let whole = false;
      let over = false;
      const showAll = () => {
        if (whole) return;
        whole = true;
        setNarr((n) => (n && n.key === key ? { ...n, whole: true } : n));
      };
      const end = () => {
        if (over) return;
        over = true;
        dialog.current = null;
        pulses.forEach(clearTimeout);
        res();
      };
      dialog.current = () => {
        if (!whole) showAll();
        else {
          stopVoice();
          orb.speakFor(0);
          end();
        }
      };
      setTimeout(showAll, ms);
      const spoken = voice
        ? new Promise<void>((r) => {
            if (voice.audio.ended || voice.audio.paused) return r();
            voice.audio.addEventListener("ended", () => r(), { once: true });
            voice.audio.addEventListener("pause", () => r(), { once: true });
            voice.audio.addEventListener("error", () => r(), { once: true });
          })
        : wait(ms);
      spoken.then(() => pause(550)).then(end);
      if (skipped.current) end();
    });
  }, []);

  // the dialogue box's tap: anywhere on the scene (not on a button), or Space / Enter
  const dialog = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (phase !== "intro") return;
    const tap = (e: PointerEvent) => {
      if ((e.target as Element).closest("button, a, input, select")) return;
      dialog.current?.();
    };
    const key = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && !(e.target as Element).closest("button, input, textarea, select, [contenteditable]")) {
        e.preventDefault();
        dialog.current?.();
      }
    };
    addEventListener("pointerdown", tap);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("pointerdown", tap);
      removeEventListener("keydown", key);
    };
  }, [phase]);

  // ---------------------------------------------------------------- moving between camps
  const arrive = useCallback(
    (i: number, open: boolean) => {
      const st = steps[i];
      session.set({ camp: st.title, campId: st.id });
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
      }
      if (open) setDetail(true);
      if (!pending.current) narrate({ title: st.title, label: st.label, status: st.status, text: st.say, voice: st.say, step: i });
      // the next camp's line, ready before Cordi gets there
      if (steps[i + 1]) prefetchSpeech(steps[i + 1].say);
      // and the start of this camp's explanation, in case "Explícame esto" comes next
      beatsFor(st, c).slice(0, 2).forEach((b) => prefetchSpeech(b.say));
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
      if (!inCall()) {
        stopVoice();
        hideBubble();
      }
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
          cam.current.k = 5;
          cam.current.kz = 4;
          setTimeout(() => {
            cam.current.k = 5;
            cam.current.kz = undefined;
          }, 1100);
        }
        arrive(i, open);
      }, dur + 80);
    },
    [n, walking, phase, idx, arrive, setPhase],
  );

  goRef.current = go;
  // arrived where "Siguiente" was headed: start its explanation in the same mode
  useEffect(() => {
    const p = pending.current;
    if (!p || walking || idx !== p.i) return;
    pending.current = null;
    const t = setTimeout(() => {
      offerExplain(steps[p.i], c, true);
      void startExplain(p.how);
      setTransit(false);
    }, 250);
    return () => clearTimeout(t);
  }, [walking, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- the whole mountain
  const overview = useCallback(() => {
    if (walking) return;
    stopVoice();
    tones.tap();
    setDetail(false);
    setPhase("overview");
    const cc = cam.current;
    cc.k = 5;
    cc.kz = 4;
    frameWide();
    orb.setEmo("happy");
  }, [walking, frameWide, setPhase]);

  const guide = useCallback(() => {
    tones.tap();
    setAuto(true);
    const cc = cam.current;
    cc.k = 5;
    cc.kz = 4;
    setTimeout(() => {
      cc.k = 5;
      cc.kz = undefined;
    }, 1100);
    const i = Math.max(0, idx);
    cordi.current = { mode: "camp", at: campU(i, n) };
    setPhase("tour");
    arrive(i, false);
  }, [idx, n, arrive, setPhase]);

  // the whole mountain after the intro: the guided tour starts by itself after a moment
  useEffect(() => {
    if (phase !== "overview" || idx >= 0 || auto) return;
    const t = setTimeout(guide, GUIDE_IN);
    return () => clearTimeout(t);
  }, [phase, idx, auto, guide]);

  // ---------------------------------------------------------------- the opening
  // The camera drifts in on the night; the ranges rise back to front; the yak arrives; the
  // route draws itself up the face, lighting each camp with a chime; dawn breaks behind the
  // peak; Cordi rises from behind it like the sun, turns once, says hello, and comes down the
  // real route to base camp while the whole mountain stays in view.
  const opened = useRef(false);
  const start = useCallback(async () => {
    // one opening per mountain, however many times start is asked for
    if (opened.current) return;
    opened.current = true;
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
    // a brisk opening: the camera springs are stiff enough that every push in and pull back
    // lands in well under a second instead of drifting
    cc.k = 2.2;
    introT0.current = reduced ? -1e9 : performance.now();
    playSfx("ambient", { vol: 0.34, fadeAt: 7000 });
    // the opening lines go through the live voice too, so all of the intro is one voice
    prefetchSpeech(line("hello"));
    prefetchSpeech(line("intro"));
    prefetchSpeech(mountainLine);
    prefetchSpeech(steps[0].say);

    // the ranges rise and the yak walks in (render.ts: from 0.85 s); the camera leans in on it
    await pause(reduced ? 0 : 900);
    const lively = !reduced && !skipped.current;
    if (lively) {
      const [yx, yy] = [campPos[0][0] - 190, campPos[0][1] + 14];
      cc.k = 4;
      cc.kz = 3.2;
      frame(yx + 70, yy - 40, campZ() * 0.95);
      await pause(1000);
    }

    // a light climbs the route from the yak to the summit, the camera on its heels, and each
    // flag pops up with its chime as it passes
    follow.current = lively;
    cc.k = 7;
    cc.kz = 5;
    draw.current = { t0: performance.now(), dur: lively ? 3200 : 1, popped: 0 };
    await pause(lively ? 3300 : 300);
    follow.current = false;
    if (skipped.current) {
      introT0.current = -1e9;
      if (draw.current) draw.current.t0 = -1e9;
      await wait(60);
    }

    // at the summit, close up: Cordi pops into being and says hello
    cc.kz = undefined;
    cc.k = 6;
    const top = ROUTE.at(1);
    const peak = [top[0], top[1] - HOVER] as const;
    const base = ROUTE.at(0);
    const landing = [base[0], base[1] - HOVER] as const;
    frame(peak[0], peak[1] + HOVER * 0.4, campZ() * 1.1);
    // Cordi only appears once the camera has finished closing in
    orb.setEmo("happy");
    {
      const t0 = performance.now();
      while (!skipped.current && performance.now() - t0 < 1200 && (Math.abs(cc.z - cc.tz) / cc.tz > 0.02 || Math.hypot(cc.x - cc.tx, cc.y - cc.ty) > 10 || Math.hypot(cc.vx, cc.vy) > 20)) await wait(40);
    }
    u.current = 1;
    cordi.current = { mode: "pop", x: peak[0], y: peak[1], t0: performance.now(), dur: skipped.current ? 200 : 650, out: false, at: 1, leap: !skipped.current };
    tones.popIn();
    // the camera is still now: a ring where it appears stays put
    if (!skipped.current) {
      const [sx, sy] = toScreen(peak[0], peak[1]);
      ring(sx, sy, 16, 70, 0.7);
    }
    await pause(skipped.current ? 300 : 450);
    await narrate({ text: line("hello"), voice: line("hello") });
    await pause(300);
    await narrate({ text: line("intro"), voice: line("intro") });
    await pause(300);
    setNarr(null);
    hideBubble();

    // pop: gone, still close up...
    const at = [cw.current.ready ? cw.current.x : peak[0], cw.current.ready ? cw.current.y : peak[1]] as const;
    cordi.current = { mode: "pop", x: at[0], y: at[1], t0: performance.now(), dur: skipped.current ? 160 : 360, out: true };
    tones.popOut();
    await wait(skipped.current ? 160 : 360);
    // ...the camera pulls back quickly to the whole mountain...
    cc.k = 8;
    cc.kz = 8;
    frameWide();
    const t0 = performance.now();
    while (performance.now() - t0 < 900 && (Math.abs(cc.z - cc.tz) / cc.tz > 0.02 || Math.hypot(cc.x - cc.tx, cc.y - cc.ty) > 12)) await wait(40);
    // ...and once it's there, pop: Cordi is back, at base camp
    u.current = 0;
    cordi.current = { mode: "pop", x: landing[0], y: landing[1], t0: performance.now(), dur: 560, out: false, at: 0 };
    tones.popIn();
    {
      const [bx, by] = toScreen(landing[0], landing[1]);
      ring(bx, by, 12, 70, 0.8);
      emit(bx, by, 12, { min: 20, max: 80, life: 0.7, size: 1 });
    }
    cc.kz = undefined;
    orb.flashEmo("happy", 1400);
    await wait(350);
    touring.current = true;
    cc.k = 3;
    // with the whole mountain in view: what it means
    orb.setEmo("speaking");
    await narrate({ text: mountainLine, voice: mountainLine });
    await pause(350);
    setNarr(null);
    setPhase("overview");
    orb.flashEmo("happy", 1200);
  }, [frameWide, narrate, setPhase, mountainLine]);

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
    // a tap makes Cordi hop; rapid taps don't stack into a launch off the screen
    let lastHop = 0;
    orb.onTapHook = () => {
      const now = performance.now();
      if (now - lastHop < 350) return;
      lastHop = now;
      cw.current.vy = Math.min(cw.current.vy, 0) - 380;
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
      if ((e.target as Element).closest("input, textarea, [contenteditable]") || inTheater()) return;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") go(Math.min(n - 1, idx + 1), phase === "overview");
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") go(Math.max(0, idx - 1), phase === "overview");
      if (e.key === "Escape") {
        if (live.current.detail) {
          setDetail(false);
          closePanel();
        }
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
          if (i >= 0) {
            setAuto(false);
            go(i, true);
          } else if (phase === "tour" && !walking) {
            // a click away from the flags: the whole mountain
            setAuto(false);
            overview();
          }
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
            className={`note t-${st.status} ${sides[i]}${marks[st.id] === "yes" ? " understood" : ""}${hover === i ? " on" : ""}${phase === "overview" && i === Math.max(0, idx) ? " here" : ""}`}
            style={{ ["--i" as string]: i }}
            tabIndex={phase === "overview" ? 0 : -1}
            onClick={() => {
              setAuto(false);
              go(i, true);
            }}
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
        hidden={(sheet && !isNarrow()) || walking || transit || phase === "overview"}
        actions={
          phase === "tour" &&
          step && (
            <>
              <ExplainButton step={step} c={c} />
              <button className="act" onClick={() => setDetail(true)}>
                Ver el detalle
              </button>
              {idx < n - 1 && (
                <button className="act" onClick={() => go(idx + 1)} disabled={walking}>
                  Siguiente campamento
                </button>
              )}
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
            <button
              className={idx < 0 && !auto ? "act act-main act-large auto" : "act act-main act-large"}
              style={{ ["--auto-ms" as string]: `${GUIDE_IN}ms` }}
              onClick={guide}
            >
              {idx < 0 && !auto && <span className="auto-fill" aria-hidden />}
              <span className="auto-label">{idx < 0 ? "Empezar la visita guiada" : "Seguir la visita guiada"}</span>
            </button>
          </div>
        </section>
      )}

      <svg className={`leader-layer${detail && !isNarrow() ? " on" : ""}`} aria-hidden>
        <path ref={leader} className="leader" pathLength={1} />
        <circle ref={leaderDot} r={4} className="leader-dot" />
      </svg>

      {(step || chatPanel) && (
        <Detail
          origin={detail && idx >= 0 ? toScreen(campPos[idx][0], campPos[idx][1] - 40) : null}
          open={sheet && !theater}
          step={step ?? steps[0]}
          c={c}
          index={Math.max(0, idx)}
          total={n}
          onClose={() => {
            setDetail(false);
            closePanel();
          }}
          onNext={idx < n - 1 ? () => go(idx + 1, true) : undefined}
          steps={steps}
          onGo={(i) => go(i, true)}
        />
      )}
    </div>
  );
});
