// Number formatting shared with the front-end blocks (ported from web/components/blocks/kit.tsx).
export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const short = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`
    : Math.abs(n) >= 1000
      ? `$${Math.round(n / 1000)}K`
      : usd(n);
export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
export function toWhole(values: number[], total: number) {
  const sum = values.reduce((a, b) => a + b, 0);
  const raw = values.map((v) => (v / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw
    .map((r, i) => ({ i, f: r - Math.floor(r) }))
    .sort((a, b) => b.f - a.f)
    .forEach(({ i }) => {
      if (left-- > 0) out[i]++;
    });
  return out;
}
export const cents = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
