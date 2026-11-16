// Cordi, the orb. One engine object owns its state; the Orb component hands it the DOM nodes
// and a single requestAnimationFrame loop drives it. Nothing here goes through React state:
// it writes transforms directly, sixty times a second.
//
// The body is a soft object, not a sprite on rails:
//   - where it goes is a damped spring toward a target (calm flight);
//   - its jelly is a second spring driven by the body's own acceleration, so it lags, bulges
//     and wobbles when it starts, stops or turns, and settles with a little overshoot;
//   - it stretches along the direction it travels, keeping its volume;
//   - it hangs like a pendulum: sideways acceleration swings it, gravity brings it back;
//   - the face rides on its own spring, so it trails the body and catches up;
//   - hops crouch first (anticipation), then launch.
import { audioContext, isTalking, tones } from "@/lib/audio";
import { clamp, easeInOut, easeOut, lerp, rand } from "@/lib/store";
import { emit, ring } from "./fx";

export const BASE = 88;

export type Emotion =
  | "neutral"
  | "calm"
  | "happy"
  | "curious"
  | "thinking"
  | "listening"
  | "speaking"
  | "concerned"
  | "surprised"
  | "resting";

type Params = {
  w: number; hL: number; hR: number; happy: number; mw: number; mc: number; mo: number;
  blush: number; tilt: number; drop: number; hue: number; sat: number; bob: number; halo: number;
  gaze?: [number, number];
};

// Eyes are small rounded pills set low and close together. hL/hR are their heights, `happy`
// morphs them into arcs, mw/mc/mo shape the mouth, tilt/drop are body language.
const EMO: Record<Emotion, Params> = {
  neutral:   { w: 6.5, hL: 11,   hR: 11,   happy: 0, mw: 4,   mc: 2.5, mo: 1,   blush: 0,   tilt: 0,  drop: 0,  hue: 232, sat: 70, bob: 1,   halo: 1 },
  calm:      { w: 6.5, hL: 7.5,  hR: 7.5,  happy: 0, mw: 4,   mc: 3,   mo: 0.9, blush: 0,   tilt: 0,  drop: 2,  hue: 232, sat: 70, bob: 0.8, halo: 0.9 },
  happy:     { w: 6.5, hL: 9,    hR: 9,    happy: 1, mw: 5.5, mc: 5.5, mo: 2.6, blush: 0.6, tilt: 0,  drop: -4, hue: 32,  sat: 80, bob: 1.5, halo: 1.1 },
  curious:   { w: 6.5, hL: 12.5, hR: 9.5,  happy: 0, mw: 2.6, mc: 0.5, mo: 1.8, blush: 0,   tilt: 13, drop: 0,  hue: 205, sat: 62, bob: 0.8, halo: 1 },
  thinking:  { w: 6.5, hL: 9,    hR: 9,    happy: 0, mw: 3,   mc: -0.6, mo: 0.9, blush: 0,  tilt: -9, drop: 0,  hue: 218, sat: 62, bob: 0.5, halo: 0.95, gaze: [-0.8, -0.9] },
  listening: { w: 6.5, hL: 12,   hR: 12,   happy: 0, mw: 3.5, mc: 2,   mo: 1.2, blush: 0,   tilt: 6,  drop: -2, hue: 160, sat: 52, bob: 0.6, halo: 1.08 },
  speaking:  { w: 6.5, hL: 10.5, hR: 10.5, happy: 0, mw: 4.2, mc: 2.5, mo: 1.2, blush: 0.15, tilt: 0, drop: 0,  hue: 232, sat: 70, bob: 1.1, halo: 1 },
  concerned: { w: 6.5, hL: 8,    hR: 8,    happy: 0, mw: 4,   mc: -3,  mo: 1,   blush: 0,   tilt: -4, drop: 8,  hue: 262, sat: 48, bob: 0.4, halo: 0.85, gaze: [0, 0.7] },
  surprised: { w: 7.5, hL: 13.5, hR: 13.5, happy: 0, mw: 2.6, mc: 0,   mo: 3.8, blush: 0,   tilt: 0,  drop: -6, hue: 232, sat: 70, bob: 1.6, halo: 1.12 },
  resting:   { w: 6.5, hL: 1.6,  hR: 1.6,  happy: 0, mw: 3,   mc: 1.5, mo: 0.6, blush: 0,   tilt: 5,  drop: 6,  hue: 235, sat: 36, bob: 0.4, halo: 0.75 },
};
const KEYS = ["w", "hL", "hR", "happy", "mw", "mc", "mo", "blush", "tilt", "drop", "hue", "sat", "bob", "halo"] as const;
// A kick on entering an emotion: [vertical velocity, squash velocity (- = stretch tall)]
const KICK: Partial<Record<Emotion, [number, number]>> = {
  happy: [-240, 2.4],
  surprised: [-360, -3.2],
  curious: [-80, 1.1],
  listening: [-60, 1],
  concerned: [70, 1.3],
};
const ACTS: [string, number][] = [["wander", 45], ["look", 20], ["hop", 15], ["loop", 11], ["spin", 9]];

