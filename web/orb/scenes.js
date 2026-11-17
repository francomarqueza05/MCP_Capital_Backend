// Big per-topic animations, shown inside a summary card when it is opened.
// One scene per label of docs/matriz-escenas.md, every number from the case
// (web/orb/data/cases.js). Each scene follows the same shape so it reads at a glance:
// a sentence saying what is going on, a plain labelled chart that builds itself up,
// and, where Sherpas gives a fix, a slider to try it. A scene returns a cleanup function.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const C = { good: '#6fd8a8', warn: '#f5c76b', bad: '#f2879a', lav: '#a9b4f5', white: '#fff', navy: '#0b1030', card: '#141a45', dim: 'rgba(255,255,255,.1)', soft: 'rgba(169,180,245,.18)' };
  const W = 400, H = 230;
  const money = (n) => `$${Math.round(Math.abs(n)).toLocaleString('es-ES')}`;
  const short = (n) => Math.abs(n) >= 1e6 ? `$${(Math.abs(n) / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 2 })}M` : Math.abs(n) >= 1e4 ? `$${Math.round(Math.abs(n) / 1e3).toLocaleString('es-ES')}k` : money(n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  // progress of a build step: starts at `delay` seconds, lasts `dur`
  const step = (sec, delay, dur = .8) => ease((sec - delay) / dur);
  const tone = (s) => (s === 'good' ? C.good : s === 'warn' ? C.warn : C.bad);

  // ------------------------------------------------------------- toolkit
  // bare: the host already shows the title, so crop off each scene's own two-line heading
  let BARE = false;
  function svg(box) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', BARE ? `0 50 ${W} ${H - 50}` : `0 0 ${W} ${H}`); s.classList.add('scene-svg');
    box.append(s);
    const defs = el(s, 'defs');
    for (const [k, c] of Object.entries({ good: C.good, warn: C.warn, bad: C.bad, lav: C.lav })) {
      const g = el(defs, 'linearGradient', { id: `g-${k}`, x1: 0, y1: 0, x2: 1, y2: 0 });
      el(g, 'stop', { offset: 0, 'stop-color': c, 'stop-opacity': .75 }); el(g, 'stop', { offset: 1, 'stop-color': c });
      const v = el(defs, 'linearGradient', { id: `v-${k}`, x1: 0, y1: 1, x2: 0, y2: 0 });
      el(v, 'stop', { offset: 0, 'stop-color': c, 'stop-opacity': .7 }); el(v, 'stop', { offset: 1, 'stop-color': c });
    }
    const glow = el(defs, 'filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
    el(glow, 'feGaussianBlur', { stdDeviation: 3, result: 'b' });
    const m = el(glow, 'feMerge'); el(m, 'feMergeNode', { in: 'b' }); el(m, 'feMergeNode', { in: 'SourceGraphic' });
    const hatch = el(defs, 'pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    el(hatch, 'rect', { width: 6, height: 6, fill: 'rgba(242,135,154,.12)' }); el(hatch, 'line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: C.bad, 'stroke-width': 2, opacity: .55 });
    return s;
  }
  function el(parent, tag, attrs = {}, text) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    parent.append(e); return e;
  }
  const txt = (p, x, y, s, a = {}) => el(p, 'text', { x, y, fill: C.white, 'font-size': 12, 'font-family': 'Poppins', 'font-weight': 500, ...a }, s);
  // the two lines every scene opens with
  function head(s, title, sub, colour = C.white) {
    txt(s, 0, 20, title, { 'font-size': 17, 'font-weight': 700, fill: colour });
    if (sub) txt(s, 0, 40, sub, { 'font-size': 11.5, fill: C.lav });
  }
  function chip(s, x, y, text, colour, anchor = 'middle') {
    const g = el(s, 'g');
    const t = txt(g, x, y + 4, text, { 'text-anchor': anchor, 'font-size': 12, 'font-weight': 700, fill: C.navy });
    const w = text.length * 7 + 16, x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w + 8 : x - 8;
    g.insertBefore(el(g, 'rect', { x: x0, y: y - 11, width: w, height: 22, rx: 11, fill: colour }), t);
    return g;
  }
  function loop(fn) {
    // test hook: window.SCENE_FREEZE = seconds draws that one moment, settled, with no animation
    if (window.SCENE_FREEZE != null) { for (let i = 0; i < 120; i++) fn(window.SCENE_FREEZE); return () => {}; }
    let on = true; const t0 = performance.now();
    const f = (now) => { if (!on) return; fn((now - t0) / 1000); requestAnimationFrame(f); };
    requestAnimationFrame(f); return () => { on = false; };
  }
  function slider(box, { label, min, max, step: st = 1, value, fmt }, onInput) {
    const w = document.createElement('label'); w.className = 'scene-slider';
    w.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${st}" value="${value}"><b></b>`;
    const i = w.querySelector('input'), b = w.querySelector('b');
    const u = () => { b.textContent = fmt(+i.value); onInput(+i.value); };
    i.addEventListener('input', u); box.append(w); u(); return i;
  }
  function note(box, html) { const n = document.createElement('p'); n.className = 'scene-note'; n.innerHTML = html; box.append(n); }
  // smooth follower for slider-driven values
  const follow = (cur, target, k = .14) => cur + (target - cur) * k;

  const scenes = {};

  // ------------------------------------------------------------- cash flow
  // Two bars: what comes in a year vs what goes out. The difference is the point.
  scenes.cashflow = (box, t) => {
    const n = t.numbers, s = svg(box), income = n.income, out0 = income - n.flow;
    head(s, n.flow < 0 ? 'Cada año sale más de lo que entra' : 'Cada año te sobra dinero', 'Ingresos frente a lo que sale: gastos, impuestos y ahorro', n.flow < 0 ? C.bad : C.white);
    const x0 = 70, full = 240, max = Math.max(income, out0) * 1.04, wOf = (v) => full * v / max;
    txt(s, 0, 88, 'Entra', { fill: C.lav, 'font-size': 13 }); txt(s, 0, 146, 'Sale', { fill: C.lav, 'font-size': 13 });
    const inBar = el(s, 'rect', { x: x0, y: 70, height: 28, rx: 8, fill: 'url(#g-lav)' });
    const outBar = el(s, 'rect', { x: x0, y: 128, height: 28, rx: 8 });
    const inVal = txt(s, 0, 89, '', { 'font-weight': 600 }), outVal = txt(s, 0, 147, '', { 'font-weight': 600 });
    const gapLine = el(s, 'line', { y1: 64, y2: 162, stroke: C.white, 'stroke-dasharray': '3 4', opacity: .6 });
    let chipG = null, out = out0, shown = out0;
    if (n.flow < 0) slider(box, { label: 'Recortar gastos al mes', min: 0, max: Math.ceil(-n.flow / 12 / 50) * 50 + 150, step: 25, value: 0, fmt: (v) => `${money(v)}/mes` }, (v) => { out = out0 - v * 12; });
    else note(box, 'Ese margen es el que tiene que repartirse entre tus metas: jubilación, universidad, deudas y reserva.');
    return loop((sec) => {
      shown = follow(shown, out);
      const a = step(sec, .1), b = step(sec, .5);
      inBar.setAttribute('width', wOf(income) * a); outBar.setAttribute('width', wOf(shown) * b);
      const diff = income - shown, ok = diff >= 0;
      outBar.setAttribute('fill', ok ? 'url(#g-good)' : 'url(#g-bad)');
      inVal.setAttribute('x', x0 + wOf(income) * a + 8); inVal.textContent = a > .05 ? `${short(income * a)}/año` : '';
      outVal.setAttribute('x', x0 + wOf(shown) * b + 8); outVal.textContent = b > .05 ? `${short(shown * b)}/año` : '';
      const gx = x0 + wOf(Math.min(income, shown));
      gapLine.setAttribute('x1', gx); gapLine.setAttribute('x2', gx); gapLine.setAttribute('opacity', step(sec, 1.2) * .6);
      chipG?.remove();
      if (sec > 1.3) chipG = chip(s, W / 2, 205, ok ? `+${money(diff)} al año · ${money(diff / 12)}/mes` : `−${money(diff)} al año · −${money(diff / 12)}/mes`, ok ? C.good : C.bad);
    });
  };

  // ------------------------------------------------------------- emergency fund
  // One block per month of expenses you could cover without income; the ideal range is marked.
  function monthBlocks(s, total, y) {
    const per = Math.min(total, 12), size = 22, gap = 6, rows = Math.ceil(total / 12);
    const x0 = (W - (per * size + (per - 1) * gap)) / 2;
    return Array.from({ length: total }, (_, i) => {
      const x = x0 + (i % 12) * (size + gap), yy = y + Math.floor(i / 12) * (size + gap);
      el(s, 'rect', { x, y: yy, width: size, height: size, rx: 5, fill: C.dim });
      const f = el(s, 'rect', { x, y: yy, width: 0, height: size, rx: 5 });
      return { x, y: yy, size, f, rows };
    });
  }
  scenes.emergency = (box, t) => {
    const n = t.numbers, s = svg(box), colour = tone(t.status);
    head(s, `Si dejas de cobrar, aguantas ${n.months.toLocaleString('es-ES')} meses`, `Lo recomendado para tu hogar: ${n.min}–${n.max} meses de gastos`, colour);
    const total = clamp(Math.max(Math.ceil(n.months), n.max) + 1, 6, 24), blocks = monthBlocks(s, total, 92);
    // bracket over the ideal range
    const a = blocks[n.min - 1], b = blocks[n.max - 1];
    if (a && b && a.y === b.y) {
      el(s, 'path', { d: `M${a.x},${a.y - 8} L${a.x},${a.y - 14} L${b.x + b.size},${b.y - 14} L${b.x + b.size},${b.y - 8}`, fill: 'none', stroke: C.lav });
      txt(s, (a.x + b.x + b.size) / 2, a.y - 19, 'ideal', { 'text-anchor': 'middle', fill: C.lav, 'font-size': 10.5 });
    }
    const last = blocks.at(-1), legendY = last.y + 48;
    const over = n.months - n.max;
    return loop((sec) => {
      const filled = n.months * step(sec, .2, 1.6);
      blocks.forEach((bk, i) => {
        const part = clamp(filled - i, 0, 1);
        bk.f.setAttribute('width', bk.size * part);
        bk.f.setAttribute('fill', i >= n.max ? C.warn : i < n.min && n.months < n.min ? C.bad : C.good);
      });
      if (sec > 2 && !s.querySelector('.legend')) {
        const g = chip(s, W / 2, legendY, n.months < n.min ? `Te faltan ${(n.min - n.months).toLocaleString('es-ES', { maximumFractionDigits: 1 })} meses para lo mínimo` : over > 0 ? `${Math.round(over)} meses de más, parados sin rendir` : 'Justo en el rango ideal', colour);
        g.classList.add('legend');
      }
    });
  };

  // ------------------------------------------------------------- big goal draining the cushion
  scenes['near-goal'] = (box, t) => {
    const n = t.numbers, s = svg(box);
    head(s, `${n.goal || 'Un gasto grande'}${n.when ? ` en ${n.when}` : ''} vacía tu colchón`, `Colchón hoy: ${n.months.toLocaleString('es-ES')} meses · después del pago: ${n.after.toLocaleString('es-ES')}`, C.bad);
    const total = Math.max(Math.ceil(n.months), 6), blocks = monthBlocks(s, total, 92);
    const tag = el(s, 'g'); chip(tag, 0, 0, `${n.goal || 'Gasto'} · −${money(n.amount || 0)}`, C.bad);
    return loop((sec) => {
      const k = sec % 7, fill = n.months * step(k, .1, 1), drain = step(k, 2.6, 1.2), now = lerp(fill, n.after, drain);
      blocks.forEach((bk, i) => { bk.f.setAttribute('width', bk.size * clamp(now - i, 0, 1)); bk.f.setAttribute('fill', drain > .5 ? C.bad : C.good); });
      tag.setAttribute('transform', `translate(${lerp(W + 120, W / 2, step(k, 1.6, .9))} 170)`);
      tag.setAttribute('opacity', k > 6.4 ? 0 : 1);
    });
  };

  // ------------------------------------------------------------- credit card
  // Balance over time: at today's payment the line barely goes down; the slider shows a real exit.
  scenes.debt = (box, t) => {
    const n = t.numbers;
    if (!n.balance) return scenes.dti(box, t);
    const s = svg(box), r = n.interest / n.balance;
    head(s, `Pagas ${money(n.monthly)} al mes y la deuda casi no baja`, `${Math.round(n.interest / n.monthly * 100)}% de cada pago son intereses (${(r * 1200).toFixed(1)}% anual)`, C.bad);
    const X = 46, Y = 62, PW = 330, PH = 120, years = 10;
    el(s, 'line', { x1: X, y1: Y + PH, x2: X + PW, y2: Y + PH, stroke: C.dim });
    for (let yr = 0; yr <= years; yr += 2) txt(s, X + PW * yr / years, Y + PH + 16, `${yr}a`, { 'text-anchor': 'middle', fill: C.lav, 'font-size': 10 });
    txt(s, X - 6, Y + 4, short(n.balance), { 'text-anchor': 'end', fill: C.lav, 'font-size': 10 });
    txt(s, X - 6, Y + PH, '$0', { 'text-anchor': 'end', fill: C.lav, 'font-size': 10 });
    const path = (pay) => {
      let b = n.balance, pts = [];
      for (let m = 0; m <= years * 12; m++) { pts.push([X + PW * m / (years * 12), Y + PH * (1 - b / n.balance)]); b = Math.max(0, b * (1 + r) - pay); }
      return pts;
    };
    const now = el(s, 'polyline', { fill: 'none', stroke: C.bad, 'stroke-width': 3, 'stroke-linecap': 'round' });
    const better = el(s, 'polyline', { fill: 'none', stroke: C.good, 'stroke-width': 3, 'stroke-linecap': 'round', filter: 'url(#glow)' });
    const nowLbl = txt(s, X + PW, Y + 2, 'con tu pago actual', { 'text-anchor': 'end', fill: C.bad, 'font-size': 10.5 });
    const out = el(s, 'g');
    let pay = n.monthly, shown = n.monthly;
    const months = (p) => (p > n.interest ? Math.log(p / (p - r * n.balance)) / Math.log(1 + r) : Infinity);
    slider(box, { label: 'Pagar al mes', min: Math.round(n.monthly), max: Math.round(n.monthly * 4 / 50) * 50, step: 25, value: Math.round(n.monthly), fmt: (v) => money(v) }, (v) => { pay = v; });
    return loop((sec) => {
      shown = follow(shown, pay);
      const k = step(sec, .2, 1.4), cut = (pts) => pts.slice(0, Math.max(2, Math.round(pts.length * k))).map((p) => p.join(',')).join(' ');
      now.setAttribute('points', cut(path(n.monthly)));
      better.setAttribute('points', shown > n.monthly + 5 ? cut(path(shown)) : '');
      nowLbl.setAttribute('opacity', k);
      out.innerHTML = '';
      const m = months(shown);
      if (sec > 1.5) chip(out, W / 2, 218, isFinite(m) ? `Libre de deuda en ${m > 24 ? `${(m / 12).toLocaleString('es-ES', { maximumFractionDigits: 1 })} años` : `${Math.ceil(m)} meses`}` : 'Así no terminarías nunca', isFinite(m) && m < 48 ? C.good : C.bad);
    });
  };
  // debt-to-income: how much of the monthly salary goes to debt payments
  scenes.dti = (box, t) => {
    const s = svg(box), share = t.numbers.dti, colour = tone(t.status);
    head(s, `${Math.round(share * 100)}% de tu sueldo se va en deudas`, 'Pagos de deudas frente a tu sueldo bruto mensual', colour);
    el(s, 'rect', { x: 0, y: 90, width: W, height: 40, rx: 10, fill: C.dim });
    const bar = el(s, 'rect', { x: 0, y: 90, height: 40, rx: 10, fill: `url(#g-${t.status === 'good' ? 'good' : 'warn'})` });
    txt(s, 0, 156, 'Pagos de deudas', { fill: colour, 'font-size': 11 }); txt(s, W, 156, 'Tu sueldo', { 'text-anchor': 'end', fill: C.lav, 'font-size': 11 });
    return loop((sec) => bar.setAttribute('width', W * share * step(sec, .2, 1.2)));
  };

  // ------------------------------------------------------------- retirement
  scenes.retirement = (box, t) => {
    const n = t.numbers;
    if (n.runOut !== 'Not applicable') return runOut(box, t);
    if (n.gap > 0) return gap(box, t);
    if (n.draw > 6) return drawGauge(box, t);
    return scenes.praise(box, t);
  };
  // gap: what you'll need vs what you'll have, as two columns
  function gap(box, t) {
    const n = t.numbers, s = svg(box), need = n.projected + n.gap;
    head(s, `Para jubilarte a los ${n.retireAge} te faltan ${short(n.gap)}`, 'Lo que necesitarás frente a lo que tendrás (en dinero de hoy)', C.bad);
    const base = 200, top = 66, hOf = (v) => (base - top) * v / need, cols = [[90, 'Necesitas'], [250, 'Tendrás']];
    cols.forEach(([x, l]) => txt(s, x + 40, base + 18, l, { 'text-anchor': 'middle', fill: C.lav, 'font-size': 12 }));
    const needBar = el(s, 'rect', { x: 90, width: 80, rx: 8, fill: C.soft, stroke: C.lav, 'stroke-dasharray': '4 4' });
    const haveBar = el(s, 'rect', { x: 250, width: 80, rx: 8 });
    const gapBox = el(s, 'rect', { x: 250, width: 80, rx: 8, fill: 'url(#hatch)' });
    const needLbl = txt(s, 130, 0, short(need), { 'text-anchor': 'middle', 'font-weight': 700 });
    const haveLbl = txt(s, 290, 0, '', { 'text-anchor': 'middle', 'font-weight': 700 });
    const gapLbl = txt(s, 342, 0, '', { fill: C.bad, 'font-size': 11, 'font-weight': 600 });
    let have = n.projected, shown = n.projected;
    slider(box, { label: 'Ahorro extra al año', min: 0, max: Math.ceil(n.extraSave * 1.2 / 1000) * 1000, step: 500, value: 0, fmt: (v) => money(v) }, (v) => { have = n.projected + n.gap * Math.min(1, v / n.extraSave); });
    note(box, `Sherpas calcula que con ${money(n.extraSave)} más al año llegarías. El gráfico lo estima de forma aproximada.`);
    return loop((sec) => {
      shown = follow(shown, have);
      const a = step(sec, .1, 1), b = step(sec, .5, 1.1), hn = hOf(need) * a, hh = hOf(shown) * b, done = shown >= need - 1;
      needBar.setAttribute('y', base - hn); needBar.setAttribute('height', hn);
      haveBar.setAttribute('y', base - hh); haveBar.setAttribute('height', hh); haveBar.setAttribute('fill', done ? 'url(#v-good)' : 'url(#v-bad)');
      gapBox.setAttribute('y', base - hn); gapBox.setAttribute('height', Math.max(0, hn - hh)); gapBox.setAttribute('opacity', step(sec, 1.6));
      needLbl.setAttribute('y', base - hn - 8); needLbl.setAttribute('opacity', a);
      haveLbl.setAttribute('y', base - hh - 8); haveLbl.textContent = done ? '¡Alcanza! ✓' : short(shown * b); haveLbl.setAttribute('fill', done ? C.good : C.white);
      gapLbl.setAttribute('y', base - (hn + hh) / 2 + 4); gapLbl.textContent = done ? '' : `faltan ${short(need - shown)}`; gapLbl.setAttribute('opacity', step(sec, 1.8));
    });
  }
  // money running out: savings line falling to zero at the run-out age
  function runOut(box, t) {
    const n = t.numbers, s = svg(box), from = n.retireAge, to = +n.runOut, end = to + 8;
    head(s, `Tus ahorros se acaban a los ${to} años`, `Cómo baja tu dinero desde que te jubilas a los ${from}`, C.bad);
    const X = 30, Y = 58, PW = 350, PH = 130, xOf = (age) => X + PW * (age - from) / (end - from);
    el(s, 'line', { x1: X, y1: Y + PH, x2: X + PW, y2: Y + PH, stroke: C.dim });
    for (let age = from; age <= end; age += Math.max(2, Math.round((end - from) / 6))) txt(s, xOf(age), Y + PH + 16, age, { 'text-anchor': 'middle', fill: C.lav, 'font-size': 10 });
    const area = el(s, 'path', { fill: 'url(#v-lav)', opacity: .22 }), line = el(s, 'polyline', { fill: 'none', stroke: C.warn, 'stroke-width': 3 });
    const zero = el(s, 'line', { y1: Y + PH, y2: Y + PH, stroke: C.bad, 'stroke-width': 4, 'stroke-linecap': 'round' });
    const dot = el(s, 'circle', { r: 6, fill: C.white, filter: 'url(#glow)' }), age = txt(s, 0, 0, '', { 'font-weight': 700, 'text-anchor': 'middle' });
    const curve = (a) => a >= to ? 0 : Math.pow(1 - (a - from) / (to - from), .8);
    return loop((sec) => {
      const k = (sec % 7) / 5.5, a = lerp(from, end, clamp(k, 0, 1)), pts = [];
      for (let x = from; x <= a; x += .25) pts.push([xOf(x), Y + PH * (1 - curve(x))]);
      line.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
      area.setAttribute('d', pts.length ? `M${X},${Y + PH} L${pts.map((p) => p.join(',')).join(' L')} L${pts.at(-1)[0]},${Y + PH} Z` : '');
      zero.setAttribute('x1', xOf(to)); zero.setAttribute('x2', xOf(Math.max(to, a)));
      const [px, py] = pts.at(-1) ?? [X, Y];
      dot.setAttribute('cx', px); dot.setAttribute('cy', py); age.setAttribute('x', px); age.setAttribute('y', py - 12);
      age.textContent = `${Math.floor(a)} años`; age.setAttribute('fill', a >= to ? C.bad : C.white);
    });
  }
  // withdrawal rate: a gauge with the sustainable zone
  function drawGauge(box, t) {
    const n = t.numbers, s = svg(box), cx = 200, cy = 180, R = 110, max = Math.max(14, Math.ceil(n.draw + 2));
    head(s, `Sacas un ${n.draw}% de tus ahorros al año`, 'Hasta un 6% al año suele poder sostenerse', C.warn);
    const arc = (a0, a1, colour) => { const p = (v) => { const ang = Math.PI * (1 - v / max); return [cx + R * Math.cos(ang), cy - R * Math.sin(ang)]; }; const [x0, y0] = p(a0), [x1, y1] = p(a1); el(s, 'path', { d: `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`, fill: 'none', stroke: colour, 'stroke-width': 18 }); };
    arc(0, 6, C.good); arc(6, 8, C.warn); arc(8, max, C.bad);
    const needle = el(s, 'line', { x1: cx, y1: cy, stroke: C.white, 'stroke-width': 4, 'stroke-linecap': 'round' });
    el(s, 'circle', { cx, cy, r: 8, fill: C.white });
    const val = txt(s, cx, cy + 30, '', { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700 });
    let d = n.draw, shown = 0;
    slider(box, { label: 'Sacar al año', min: 2, max: Math.ceil(n.draw), step: .5, value: n.draw, fmt: (v) => `${v}%` }, (v) => { d = v; });
    return loop((sec) => {
      shown = follow(shown, d * step(sec, .2, 1), .2);
      const ang = Math.PI * (1 - shown / max);
      needle.setAttribute('x2', cx + (R - 24) * Math.cos(ang)); needle.setAttribute('y2', cy - (R - 24) * Math.sin(ang));
      val.textContent = `${shown.toFixed(1)}% al año`; val.setAttribute('fill', shown <= 6 ? C.good : C.bad);
    });
  }

  // ------------------------------------------------------------- college
  scenes.education = (box, t, c) => {
    const n = t.numbers, s = svg(box), kids = c.household.kids.length ? c.household.kids : ['Hijos'];
    head(s, `Para la universidad faltan ${short(n.gap)}`, 'Lo ahorrado frente a lo que costará, por hijo (en dinero de hoy)', C.warn);
    const per = n.need / kids.length, rows = kids.map((name, i) => {
      const y = 76 + i * 56;
      txt(s, 0, y - 6, name, { 'font-weight': 600 });
      el(s, 'rect', { x: 0, y, width: W, height: 22, rx: 8, fill: 'url(#hatch)' });
      const f = el(s, 'rect', { x: 0, y, height: 22, rx: 8 });
      const v = txt(s, W, y - 6, '', { 'text-anchor': 'end', fill: C.lav, 'font-size': 11 });
      return { f, v };
    });
    let target = n.need ? n.have / n.need : 0, shown = 0;
    if (n.extraSave > 0) slider(box, { label: 'Aporte extra al año', min: 0, max: Math.ceil(n.extraSave * 1.5 / 100) * 100, step: 50, value: 0, fmt: (v) => money(v) }, (v) => { target = Math.min(1, n.have / n.need + (1 - n.have / n.need) * v / n.extraSave); });
    else note(box, 'Hoy no hay ahorro para la universidad: todo lo rayado está por cubrir.');
    return loop((sec) => {
      shown = follow(shown, target * step(sec, .2, 1.2), .2);
      rows.forEach(({ f, v }) => {
        f.setAttribute('width', Math.max(0, W * shown)); f.setAttribute('fill', shown > .99 ? 'url(#g-good)' : 'url(#g-warn)');
        v.textContent = shown > .99 ? 'cubierto ✓' : `${Math.round(shown * 100)}% de ${short(per)}`;
      });
    });
  };

  // ------------------------------------------------------------- life insurance
  // Per earner: what the policy would pay vs what the family would need.
  scenes.life = (box, t) => {
    const n = t.numbers, s = svg(box), people = n.people ?? [];
    const short_ = people.reduce((a, p) => a + Math.max(0, p.need - p.has), 0);
    head(s, short_ ? 'Si faltaras, tu familia recibiría muy poco' : 'Tu familia está protegida', 'Lo que pagaría tu seguro frente a lo mínimo que necesitarían', short_ ? tone(t.status) : C.good);
    const max = Math.max(...people.map((p) => Math.max(p.need, p.has))) * 1.02;
    const rows = people.map((p, i) => {
      const y = 78 + i * 62;
      txt(s, 0, y - 8, p.name, { 'font-weight': 600 });
      el(s, 'rect', { x: 0, y, width: W * p.need / max, height: 24, rx: 8, fill: p.need > p.has ? 'url(#hatch)' : C.dim });
      const f = el(s, 'rect', { x: 0, y, height: 24, rx: 8 });
      const v = txt(s, W, y - 8, '', { 'text-anchor': 'end', 'font-size': 11, 'font-weight': 600 });
      return { p, f, v };
    });
    let extra = 0, shown = 0;
    if (short_) slider(box, { label: 'Subir la cobertura', min: 0, max: short_, step: 10000, value: 0, fmt: (v) => `+${short(v)}` }, (v) => { extra = v; });
    return loop((sec) => {
      shown = follow(shown, extra);
      const k = step(sec, .2, 1.1);
      rows.forEach(({ p, f, v }) => {
        const missing = Math.max(0, p.need - p.has), add = short_ ? shown * missing / short_ : 0, has = (p.has + add) * k, ok = has >= p.need - 1;
        f.setAttribute('width', W * Math.min(has, max) / max); f.setAttribute('fill', ok ? 'url(#g-good)' : 'url(#g-bad)');
        v.textContent = ok ? `cubre ${short(p.need)} ✓` : `cubre ${short(p.has + add)} · faltan ${short(p.need - p.has - add)}`;
        v.setAttribute('fill', ok ? C.good : C.bad);
      });
    });
  };

  // ------------------------------------------------------------- umbrella liability
  function icon(s, kind, x, y) {
    const g = el(s, 'g', { transform: `translate(${x} ${y})` });
    if (kind === 'house') { el(g, 'path', { d: 'M-24,0 L-24,-24 L0,-44 L24,-24 L24,0 Z', fill: C.lav }); el(g, 'rect', { x: -6, y: -16, width: 12, height: 16, fill: C.card }); }
    if (kind === 'car') { el(g, 'path', { d: 'M-30,-8 L-30,-20 L-18,-20 L-10,-32 L12,-32 L22,-20 L30,-20 L30,-8 Z', fill: C.lav }); el(g, 'circle', { cx: -16, cy: -6, r: 7, fill: C.white }); el(g, 'circle', { cx: 16, cy: -6, r: 7, fill: C.white }); }
    if (kind === 'savings') { el(g, 'rect', { x: -22, y: -36, width: 44, height: 36, rx: 8, fill: C.lav }); txt(g, 0, -12, '$', { 'text-anchor': 'middle', fill: C.card, 'font-size': 20, 'font-weight': 700 }); }
    return g;
  }
  scenes.umbrella = (box, t) => {
    const n = t.numbers, s = svg(box);
    let on = !n.recommended;
    const title = txt(s, 0, 20, '', { 'font-size': 17, 'font-weight': 700 });
    txt(s, 0, 40, 'Si te demandan, el seguro de casa y auto cubre poco; este cubre el resto', { 'font-size': 11.5, fill: C.lav });
    const assets = [['house', 120], ['car', 210], ['savings', 300]].map(([k, x]) => icon(s, k, x, 196));
    const shield = el(s, 'path', { d: 'M90,150 Q210,70 330,150', fill: 'none', stroke: C.good, 'stroke-width': 8, 'stroke-linecap': 'round', filter: 'url(#glow)' });
    const claim = el(s, 'g'); chip(claim, 0, 0, 'Demanda', C.bad);
    const hit = txt(s, 0, 0, '', { 'text-anchor': 'middle', 'font-weight': 700, fill: C.bad });
    if (n.recommended) {
      const btn = document.createElement('button'); btn.className = 'pill scene-toggle';
      const sync = () => { btn.textContent = on ? 'Quitar el seguro' : `Contratar ${short(n.recommended)} de cobertura`; };
      btn.onclick = (e) => { e.stopPropagation(); on = !on; sync(); }; sync(); box.append(btn);
    }
    return loop((sec) => {
      title.textContent = on ? 'Estás cubierto ante demandas' : 'Una demanda podría llegar a tu patrimonio';
      title.setAttribute('fill', on ? C.good : C.bad);
      shield.setAttribute('opacity', on ? 1 : 0);
      const k = (sec % 3.2) / 3.2, target = [120, 210, 300][Math.floor(sec / 3.2) % 3];
      const stopY = on ? 100 : 160, y = lerp(46, stopY, ease(k / .5)), x = lerp(target - 60, target, ease(k / .5));
      claim.setAttribute('transform', `translate(${k < .5 ? x : on ? lerp(target, target - 80, ease((k - .5) / .5)) : target} ${k < .5 ? y : on ? lerp(stopY, 46, ease((k - .5) / .5)) : stopY})`);
      claim.setAttribute('opacity', k > .9 ? 0 : 1);
      const struck = !on && k > .5;
      assets.forEach((a, i) => a.setAttribute('opacity', struck && [120, 210, 300][i] === target ? .35 : 1));
      hit.setAttribute('x', target); hit.setAttribute('y', 130); hit.textContent = struck ? '−$' : '';
    });
  };

  // ------------------------------------------------------------- investments
  function donut(s, cx, cy, label) {
    el(s, 'circle', { cx, cy, r: 48, fill: 'none', stroke: 'rgba(169,180,245,.35)', 'stroke-width': 18 });
    const arc = el(s, 'circle', { cx, cy, r: 48, fill: 'none', stroke: C.lav, 'stroke-width': 18, transform: `rotate(-90 ${cx} ${cy})`, 'stroke-dasharray': `0 ${2 * Math.PI * 48}` });
    const v = txt(s, cx, cy + 6, '', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 });
    txt(s, cx, cy + 74, label, { 'text-anchor': 'middle', fill: C.lav });
    return (share, colour) => { arc.setAttribute('stroke-dasharray', `${2 * Math.PI * 48 * share / 100} ${2 * Math.PI * 48}`); arc.setAttribute('stroke', colour); v.textContent = `${Math.round(share)}%`; };
  }
  scenes.investments = (box, t) => {
    const n = t.numbers, s = svg(box);
    if (n.leveraged) return leveraged(box, t, s);
    const diff = n.target - n.equity;
    head(s, diff >= 5 ? 'Tu dinero está más quieto de lo que te toca' : diff <= -5 ? 'Tienes más riesgo del que te toca' : 'Tus inversiones están equilibradas',
      'Parte en acciones: crecen más, pero suben y bajan', Math.abs(diff) >= 5 ? C.warn : C.good);
    const today = donut(s, 110, 112, 'Hoy'), ideal = donut(s, 290, 112, 'Ideal para ti');
    txt(s, 200, 118, '→', { 'text-anchor': 'middle', 'font-size': 22, fill: C.lav });
    let eq = n.equity, shown = 0;
    slider(box, { label: 'En acciones', min: Math.min(n.equity, n.target) - 10, max: Math.max(n.equity, n.target) + 10, step: 1, value: n.equity, fmt: (v) => `${v}%` }, (v) => { eq = v; });
    return loop((sec) => {
      shown = follow(shown, eq * step(sec, .2, 1.2), .2);
      const ok = Math.abs(shown - n.target) < 1.5;
      today(shown, ok ? C.good : C.warn); ideal(n.target * step(sec, .6, 1.2), C.good);
    });
  };
  function leveraged(box, t, s) {
    const n = t.numbers;
    head(s, `${n.leveraged} amplifica las caídas por 3`, 'Si el mercado cae un 10%, este fondo cae alrededor de un 30%', C.bad);
    const X = 20, Y = 60, PW = 360, mid = 90;
    el(s, 'line', { x1: X, y1: Y + 20, x2: X + PW, y2: Y + 20, stroke: C.dim, 'stroke-dasharray': '3 4' });
    const market = el(s, 'polyline', { fill: 'none', stroke: C.lav, 'stroke-width': 3 }), lev = el(s, 'polyline', { fill: 'none', stroke: C.bad, 'stroke-width': 3 });
    const mLbl = txt(s, 0, 0, 'Mercado −10%', { fill: C.lav, 'font-size': 11, 'font-weight': 600 }), lLbl = txt(s, 0, 0, `${n.leveraged} −30%`, { fill: C.bad, 'font-size': 11, 'font-weight': 600 });
    const drop = (x) => -Math.sin(clamp(x, 0, 1) * Math.PI) * 10; // % move, dips to −10 and back
    return loop((sec) => {
      const k = clamp((sec % 6) / 4.5, 0, 1), pts = (mult) => Array.from({ length: 50 }, (_, i) => { const x = i / 49 * k; return `${X + x * PW},${Y + 20 - drop(x) * mult * 4}`; }).join(' ');
      market.setAttribute('points', pts(1)); lev.setAttribute('points', pts(3));
      const show = k > .5 ? 1 : 0;
      mLbl.setAttribute('x', X + PW * .5 + 8); mLbl.setAttribute('y', Y + 20 + 40 + 4); mLbl.setAttribute('opacity', show);
      lLbl.setAttribute('x', X + PW * .5 + 8); lLbl.setAttribute('y', Y + 20 + 120 + 4); lLbl.setAttribute('opacity', show);
    });
  }

  // ------------------------------------------------------------- things that are fine
  scenes.praise = (box, t) => {
    const s = svg(box);
    el(s, 'circle', { cx: 200, cy: 92, r: 52, fill: 'rgba(111,216,168,.1)', stroke: C.good, 'stroke-width': 3 });
    const check = el(s, 'path', { d: 'M174,94 L194,114 L230,74', fill: 'none', stroke: C.good, 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': 90, filter: 'url(#glow)' });
    txt(s, 200, 178, t.label, { 'text-anchor': 'middle', fill: C.good, 'font-size': 18, 'font-weight': 700 });
    txt(s, 200, 200, t.headline, { 'text-anchor': 'middle', fill: C.lav, 'font-size': 11.5 });
    const sparks = Array.from({ length: 10 }, (_, i) => el(s, 'circle', { r: 2.5, fill: i % 2 ? C.lav : C.good }));
    return loop((sec) => {
      check.setAttribute('stroke-dashoffset', 90 * (1 - step(sec, .2, .7)));
      sparks.forEach((p, i) => {
        const a = i / 10 * Math.PI * 2 + sec * .35, r = 66 + Math.sin(sec * 2 + i) * 6;
        p.setAttribute('cx', 200 + Math.cos(a) * r); p.setAttribute('cy', 92 + Math.sin(a) * r * .9); p.setAttribute('opacity', step(sec, .6));
      });
    });
  };

  // Entry point: picks the scene for a topic; anything fine (or unknown) gets the praise scene.
  window.mountScene = (box, topic, c, opts = {}) => {
    box.innerHTML = ''; BARE = !!opts.bare;
    const own = scenes[topic.id];
    if (!own || (topic.status === 'good' && !['emergency', 'investments', 'umbrella'].includes(topic.id))) return scenes.praise(box, topic);
    return own(box, topic, c) ?? (() => {});
  };
})();
