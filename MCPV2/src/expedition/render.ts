// The mountain, painted on a canvas. Every frame is drawn whole, in one pass, back to front:
// no SVG layers for the browser to repaint piece by piece, which is what made the screen
// flicker. The same function paints the summit again on a second canvas in front of Cordi
// while it rises, so it can come out from behind the peak.
import { YAK, YAK_BODY, YAK_HORN } from "@/intro/yak";
import { clamp } from "@/lib/store";
import { LAYERS, ROUTE, SHADOW, SNOW, STRATA, SUMMIT, WH, WW } from "./world";

export const COLOR = { good: "#8ee3bf", warn: "#f4c873", bad: "#f59aaa", goal: "#ffb98a", lichen: "#9aa6f0", ink: "#eef0ff", sky: "#0b1033", dawn: "#ffb98a" };

export type CampDraw = { x: number; y: number; kind: "base" | "topic" | "summit"; color: string; bright: boolean; current: boolean; pop: number };

export type Frame = {
  W: number;
  H: number;
  dpr: number;
  cam: { x: number; y: number; z: number };
  now: number;
  /** ms since the opening started; -1 before it, Infinity once it is done */
  intro: number;
  /** how much of the route has drawn itself, 0..1 */
  route: number;
  /** how far the warm line has walked, 0..1 */
  walked: number;
  spark: number | null;
  camps: CampDraw[];
  yakAt: [number, number];
};

type Paths = Record<"far" | "mid" | "main" | "shadow" | "snow" | "yakBody" | "yakHorn", Path2D> & { strata: Path2D[] };
let P: Paths | null = null;
const paths = () =>
  (P ??= {
    far: new Path2D(LAYERS.far),
    mid: new Path2D(LAYERS.mid),
    main: new Path2D(LAYERS.main),
    shadow: new Path2D(SHADOW),
    snow: new Path2D(SNOW),
    strata: STRATA.map((d) => new Path2D(d)),
    yakBody: new Path2D(YAK_BODY),
    yakHorn: new Path2D(YAK_HORN),
  });

type Grads = { far: CanvasGradient; lit: CanvasGradient; dawn: CanvasGradient; mist: CanvasGradient; spark: CanvasGradient };
const grads = new WeakMap<CanvasRenderingContext2D, Grads>();
function gradsFor(g: CanvasRenderingContext2D): Grads {
  let r = grads.get(g);
  if (r) return r;
  const far = g.createLinearGradient(0, 500, 0, 1150);
  far.addColorStop(0, "#1a2160");
  far.addColorStop(1, "#0e1338");
  const lit = g.createLinearGradient(0, SUMMIT.y, 0, 1420);
  lit.addColorStop(0, "#2d3784");
  lit.addColorStop(1, "#1a2059");
  const dawn = g.createRadialGradient(SUMMIT.x, SUMMIT.y + 40, 0, SUMMIT.x, SUMMIT.y + 40, 820);
  dawn.addColorStop(0, "rgba(201,184,255,.55)");
  dawn.addColorStop(0.35, "rgba(154,166,240,.16)");
  dawn.addColorStop(1, "rgba(154,166,240,0)");
  const mist = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  mist.addColorStop(0, "rgba(200,208,255,.09)");
  mist.addColorStop(1, "rgba(200,208,255,0)");
  const spark = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  spark.addColorStop(0, "rgba(255,185,138,.55)");
  spark.addColorStop(1, "rgba(255,185,138,0)");
  r = { far, lit, dawn, mist, spark };
  grads.set(g, r);
  return r;
}

const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
/** Build-in progress of one element of the opening. */
const built = (intro: number, delay: number, dur: number) => (intro < 0 ? 0 : easeOut((intro - delay) / dur));

/** Puts the context in a layer's world coordinates; p < 1 moves less with the camera. */
function layer(g: CanvasRenderingContext2D, f: Frame, p: number) {
  const { W, H, dpr, cam } = f;
  const zP = cam.z * (0.78 + 0.22 * p);
  const cx = WW / 2 + (cam.x - WW / 2) * p;
  const cy = WH / 2 + (cam.y - WH / 2) * p - (1 - p) * 120;
  g.setTransform(dpr * zP, 0, 0, dpr * zP, dpr * (W / 2 - cx * zP), dpr * (H / 2 - cy * zP));
}