/** puppet: something else sets x/y every frame (the expedition camera); the body still reacts. */
export type Mode = "off" | "intro" | "talk" | "hold" | "idle" | "puppet";

/** Eyes and mouth, a little bigger than the first proposal so the face reads from afar. */
const FACE = 1.25;

type Els = {
  root: HTMLElement;
  body: HTMLElement;
  jelly: HTMLElement;
  halo: HTMLElement;
  shadow: HTMLElement;
  face: SVGGElement;
  eyes: { cx: number; el: SVGRectElement; arc: SVGPathElement; shine: SVGCircleElement; key: "hL" | "hR" }[];
  mouth: SVGPathElement;
  blush: SVGElement[];
};

type FrameListener = (o: OrbEngine) => void;

export class OrbEngine {
  // where it is and where it is heading
  x = 0; y = 0; vx = 0; vy = 0; tx = 0; ty = 0;
  scale = 1; targetScale = 1; spin = 0; spinTarget = 0;
  // measured motion (from position deltas, so the intro's scripted flight gets physics too)
  private mvx = 0; private mvy = 0; private ax = 0; private ay = 0; private px = 0; private py = 0;
  // soft body
  private jx = 0; private jy = 0; private jvx = 0; private jvy = 0; // jelly offset, in px
  private sq = 0; private sqv = 0; // pulse squash (words, kicks, hops)
  private th = 0; private thv = 0; // pendulum angle, degrees
  private fx = 0; private fy = 0; private fvx = 0; private fvy = 0; // face offset spring
  sqx = 1; sqy = 1; // scripted squash for the landing
  bob = 0;

  mode: Mode = "off";
  /** Mouth keeps moving until then, for narration that has no recorded voice. */
  talkUntil = 0;
  speakFor(ms: number) {
    this.talkUntil = performance.now() + ms;
  }
  emo: Emotion = "neutral";
  private flash: Emotion | null = null;
  private flashUntil = 0;
  private lastEmo: Emotion | null = null;
  level = 0;
  listening = false;
  private gx = 0; private gy = 0; private glance: [number, number] = [0, 0]; private nextGlance = 0;
  private blinkAt = 0; private nextBlink = 0;
  private act: { type: string; t0: number; x: number; y: number } | null = null;
  private nextAct = 0;
  private wayUntil = 0;
  private noticeUntil = 0;
  private mouthOpen = 0;
  private P: Params = { ...EMO.calm };
  private els: Els | null = null;
  private listeners = new Set<FrameListener>();
  debugEmo: Emotion | null = null;
  eyesVisible = true;
  reduced = false;

  mouse = { x: -1e4, y: -1e4, at: 0 };
  lastInput = 0;
  private wasResting = false;
  W = 1280;
  H = 800;

  // intro choreography, set by the intro scene
  intro: { t0: number; sun: { x: number; y: number }; landed: boolean; done: (() => void) | null } | null = null;

