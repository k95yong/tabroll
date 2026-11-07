// 화면 그리기: 피아노 롤(눈금자·파형·음 막대), TAB 줄, 전체 개요. 좌표 변환과 마우스 적중 판정도 여기서 한다.
import { store, noteName } from './state.js';
import { STRING_NAMES } from './tab.js';
import { peaksIn } from './waveform.js';

export const KEY_W = 48, RULER = 20, WAVE = 36, TOP = RULER + WAVE;
export const TAB_TOP = 22, TAB_GAP = 20;
const BLACK = new Set([1, 3, 6, 8, 10]);
const TECH_SHORT = { h: 'h', p: 'p', r: 'r', s: '/', v: '~' };

function fit(c, h) {
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1, H = h ?? r.height;
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(H * dpr); }
  c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  return [r.width, H];
}

export class View {
  constructor({ roll, tab, overview }, transport) {
    Object.assign(this, { roll, tabC: tab, ov: overview, tr: transport });
    this.s = -0.2; this.e = 4;
    this.wave = null;
    this.follow = true;
    this.box = null;      // 박스 선택 중인 사각형 {x0,y0,x1,y1}
    this.ghostLoop = null; // 눈금자를 끄는 중인 반복 구간
    this.pinRange = null;  // 끄는 동안 음높이 범위를 고정
    this.w = 800; this.h = 400; this.lo = 52; this.hi = 76; this.rh = 10;
    this.q = 0;
  }

  // ---- 좌표 ----
  X(t) { return KEY_W + (t - this.s) / (this.e - this.s) * (this.w - KEY_W); }
  T(x) { return this.s + (x - KEY_W) / (this.w - KEY_W) * (this.e - this.s); }
  Y(m) { return TOP + (this.hi - m) * this.rh; }
  M(y) { return this.hi - Math.floor((y - TOP) / this.rh); }
  get span() { return this.e - this.s; }

  pitchRange() {
    if (this.pinRange) return this.pinRange;
    const ms = store.notes.map(n => n.midi);
    let lo = ms.length ? Math.min(...ms) - 3 : 52, hi = ms.length ? Math.max(...ms) + 3 : 76;
    if (hi - lo < 20) { const c = (hi + lo) / 2; lo = Math.floor(c - 10); hi = Math.ceil(c + 10); }
    return [lo, hi];
  }
  songEnd() { return Math.max(this.tr.media.duration || 0, ...store.notes.map(n => n.te), this.e, 10); }

  // ---- 시점 이동 ----
  setView(s, e) { const w = Math.min(180, Math.max(0.3, e - s)); this.s = s; this.e = s + w; this.draw(); }
  zoom(f, at = (this.s + this.e) / 2) { const w = Math.min(180, Math.max(0.3, this.span * f)), k = (at - this.s) / this.span; this.setView(at - w * k, at - w * k + w); }
  scrollBy(dt) { this.setView(this.s + dt, this.e + dt); }
  fitBars(fromBar, bars = 2) { const s = store.barStart(fromBar) - 0.2; this.setView(Math.max(-0.2, s), s + store.barLen * bars + 0.4); }
  fitAll() {
    const ns = store.byTime();
    if (!ns.length) return this.fitBars(Math.max(1, store.barAt(this.tr.cursor)));
    this.fitBars(store.barAt(ns[0].t));
  }
  gotoBar(delta) {
    const b = store.barAt(this.s + 0.25) + delta, w = this.span;
    const s = Math.max(-0.2, store.barStart(b) - 0.2);
    this.setView(s, s + w);
    if (!this.tr.playing) this.tr.seek(Math.max(0, store.barStart(b)));
  }
  reveal(t) { if (t < this.s || t > this.e) { const w = this.span; this.setView(t - w * 0.2, t + w * 0.8); } }
  followPlayhead() {
    if (!this.follow || !this.tr.playing) return;
    const t = this.tr.clock();
    if (this.tr.loop.on && this.tr.loop.a >= this.s && this.tr.loop.b <= this.e) return;
    if (t > this.e - this.span * 0.05 || t < this.s) { const w = this.span; this.s = t - w * 0.05; this.e = this.s + w; }
  }

