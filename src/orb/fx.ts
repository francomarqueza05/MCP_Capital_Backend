// The effects layer behind everything: a few faint stars, soft particles and landing rings.
// Kept deliberately quiet; it is atmosphere, not decoration.
import { easeOut, rand } from "@/lib/store";

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };
type Ring = { x: number; y: number; r0: number; r1: number; life: number; max: number };

const parts: Particle[] = [];
const rings: Ring[] = [];
let stars: { x: number; y: number; s: number; p: number }[] = [];
let cv: HTMLCanvasElement | null = null;
let g: CanvasRenderingContext2D | null = null;
let W = 0;
let H = 0;

export function attachFx(canvas: HTMLCanvasElement) {
  cv = canvas;
  g = canvas.getContext("2d");
  stars = Array.from({ length: 52 }, () => ({ x: Math.random(), y: Math.random() * 0.8, s: rand(0.5, 1.4), p: rand(0, 6.28) }));
  resizeFx();
}

export function resizeFx() {
  if (!cv || !g) return;
  W = innerWidth;
  H = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = W * dpr;
  cv.height = H * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function emit(x: number, y: number, n: number, o: { min?: number; max?: number; vy?: number; life?: number; size?: number } = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(o.min ?? 4, o.max ?? 24);
    const life = rand(0.5, o.life ?? 1.2);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (o.vy ?? 0), life, max: life, size: rand(0.6, o.size ?? 1.8) });
  }
}

export function ring(x: number, y: number, r0: number, r1: number, life = 1) {
  rings.push({ x, y, r0, r1, life, max: life });
}

/** Stars fade out while the summary is up: they belong to the night of the intro. */
let starAlpha = 1;
export const setStars = (a: number) => {
  starAlpha = a;
};
let shownStars = 1;

export function drawFx(dt: number, t: number) {
  if (!g) return;
  g.clearRect(0, 0, W, H);
  shownStars += (starAlpha - shownStars) * Math.min(1, dt * 2);
  g.fillStyle = "#d7dcff";
  for (const s of stars) {
    // slow, faint twinkle: atmosphere, not blinking
    g.globalAlpha = (0.12 + 0.12 * Math.sin(t * 0.35 + s.p) ** 2) * shownStars;
    g.fillRect(s.x * W, s.y * H, s.s, s.s);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "lighter";
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    p.vx *= 1 - dt * 0.8;
    p.vy *= 1 - dt * 0.8;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    g.fillStyle = `rgba(214,220,255,${(p.life / p.max) * 0.7})`;
    g.beginPath();
    g.arc(p.x, p.y, p.size, 0, 6.283);
    g.fill();
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    if (r.life <= 0) {
      rings.splice(i, 1);
      continue;
    }
    const k = 1 - r.life / r.max;
    g.strokeStyle = `rgba(190,198,250,${(1 - k) * 0.5})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(r.x, r.y, r.r0 + easeOut(k) * r.r1, 0, 6.283);
    g.stroke();
  }
  g.globalCompositeOperation = "source-over";
}