  attach(els: Els) {
    this.els = els;
  }
  onFrame(fn: FrameListener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  resize(W: number, H: number) {
    this.W = W;
    this.H = H;
  }
  rest() {
    return { x: this.W / 2, y: this.H * 0.36 };
  }

  setEmo(e: Emotion) {
    this.emo = e;
  }
  flashEmo(e: Emotion, ms: number) {
    this.flash = e;
    this.flashUntil = performance.now() + ms;
  }
  /** Spoken word onset: a small pulse of light and give. */
  pulse(level = 0.45, give = 1) {
    this.level = Math.max(this.level, level);
    this.sqv += give;
  }
  moveTo(x: number, y: number, mode: Mode = "hold") {
    this.mode = mode;
    this.tx = x;
    this.ty = y;
  }
  setIdle() {
    this.mode = "idle";
    this.nextAct = 0;
  }
  spinOnce() {
    this.spinTarget += Math.PI * 2;
  }
  /** Crouch, then jump: the anticipation is what sells the weight. */
  hop(strength = 1) {
    this.sqv += 3.4 * strength;
    setTimeout(() => {
      this.vy -= 360 * strength;
      this.sqv -= 4.6 * strength;
    }, 120);
  }
  /** Lets whoever owns the orb's position (the expedition) add a physical hop of its own. */
  onTapHook?: () => void;
  tapped() {
    this.onTapHook?.();
    tones.tap();
    this.flashEmo("happy", 1200);
    this.spinOnce();
    ring(this.x, this.y, 30 * this.scale, 50, 0.8);
    this.hop(0.7);
  }
  hovered() {
    if (this.mode !== "idle" && this.mode !== "hold" && this.mode !== "puppet") return;
    this.flashEmo("happy", 1100);
    this.sqv += 1.6;
  }

  private currentEmo(now: number): Emotion {
    if (this.debugEmo) return this.debugEmo;
    if (this.flash && now < this.flashUntil) return this.flash;
    if (this.mode === "idle") {
      if (now - this.lastInput > 20000) return "resting";
      if (Math.hypot(this.mouse.x - this.x, this.mouse.y - this.y) < 150) return "curious";
    }
    return this.emo;
  }

  // ------------------------------------------------------------- input
  input(e: PointerEvent | KeyboardEvent) {
    const now = performance.now();
    const pe = "clientX" in e ? e : null;
    if (pe && e.type === "pointermove") this.makeWay(pe.clientX, pe.clientY);
    if (pe && e.type === "pointermove" && now - this.mouse.at > 4000 && this.mode !== "intro" && this.mode !== "off") {
      this.noticeUntil = now + 1400;
      if (this.mode === "idle") this.flashEmo("curious", 800);
    }
    if (this.wasResting && this.mode === "idle" && now - this.lastInput > 20000) this.flashEmo("surprised", 600);
    this.wasResting = false;
    this.lastInput = now;
    if (pe) {
      this.mouse.x = pe.clientX;
      this.mouse.y = pe.clientY;
      this.mouse.at = now;
    }
  }

  /** If it sits on something clickable that the cursor is reaching for, it slides away. */
  private makeWay(x: number, y: number) {
    if (this.mode === "intro" || this.mode === "off" || !this.els) return;
    if (Math.hypot(x - this.x, y - this.y) > BASE * this.scale * 0.75) return;
    const under = document.elementsFromPoint(x, y).find((el) => !this.els!.root.contains(el));
    if (!under?.closest("button, input, a, [role=button]")) return;
    const dx = this.x - x || 1;
    const dy = this.y - y;
    const d = Math.hypot(dx, dy) || 1;
    this.wayUntil = performance.now() + 1200;
    if (this.mode === "idle") this.nextAct = performance.now() + 2500;
    this.tx = this.x + (dx / d) * 150;
    this.ty = this.y + (dy / d) * 150 - 40;
  }

  // ------------------------------------------------------------- intro flight
  private introStep(now: number) {
    const it = this.intro!;
    const TL = INTRO_TL;
    const t = now - it.t0;
    const r = this.rest();
    const sun = it.sun;
    const root = this.els?.root;
    if (this.reduced) {
      if (root) root.style.opacity = String(clamp(t / 600, 0, 1));
      this.x = r.x;
      this.y = r.y;
      this.scale = 1;
      if (t > 600) this.finishIntro();
      return;
    }
    const top = { x: sun.x, y: sun.y - 70 };
    if (t < TL.rise) {
      if (root) root.style.opacity = "0";
      this.x = sun.x;
      this.y = sun.y + 50;
      this.scale = 0.4;
      this.spin = 0;
    } else if (t < TL.fly) {
      // sunrise: climbs slowly out from behind the peak
      const e = easeOut((t - TL.rise) / (TL.fly - TL.rise));
      if (root) root.style.opacity = "1";
      this.x = sun.x;
      this.y = lerp(sun.y + 50, top.y, e);
      this.scale = lerp(0.4, 0.55, e);
      this.spin = 0;
      if (Math.random() < 0.2) emit(this.x + rand(-20, 20), this.y, 1, { vy: -10, life: 1.4, size: 1.1 });
    } else if (t < TL.land) {
      // glides to centre stage along a curve, turning once on its axis
      const e = easeInOut((t - TL.fly) / (TL.land - TL.fly));
      const cx = lerp(top.x, r.x, 0.5);
      const cy = Math.min(top.y, r.y) - this.H * 0.1;
      this.x = (1 - e) ** 2 * top.x + 2 * (1 - e) * e * cx + e * e * r.x;
      this.y = (1 - e) ** 2 * top.y + 2 * (1 - e) * e * cy + e * e * r.y;
      this.scale = lerp(0.55, 1, e);
      this.spin = e * 2 * Math.PI;
      if (Math.random() < 0.4) emit(this.x, this.y, 1, { life: 1, size: 1.2 });
    } else if (t < TL.end) {
      if (!it.landed) {
        it.landed = true;
        tones.form();
        ring(r.x, r.y, 40, 150, 1.1);
      }
      if (root) root.style.opacity = "1";
      this.x = r.x;
      this.y = r.y;
      this.scale = 1;
      this.spin = 2 * Math.PI;
      // the landing itself is carried by the jelly: arriving decelerates it, and it wobbles
    } else this.finishIntro();
  }

  finishIntro() {
    this.scale = this.targetScale = 1;
    this.spin = this.spinTarget = 0;
    this.vx = this.vy = 0;
    this.tx = this.x;
    this.ty = this.y;
    this.mode = "talk";
    if (this.els) this.els.root.style.opacity = "1";
    const done = this.intro?.done;
    this.intro = null;
    done?.();
  }

  // ------------------------------------------------------------- idle life
  // It keeps itself busy instead of shadowing the cursor: picks a small activity, does it,
  // rests a moment, picks another. Weights are rough percentages.
  private live(now: number) {
    const { W, H } = this;
    if (now - this.lastInput > 20000) {
      this.tx = this.x;
      this.ty = this.y;
      return;
    }
    if (now < this.wayUntil) return;
    // a cursor coming close probably wants to tap it: hold still and wait
    if (now - this.mouse.at < 1500 && Math.hypot(this.mouse.x - this.x, this.mouse.y - this.y) < 180) {
      this.tx = this.x;
      this.ty = this.y;
      this.act = null;
      this.nextAct = now + 1500;
      return;
    }
    const a = this.act;
    if (a?.type === "loop") {
      const ang = Math.min(1, (now - a.t0) / 1600) * Math.PI * 2;
      this.tx = a.x + Math.sin(ang) * 55;
      this.ty = a.y - (1 - Math.cos(ang)) * 55;
    }
    if (a?.type === "look" && now - a.t0 < 2600) {
      const u = (now - a.t0) / 2600;
      this.glance = u < 0.35 ? [-0.9, -0.1] : u < 0.7 ? [0.9, -0.1] : [0, 0];
      this.nextGlance = now + 400;
    }
    if (now < this.nextAct) return;
    let r = Math.random() * 100;
    let type = "wander";
    for (const [t, w] of ACTS) if ((r -= w) < 0) {
      type = t;
      break;
    }
    this.act = { type, t0: now, x: this.x, y: this.y };
    let dur = 1200;
    if (type === "wander") {
      this.tx = rand(W * 0.08, W * 0.92);
      this.ty = rand(H * 0.12, H * 0.6);
      dur = rand(3000, 5000);
    }
    if (type === "look") {
      this.tx = this.x;
      this.ty = this.y;
      this.flashEmo("curious", 2400);
      dur = 2600;
    }
    if (type === "hop") {
      this.flashEmo("happy", 1100);
      this.hop(1);
      setTimeout(() => this.mode === "idle" && this.hop(0.75), 560);
      dur = 1400;
    }
    if (type === "loop") {
      this.flashEmo("happy", 1600);
      dur = 1700;
    }
    if (type === "spin") {
      this.spinOnce();
      this.flashEmo("happy", 1000);
    }
    this.nextAct = now + dur + rand(1500, 4000);
  }

  private flight(now: number, dt: number) {
    if (this.mode === "idle") this.live(now);
    if (this.mode === "talk") {
      const r = this.rest();
      this.tx = r.x;
      this.ty = r.y;
    }
    const looping = this.act?.type === "loop" && now - this.act.t0 < 1700;
    const k = this.mode === "idle" ? (looping ? 16 : 3.2) : 12;
    const damp = this.mode === "idle" ? (looping ? 6 : 3.1) : 6.4;
    this.vx += ((this.tx - this.x) * k - this.vx * damp) * dt;
    this.vy += ((this.ty - this.y) * k - this.vy * damp) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // stay on screen; bump softly off the edges
    const m = BASE * this.scale * 0.6 + 14;
    const { W, H } = this;
    this.tx = clamp(this.tx, m, W - m);
    this.ty = clamp(this.ty, m, H - m);
    if (this.x < m || this.x > W - m) {
      this.x = clamp(this.x, m, W - m);
      this.vx *= -0.35;
      this.jvx += this.vx * 0.4;
    }
    if (this.y < m || this.y > H - m) {
      this.y = clamp(this.y, m, H - m);
      this.vy *= -0.35;
      this.jvy += this.vy * 0.4;
    }
    this.scale += (this.targetScale - this.scale) * Math.min(1, dt * 4);
    this.spin += (this.spinTarget - this.spin) * Math.min(1, dt * 5);
    if (Math.random() < dt * 1.2) emit(this.x + rand(-12, 12), this.y + rand(10, 20) * this.scale, 1, { vy: 12, life: 1.3, size: 1 });
  }

  // ------------------------------------------------------------- soft body
  private soft(dt: number) {
    // measured velocity and acceleration, low-passed so scripted motion does not jitter
    const vx = (this.x - this.px) / dt;
    const vy = (this.y - this.py) / dt;
    this.px = this.x;
    this.py = this.y;
    const k = Math.min(1, dt * 30);
    const nax = (vx - this.mvx) / dt;
    const nay = (vy - this.mvy) / dt;
    this.mvx = lerp(this.mvx, vx, k);
    this.mvy = lerp(this.mvy, vy, k);
    this.ax = lerp(this.ax, clamp(nax, -9000, 9000), Math.min(1, dt * 18));
    this.ay = lerp(this.ay, clamp(nay, -9000, 9000), Math.min(1, dt * 18));

    // jelly: underdamped spring pushed by inertia (opposite to the acceleration)
    const KJ = 230;
    const CJ = 11;
    this.jvx += (-KJ * this.jx - CJ * this.jvx - this.ax) * dt;
    this.jvy += (-KJ * this.jy - CJ * this.jvy - this.ay) * dt;
    this.jx = clamp(this.jx + this.jvx * dt, -26, 26);
    this.jy = clamp(this.jy + this.jvy * dt, -26, 26);

    // pendulum: it hangs from an invisible thread, so sideways pushes swing it
    const KT = 54;
    const CT = 6.5;
    this.thv += (-KT * this.th - CT * this.thv - this.ax * 0.011) * dt;
    this.th = clamp(this.th + this.thv * dt, -22, 22);

    // squash pulse
    this.sqv += (-this.sq * 190 - this.sqv * 10) * dt;
    this.sq = clamp(this.sq + this.sqv * dt, -0.26, 0.26);

    // face: rides its own spring and trails the body
    const gx = this.gx * 7;
    const gy = this.gy * 5;
    const KF = 150;
    const CF = 12;
    this.fvx += (KF * (gx - this.fx) - CF * this.fvx - this.ax * 0.0045) * dt;
    this.fvy += (KF * (gy - this.fy) - CF * this.fvy - this.ay * 0.0045) * dt;
    this.fx = clamp(this.fx + this.fvx * dt, -14, 14);
    this.fy = clamp(this.fy + this.fvy * dt, -12, 12);
  }

  // ------------------------------------------------------------- render
  private render(now: number, dt: number) {
    const els = this.els;
    if (!els) return;
    const T = now / 1000;
    const emo = this.currentEmo(now);
    const tgt = EMO[emo];
    if (emo === "resting") this.wasResting = true;
    const e = Math.min(1, dt * 7);
    for (const key of KEYS) {
      if (key === "hue") {
        // the short way round the colour wheel, so happy to worried never passes through green
        const d = ((((tgt.hue - this.P.hue) % 360) + 540) % 360) - 180;
        this.P.hue = (this.P.hue + d * e + 360) % 360;
      } else this.P[key] = lerp(this.P[key], tgt[key], e);
    }
    if (emo !== this.lastEmo) {
      this.lastEmo = emo;
      const kick = KICK[emo];
      if (kick && this.mode !== "intro") {
        this.vy += kick[0];
        this.sqv += kick[1];
      }
    }

    // Gaze: its own glances most of the time; the cursor only when it comes close, or briefly
    // when you start moving again after a pause ("it notices you").
    const mdx = this.mouse.x - this.x;
    const mdy = this.mouse.y - this.y;
    const md = Math.hypot(mdx, mdy) || 1;
    const near = now - this.mouse.at < 2500 ? Math.max(0, 1 - md / 170) : 0;
    let gx: number;
    let gy: number;
    if (tgt.gaze) [gx, gy] = tgt.gaze;
    else if (now < this.noticeUntil || near > 0) {
      const m = Math.min(1, md / 160);
      gx = (mdx / md) * m;
      gy = (mdy / md) * m;
    } else {
      if (now > this.nextGlance) {
        this.glance = Math.random() < 0.5 ? [0, 0] : [rand(-0.7, 0.7), rand(-0.4, 0.4)];
        this.nextGlance = now + rand(1800, 4200);
      }
      [gx, gy] = this.glance;
    }
    this.gx = lerp(this.gx, gx, Math.min(1, dt * 9));
    this.gy = lerp(this.gy, gy, Math.min(1, dt * 9));

    if (now > this.nextBlink) {
      this.blinkAt = now;
      this.nextBlink = now + rand(3000, 7000);
    }
    const bt = (now - this.blinkAt) / 170;
    const blink = bt >= 0 && bt <= 1 ? 1 - 0.88 * Math.sin(Math.PI * bt) : 1;

    // face: slides across the sphere when it spins, plus its own trailing spring
    const P = this.P;
    const cos = Math.cos(this.spin);
    const sin = Math.sin(this.spin);
    els.face.setAttribute("transform", `translate(${sin * 28 + this.fx} ${this.fy}) scale(${Math.max(0.02, Math.abs(cos)) * FACE} ${FACE})`);
    els.face.style.opacity = this.eyesVisible ? String(clamp(cos * 3, 0, 1) * clamp((this.scale - 0.2) / 0.2, 0, 1)) : "0";
    for (const eye of els.eyes) {
      const h = Math.max(1.4, P[eye.key] * blink);
      const w = P.w;
      const cy = 3;
      eye.el.setAttribute("x", String(eye.cx - w / 2));
      eye.el.setAttribute("y", String(cy - h / 2));
      eye.el.setAttribute("width", String(w));
      eye.el.setAttribute("height", String(h));
      eye.el.setAttribute("rx", String(Math.min(w, h) / 2));
      eye.el.style.opacity = String(1 - P.happy);
      eye.arc.setAttribute("d", `M${eye.cx - 4.5},${cy + 1.5} Q${eye.cx},${cy - 5.5} ${eye.cx + 4.5},${cy + 1.5}`);
      eye.arc.style.opacity = String(P.happy);
      eye.shine.setAttribute("cx", String(eye.cx - w * 0.15));
      eye.shine.setAttribute("cy", String(cy - h * 0.26));
      eye.shine.setAttribute("r", h > 6 && P.happy < 0.5 ? "1.3" : "0");
    }
    // mouth: a lens; while the voice plays it opens and shuts on a syllable-like rhythm
    const flap = isTalking() || now < this.talkUntil ? 0.35 + 0.65 * Math.abs(Math.sin(T * 13) * Math.sin(T * 7.3 + 1)) : 0;
    this.mouthOpen = lerp(this.mouthOpen, flap, Math.min(1, dt * 25));
    const mo = P.mo + this.mouthOpen * 5.5 + this.level * 2.5;
    const mc = P.mc * (1 - this.mouthOpen * 0.5);
    const mw = P.mw + this.mouthOpen * 1.2;
    const my = 14;
    els.mouth.setAttribute("d", `M${-mw},${my} Q0,${my + mc - mo} ${mw},${my} Q0,${my + mc + mo} ${-mw},${my}Z`);
    for (const b of els.blush) b.style.opacity = String(P.blush);

    if (this.mode !== "intro") els.root.style.opacity = "1";
    els.root.style.setProperty("--h", P.hue.toFixed(1));
    els.root.style.setProperty("--s", P.sat.toFixed(1));
    if (!this.listening) this.level *= Math.exp(-dt * 5);

    // hover: two slow, unrelated waves read as breathing rather than a metronome
    this.bob = this.mode === "intro" ? 0 : (Math.sin(T * 1.6) * 3.6 + Math.sin(T * 0.71 + 1.3) * 1.6) * P.bob + P.drop;
    const sway = emo === "thinking" ? Math.sin(T * 1.8) * 5 : 0;
    const lean = this.th + P.tilt + sway + clamp((mdx / md) * near * 12, -12, 12);
    els.root.style.transform = `translate3d(${this.x - BASE / 2}px,${this.y - BASE / 2 + this.bob}px,0) scale(${this.scale}) rotate(${lean}deg)`;

    // deformation: jelly lag plus stretch along the travel direction, volume preserved
    const dx = this.jx * 0.9 + this.mvx * 0.004;
    const dy = this.jy * 0.9 + this.mvy * 0.004;
    const amt = clamp(Math.hypot(dx, dy) / BASE, 0, 0.3);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI - lean;
    const s1 = 1 + amt;
    const s2 = 1 / s1;
    els.jelly.style.transform =
      `rotate(${ang}deg) scale(${s1},${s2}) rotate(${-ang}deg) ` + `scale(${this.sqx * (1 + this.sq)},${this.sqy * (1 - this.sq)})`;

    // a faint halo that answers the voice and listening, not a glow around everything
    els.halo.style.transform = `scale(${P.halo + this.level * 0.5 + (emo === "listening" ? Math.sin(T * 5) * 0.04 : 0)})`;
    els.halo.style.opacity = String(0.55 + this.level * 0.45);

    // contact shadow: tighter and darker as it sinks, wider and lighter as it rises
    const lift = clamp((this.bob + 8) / 16, 0, 1);
    els.shadow.style.transform = `translate3d(${this.x - BASE / 2}px,${this.y + BASE * 0.62 * this.scale}px,0) scale(${this.scale * (1.05 - lift * 0.25)},${this.scale})`;
    els.shadow.style.opacity = this.mode === "intro" || this.mode === "off" ? "0" : String(0.5 - lift * 0.2);
  }

  frame(now: number, dt: number) {
    if (this.mode === "intro" && this.intro) this.introStep(now);
    else if (this.mode !== "off" && this.mode !== "puppet") this.flight(now, dt);
    if (this.mode === "puppet") this.spin += (this.spinTarget - this.spin) * Math.min(1, dt * 4.5);
    if (this.mode !== "off") {
      this.soft(dt);
      this.render(now, dt);
    } else {
      this.px = this.x;
      this.py = this.y;
    }
    this.listeners.forEach((fn) => fn(this));
  }

  /** Microphone loudness drives the light while listening. Resolves false if denied. */
  async listen(ms: number) {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return false;
    }
    const ac = audioContext();
    if (!ac) return false;
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const end = performance.now() + ms;
    this.emo = "listening";
    this.listening = true;
    while (performance.now() < end) {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) {
        const d = (v - 128) / 128;
        sum += d * d;
      }
      this.level = lerp(this.level, Math.min(1, Math.sqrt(sum / buf.length) * 5), 0.35);
      await new Promise((r) => setTimeout(r, 30));
    }
    stream.getTracks().forEach((t) => t.stop());
    src.disconnect();
    this.level = 0;
    this.listening = false;
    return true;
  }
}

/** Intro timeline in ms, shared with the mountain scene. */
export const INTRO_TL = { ridge: 200, yak: 900, route: 1500, flag: 2600, rise: 2900, fly: 4300, fade: 4500, land: 5600, end: 6400 };

export const orb = new OrbEngine();