  // ---- 적중 판정 ----
  hit(x, y) {
    if (y < TOP) return null;
    const m = this.M(y);
    const near = store.notes.filter(n => n.midi === m && x >= this.X(n.t) - 3 && x <= Math.max(this.X(n.te), this.X(n.t) + 4) + 3);
    const n = near.sort((a, b) => store.sel.has(b.id) - store.sel.has(a.id))[0];
    if (!n) return null;
    const x0 = this.X(n.t), x1 = Math.max(this.X(n.te), x0 + 4);
    return { n, part: x1 - x0 > 16 && x - x0 < 6 ? 'l' : x1 - x < 6 ? 'r' : 'mid' };
  }
  hitTab(x, y) {
    const s = Math.round((y - TAB_TOP) / TAB_GAP) + 1;
    let best = null, d = 14;
    for (const n of store.tab.values()) {
      if (n.string !== s) continue;
      const dx = Math.abs(this.X(n.t) + 5 - x); if (dx < d) { d = dx; best = n; }
    }
    return best;
  }
  notesInBox(b) {
    const [x0, x1] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)], [y0, y1] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
    return store.notes.filter(n => this.X(n.te) >= x0 && this.X(n.t) <= x1 && this.Y(n.midi) + this.rh >= y0 && this.Y(n.midi) <= y1).map(n => n.id);
  }

  // ---- 그리기 ----
  draw() { if (!this.q) this.q = requestAnimationFrame(() => { this.q = 0; this.render(); }); }
  render() { this.followPlayhead(); this.drawRoll(); this.drawTab(); this.drawOverview(); }

  drawRoll() {
    const [w, h] = fit(this.roll), g = this.roll.getContext('2d');
    this.w = w; this.h = h;
    [this.lo, this.hi] = this.pitchRange();
    this.rh = (h - TOP) / (this.hi - this.lo + 1);
    const { lo, hi, rh } = this;
    g.fillStyle = '#14161b'; g.fillRect(0, 0, w, h);
    // 건반과 줄 배경
    for (let m = lo; m <= hi; m++) {
      const black = BLACK.has(((m % 12) + 12) % 12), y = this.Y(m);
      g.fillStyle = black ? '#121419' : '#1a1d23'; g.fillRect(KEY_W, y, w - KEY_W, rh);
      g.fillStyle = black ? '#2a2d34' : '#d8d8d8'; g.fillRect(0, y, KEY_W - 4, rh - 0.5);
      if (rh >= 9) { g.fillStyle = black ? '#aaa' : '#333'; g.font = `${Math.min(11, rh - 2)}px -apple-system`; g.fillText(noteName(m), 4, y + rh - 3); }
    }
    this.#grid(g, w, h);
    this.#wave(g, w);
    this.#loop(g, h);
    // 음 막대
    g.save(); g.beginPath(); g.rect(KEY_W, TOP, w - KEY_W, h); g.clip();
    for (const n of store.notes) {
      if (n.te < this.s || n.t > this.e) continue;
      const x0 = this.X(n.t), x1 = Math.max(this.X(n.te), x0 + 4), y = this.Y(n.midi), on = store.sel.has(n.id);
      g.fillStyle = on ? '#f472b6' : n.src === 'user' ? '#a78bfa' : n.src === 'rec' ? '#fb923c' : '#9ca3af';
      g.fillRect(x0, y + 1, x1 - x0, rh - 2);
      g.fillStyle = '#ffffff66'; g.fillRect(x0, y + 1, 3, rh - 2); g.fillRect(x1 - 3, y + 1, 3, rh - 2);
      if (on) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(x0 + 0.5, y + 1.5, x1 - x0 - 1, rh - 3); }
      if (x1 - x0 > 24 && rh > 9) { g.fillStyle = '#111'; g.font = `600 ${Math.min(11, rh - 3)}px -apple-system`; g.fillText(noteName(n.midi) + (n.tech ? ' ' + n.tech : ''), x0 + 5, y + rh - 3); }
    }
    for (const hn of this.held || []) { const x0 = this.X(hn.t); g.fillStyle = '#fdba74'; g.fillRect(x0, this.Y(hn.midi) + 1, Math.max(3, this.X(this.tr.clock()) - x0), rh - 2); }
    g.restore();
    if (this.box) {
      const b = this.box; g.fillStyle = '#3b82f622'; g.strokeStyle = '#60a5fa'; g.lineWidth = 1;
      g.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      g.strokeRect(Math.min(b.x0, b.x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
    const px = this.X(this.tr.clock());
    if (px >= KEY_W && px <= w) { g.fillStyle = '#4ade80'; g.fillRect(px - 1, 0, 2, h); }
  }
  #grid(g, w, h) {
    const s = store.snapStep, beat = store.beatLen, bl = store.barLen, P = store.P;
    g.font = '11px -apple-system';
    g.fillStyle = '#ffffff10'; g.fillRect(KEY_W, 0, w, RULER);
    for (let b = store.barAt(this.s) - 1; b <= store.barAt(this.e) + 1; b++) {
      const b0 = store.barStart(b);
      if (s && this.span / s < 400) for (let t = b0; t < b0 + bl - 1e-6; t += s) { const x = this.X(t); if (x > KEY_W) { g.fillStyle = '#ffffff0c'; g.fillRect(x, TOP, 1, h); } }
      for (let q = 0; q < P.beatsPerBar; q++) {
        const x = this.X(b0 + q * beat); if (x < KEY_W || x > w) continue;
        g.fillStyle = q ? '#ffffff22' : '#fbbf24aa'; g.fillRect(x, RULER, q ? 1 : 2, h);
        if (!q && b >= 1) { g.fillStyle = '#fbbf24'; g.fillText(`${b}마디`, x + 3, 14); }
        else if (q && this.X(b0 + beat) - this.X(b0) > 40) { g.fillStyle = '#6b7280'; g.fillText(`${q + 1}`, x + 3, 14); }
      }
    }
  }
  #wave(g, w) {
    g.fillStyle = '#0e1014'; g.fillRect(KEY_W, RULER, w - KEY_W, WAVE);
    g.fillStyle = '#6b7280'; g.font = '10px -apple-system'; g.fillText('파형', 8, RULER + WAVE / 2 + 4);
    if (!this.wave) { g.fillStyle = '#444'; g.fillText('음원을 열면 파형이 나옵니다', KEY_W + 8, RULER + WAVE / 2 + 4); return; }
    const px = Math.max(1, Math.floor(w - KEY_W)), pk = peaksIn(this.wave, this.s, this.e, px), mid = RULER + WAVE / 2;
    g.fillStyle = '#38bdf8aa';
    // 제곱해서 그리면 큰 소리(음이 시작되는 자리)가 더 잘 보인다
    for (let x = 0; x < px; x++) { const a = pk[x] * pk[x] * (WAVE / 2 - 2); if (a > 0.3) g.fillRect(KEY_W + x, mid - a, 1, a * 2); }
  }
  #loop(g, h) {
    const L = this.ghostLoop || (this.tr.loop.b - this.tr.loop.a > 0.05 ? this.tr.loop : null);
    if (!L) return;
    const x0 = Math.max(KEY_W, this.X(L.a)), x1 = Math.min(this.w, this.X(L.b));
    if (x1 <= x0) return;
    const on = this.ghostLoop || this.tr.loop.on;
    g.fillStyle = on ? '#7c3aed55' : '#7c3aed22'; g.fillRect(x0, 0, x1 - x0, RULER);
    g.fillStyle = on ? '#7c3aed14' : '#7c3aed08'; g.fillRect(x0, TOP, x1 - x0, h);
    g.fillStyle = '#a78bfa'; g.fillRect(x0, 0, 2, RULER); g.fillRect(x1 - 2, 0, 2, RULER);
  }

  drawTab() {
    const [w, h] = fit(this.tabC, 150), g = this.tabC.getContext('2d');
    g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, w, h);
    for (let s = 1; s <= 6; s++) {
      const y = TAB_TOP + (s - 1) * TAB_GAP;
      g.fillStyle = '#999'; g.fillRect(KEY_W, y, w - KEY_W, 1);
      g.fillStyle = '#555'; g.font = '11px -apple-system'; g.fillText(STRING_NAMES[s], 18, y + 4);
    }
    g.font = '700 11px -apple-system'; g.fillStyle = '#333'; g.fillText('TAB', 6, TAB_TOP - 8);
    for (let b = store.barAt(this.s); b <= store.barAt(this.e); b++) { const x = this.X(store.barStart(b)); if (x >= KEY_W) { g.fillStyle = '#333'; g.fillRect(x, TAB_TOP, 1.5, TAB_GAP * 5); } }
    // 빠른 구간에서 숫자가 겹치면 같은 줄의 앞 숫자 바로 뒤로 민다
    const lastX = {};
    for (const n of [...store.tab.values()].sort((a, b) => a.t - b.t)) {
      if (n.t < this.s || n.t > this.e) continue;
      const on = store.sel.has(n.id), y = TAB_TOP + (n.string - 1) * TAB_GAP;
      const x = Math.max(this.X(n.t), (lastX[n.string] ?? -1e9) + 2);
      const label = n.fret < 0 ? '?' : n.tech === 'x' ? 'x' : String(n.fret);
      g.font = `${on ? 800 : 600} 13px -apple-system`;
      const tw = g.measureText(label).width;
      g.fillStyle = on ? '#fce7f3' : '#f7f7f5'; g.fillRect(x - 2, y - 8, tw + 4, 16);
      g.fillStyle = on ? '#db2777' : n.fret < 0 ? '#dc2626' : n.lockString ? '#1d4ed8' : '#111';
      g.fillText(label, x, y + 5);
      lastX[n.string] = x + tw;
      const mark = n.tech === 'b' ? `b${n.bend || 2}` : TECH_SHORT[n.tech];
      if (mark) { g.font = '10px -apple-system'; g.fillStyle = '#b45309'; g.fillText(mark, x + tw + 2, y - 3); }
    }
    const px = this.X(this.tr.clock()); if (px >= KEY_W) { g.fillStyle = '#16a34a'; g.fillRect(px - 1, 0, 2, h); }
  }

  drawOverview() {
    const [w, h] = fit(this.ov, 34), g = this.ov.getContext('2d'), end = this.songEnd(), ox = t => t / end * w;
    g.fillStyle = '#0c0e12'; g.fillRect(0, 0, w, h);
    if (this.wave) { const pk = peaksIn(this.wave, 0, end, Math.floor(w)); g.fillStyle = '#1e3a4a'; for (let x = 0; x < pk.length; x++) { const a = pk[x] * (h / 2 - 1); g.fillRect(x, h / 2 - a, 1, a * 2); } }
    const [lo, hi] = this.pitchRange();
    g.fillStyle = '#9ca3af';
    for (const n of store.notes) g.fillRect(ox(n.t), 3 + (hi - n.midi) / (hi - lo) * (h - 6), Math.max(1, ox(n.te) - ox(n.t)), 2);
    if (this.tr.loop.on) { g.fillStyle = '#7c3aed55'; g.fillRect(ox(this.tr.loop.a), 0, ox(this.tr.loop.b) - ox(this.tr.loop.a), h); }
    g.strokeStyle = '#3b82f6'; g.lineWidth = 2; g.strokeRect(ox(this.s), 1, ox(this.e) - ox(this.s), h - 2);
    g.fillStyle = '#4ade80'; g.fillRect(ox(this.tr.clock()), 0, 2, h);
  }
}
