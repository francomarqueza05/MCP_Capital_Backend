// The mountain, in world units. Everything the camera looks at is defined here once:
// the silhouettes of each range (procedural, seeded, so they are the same every load),
// the lit and shadowed faces of the main peak, its snow, and the climbing route with its camps.

export const WW = 2400;
export const WH = 1500;
export const SUMMIT = { x: 1500, y: 250 };

// ---------------------------------------------------------------- seeded noise
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
/** Smooth 1D value noise, summed over octaves: craggy but not jittery. */
function fbm(seed: number) {
  const r = rng(seed);
  const table = Array.from({ length: 512 }, () => r() * 2 - 1);
  const v = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[i & 511];
    const b = table[(i + 1) & 511];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
  return (x: number) => v(x) * 0.6 + v(x * 2.3 + 17) * 0.28 + v(x * 5.1 + 41) * 0.12;
}

type Peak = { x: number; y: number; left: number; right: number };

/** A range: the lowest envelope of its peaks' slopes, roughened with noise. */
function range(peaks: Peak[], base: number, seed: number, rough: number, step = 14) {
  const n = fbm(seed);
  const pts: [number, number][] = [];
  for (let x = -1400; x <= WW + 1400; x += step) {
    let y = base;
    for (const p of peaks) {
      const s = x < p.x ? p.left : p.right;
      y = Math.min(y, p.y + Math.abs(x - p.x) * s);
    }
    // crags grow with distance from the valley floor, so peaks are jagged and slopes calmer
    const k = Math.max(0, (base - y) / (base - Math.min(...peaks.map((p) => p.y))));
    y += n(x / 90) * rough * (0.35 + 0.65 * k);
    pts.push([x, y]);
  }
  return pts;
}
const closed = (pts: [number, number][], bottom = WH + 600) =>
  `M${pts[0][0]},${bottom} L${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L")} L${pts.at(-1)![0]},${bottom} Z`;

// ---------------------------------------------------------------- ranges, back to front
const FAR = range(
  [
    { x: 260, y: 640, left: 0.7, right: 0.62 },
    { x: 760, y: 560, left: 0.55, right: 0.7 },
    { x: 2050, y: 520, left: 0.6, right: 0.55 },
    { x: 2420, y: 640, left: 0.7, right: 0.7 },
  ],
  1100,
  7,
  26,
  26,
);
const MID = range(
  [
    { x: 120, y: 820, left: 0.8, right: 0.5 },
    { x: 560, y: 760, left: 0.5, right: 0.72 },
    { x: 2280, y: 700, left: 0.55, right: 0.6 },
  ],
  1260,
  21,
  22,
  22,
);
const MAIN = range(
  [
    { x: SUMMIT.x, y: SUMMIT.y, left: 0.73, right: 1.02 },
    { x: 1830, y: 560, left: 0.9, right: 0.62 },
  ],
  1420,
  3,
  20,
  14,
);
export const LAYERS = {
  far: closed(FAR),
  mid: closed(MID),
  main: closed(MAIN),
};
export const ridgeAt = (pts: [number, number][], x: number) => {
  const i = pts.findIndex((p) => p[0] >= x);
  if (i <= 0) return pts[0][1];
  const a = pts[i - 1];
  const b = pts[i];
  return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
};

// the shadowed face: everything right of a spine that drops from the summit
export const SHADOW = `M${SUMMIT.x},${SUMMIT.y} L${SUMMIT.x + 60},${SUMMIT.y + 230} L${SUMMIT.x + 30},${SUMMIT.y + 420} L${SUMMIT.x + 150},${SUMMIT.y + 700} L${SUMMIT.x + 120},${SUMMIT.y + 950} L${SUMMIT.x + 260},${WH + 600} L${WW + 400},${WH + 600} L${WW + 400},-400 Z`;

// snow: a band hanging from the ridge, with a zigzag lower edge
export const SNOW = (() => {
  const n = fbm(99);
  let d = `M-1400,-400 L${WW + 1400},-400 L`;
  const pts: string[] = [];
  const tooth = fbm(123);
  for (let x = WW + 1400; x >= -1400; x -= 22) {
    // the cap hangs from the ridge: deep at the summit, thinning to nothing down the slopes
    const dx = x - SUMMIT.x;
    const ridge = ridgeAt(MAIN, x);
    const depth = Math.max(0, 210 - Math.abs(dx) * 0.36);
    // couloirs: snow runs further down in some gullies than others
    const gully = Math.max(0, tooth(x / 26)) * 70 * (depth / 210);
    const y = ridge + (depth > 0 ? depth + (n(x / 55) * 26 + gully) * Math.min(1, depth / 60) : -30);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  d += pts.join(" L") + " Z";
  return d;
})();

// strata on the lit face, for texture
export const STRATA = Array.from({ length: 7 }, (_, i) => {
  const y0 = 560 + i * 120;
  const n = fbm(200 + i);
  const pts: string[] = [];
  for (let x = 200; x <= SUMMIT.x + 300; x += 30) pts.push(`${x},${(y0 + n(x / 120) * 26 + (x - 200) * 0.06).toFixed(1)}`);
  return `M${pts.join(" L")}`;
});

// ---------------------------------------------------------------- the route
// Switchbacks up the lit face. Control points are smoothed with a Catmull-Rom spline and
// resampled by arc length, so "u" is distance walked: Cordi moves at an even pace.
const CTRL: [number, number][] = [
  [470, 1330],
  [860, 1258],
  [660, 1160],
  [1060, 1076],
  [850, 982],
  [1210, 902],
  [1010, 806],
  [1320, 724],
  [1150, 632],
  [1400, 548],
  [1300, 452],
  [1440, 360],
  [SUMMIT.x, SUMMIT.y + 6],
];

function catmull(pts: [number, number][], seg = 28) {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts.at(-1)!);
  return out;
}

export const ROUTE = (() => {
  const raw = catmull(CTRL);
  const len = [0];
  for (let i = 1; i < raw.length; i++) len.push(len[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const total = len.at(-1)!;
  /** Point at a fraction u (0..1) of the distance along the route. */
  const at = (u: number): [number, number] => {
    const d = Math.max(0, Math.min(1, u)) * total;
    let lo = 0;
    let hi = len.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (len[m] < d) lo = m;
      else hi = m;
    }
    const k = (d - len[lo]) / (len[hi] - len[lo] || 1);
    return [raw[lo][0] + (raw[hi][0] - raw[lo][0]) * k, raw[lo][1] + (raw[hi][1] - raw[lo][1]) * k];
  };
  const d = "M" + raw.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L");
  /** Index of the last sample at or before distance fraction u. */
  const index = (u: number) => {
    const dd = Math.max(0, Math.min(1, u)) * total;
    let lo = 0;
    let hi = len.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (len[m] <= dd) lo = m;
      else hi = m;
    }
    return lo;
  };
  return { d, at, total, raw, index };
})();

/** Where each camp sits on the route: base at the foot, summit at the top, evenly between. */
export const campU = (i: number, n: number) => (n <= 1 ? 0 : i / (n - 1));