function mist(g: CanvasRenderingContext2D, gr: Grads, cx: number, cy: number, rx: number, ry: number) {
  g.save();
  g.translate(cx, cy);
  g.scale(rx, ry);
  g.fillStyle = gr.mist;
  g.beginPath();
  g.arc(0, 0, 1, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Strokes the route from u0 to u1 (fractions of its length). */
function routeBetween(g: CanvasRenderingContext2D, u0: number, u1: number) {
  if (u1 <= u0) return;
  const raw = ROUTE.raw;
  const a = ROUTE.at(u0);
  const b = ROUTE.at(u1);
  g.beginPath();
  g.moveTo(a[0], a[1]);
  for (let i = ROUTE.index(u0) + 1; i <= ROUTE.index(u1); i++) g.lineTo(raw[i][0], raw[i][1]);
  g.lineTo(b[0], b[1]);
  g.stroke();
}

function mountain(g: CanvasRenderingContext2D, gr: Grads, withStrata: boolean) {
  const p = paths();
  g.fillStyle = gr.lit;
  g.fill(p.main);
  g.save();
  g.clip(p.main);
  if (withStrata) {
    g.strokeStyle = "rgba(154,166,240,.07)";
    g.lineWidth = 2;
    for (const s of p.strata) g.stroke(s);
  }
  g.globalAlpha = 0.78;
  g.fillStyle = "#121848";
  g.fill(p.shadow);
  g.globalAlpha = 0.88;
  g.fillStyle = "#aeb8ee";
  g.fill(p.snow);
  g.globalAlpha = 0.42;
  g.clip(p.shadow);
  g.fillStyle = "#0b1033";
  g.fill(p.snow);
  g.restore();
}

function camp(g: CanvasRenderingContext2D, c: CampDraw, now: number) {
  if (c.pop <= 0) return;
  // pop: 0 → 1.4 → 1
  const k = c.pop;
  const s = k < 0.55 ? (k / 0.55) * 1.4 : 1.4 - ((k - 0.55) / 0.45) * 0.4;
  g.save();
  g.translate(c.x, c.y);
  if (c.current) {
    const ph = (now % 2000) / 2000;
    g.strokeStyle = COLOR.dawn;
    g.globalAlpha = 0.9 * (1 - ph);
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 14 * (0.6 + 2.8 * ph), 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }
  g.scale(s, s);
  g.globalAlpha = Math.min(1, k * 2);
  g.lineCap = "round";
  if (c.kind === "base") {
    g.fillStyle = COLOR.ink;
    g.beginPath();
    g.moveTo(-22, 0);
    g.lineTo(0, -30);
    g.lineTo(22, 0);
    g.closePath();
    g.fill();
    g.fillStyle = COLOR.sky;
    g.beginPath();
    g.moveTo(-4, 0);
    g.lineTo(0, -12);
    g.lineTo(4, 0);
    g.closePath();
    g.fill();
  } else {
    const big = c.kind === "summit";
    const h = big ? 62 : 38;
    g.strokeStyle = COLOR.ink;
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -h);
    g.stroke();
    g.fillStyle = c.color;
    g.globalAlpha *= c.bright ? 1 : 0.65;
    g.beginPath();
    g.moveTo(0, -h);
    g.lineTo(big ? 38 : 22, -h + (big ? 10 : 6));
    g.lineTo(0, -h + (big ? 22 : 13));
    g.closePath();
    g.fill();
    g.globalAlpha = Math.min(1, k * 2);
    if (!big) {
      g.beginPath();
      g.arc(0, 0, 4.5, 0, Math.PI * 2);
      g.fillStyle = c.bright ? COLOR.dawn : COLOR.sky;
      g.fill();
      g.strokeStyle = c.bright ? COLOR.dawn : COLOR.ink;
      g.lineWidth = 2;
      g.stroke();
    }
  }
  g.restore();
}

export function drawWorld(g: CanvasRenderingContext2D, f: Frame) {
  const { W, H, dpr, intro } = f;
  const gr = gradsFor(g);
  const p = paths();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W * dpr, H * dpr);
  if (intro < 0) return;

  // ranges, back to front, each rising into place during the opening
  const kFar = built(intro, 150, 1500);
  if (kFar > 0) {
    layer(g, f, 0.3);
    g.globalAlpha = kFar;
    g.translate(0, 220 * (1 - kFar));
    g.fillStyle = gr.far;
    g.fill(p.far);
  }
  const kMid = built(intro, 450, 1500);
  if (kMid > 0) {
    layer(g, f, 0.58);
    g.globalAlpha = kMid;
    g.translate(0, 260 * (1 - kMid));
    g.fillStyle = "#141a4c";
    g.fill(p.mid);
    g.globalAlpha = built(intro, 1100, 1800);
    mist(g, gr, 700, 1080, 760, 90);
  }

  layer(g, f, 1);
  const kDawn = built(intro, 4200, 2200);
  if (kDawn > 0) {
    g.globalAlpha = kDawn;
    g.fillStyle = gr.dawn;
    g.beginPath();
    g.arc(SUMMIT.x, SUMMIT.y + 40, 820, 0, Math.PI * 2);
    g.fill();
  }
  const kMain = built(intro, 750, 1500);
  if (kMain > 0) {
    g.save();
    g.globalAlpha = kMain;
    g.translate(0, 320 * (1 - kMain));
    mountain(g, gr, true);
    mist(g, gr, 1900, 1260, 680, 80);
    g.restore();
  }
  g.globalAlpha = 1;

  // the route: the faint dotted trail as far as it has drawn, the warm line as far as walked
  if (f.route > 0) {
    g.setLineDash([0.1, 12]);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "rgba(238,240,255,.42)";
    g.lineWidth = 3;
    routeBetween(g, 0, f.route);
    g.setLineDash([]);
  }
  if (f.walked > 0.002) {
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = COLOR.dawn;
    g.globalAlpha = 0.14;
    g.lineWidth = 16;
    routeBetween(g, 0, f.walked);
    g.globalAlpha = 1;
    g.lineWidth = 4.5;
    routeBetween(g, 0, f.walked);
  }

  // the yak, watching from base camp
  const kYak = built(intro, 1700, 1500);
  if (kYak > 0) {
    g.save();
    g.globalAlpha = kYak * 0.92;
    g.translate(f.yakAt[0], f.yakAt[1] + 40 * (1 - kYak));
    g.scale(-0.24, 0.24);
    g.translate(-YAK.footX, -YAK.footY);
    g.fillStyle = "#dfe3ff";
    g.fill(p.yakBody);
    g.fillStyle = COLOR.sky;
    g.fill(p.yakHorn);
    g.restore();
  }

  // the light that runs at the tip of the route while it draws
  if (f.spark !== null) {
    const [x, y] = ROUTE.at(f.spark);
    g.save();
    g.translate(x, y);
    g.fillStyle = gr.spark;
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff4ea";
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  for (const c of f.camps) camp(g, c, f.now);
  g.globalAlpha = 1;
}

/** The peak again, in front of Cordi, only around the summit: it rises from behind it. */
export function drawOccluder(g: CanvasRenderingContext2D, f: Frame, on: boolean) {
  const { W, H, dpr } = f;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W * dpr, H * dpr);
  if (!on) return;
  const gr = gradsFor(g);
  layer(g, f, 1);
  g.save();
  g.beginPath();
  g.rect(SUMMIT.x - 200, SUMMIT.y - 12, 400, 190);
  g.clip();
  mountain(g, gr, false);
  g.setLineDash([0.1, 12]);
  g.lineCap = "round";
  g.strokeStyle = "rgba(238,240,255,.42)";
  g.lineWidth = 3;
  routeBetween(g, 0, 1);
  g.setLineDash([]);
  g.restore();
}
