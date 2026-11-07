// 화면 그리기: 피아노 롤(눈금자·파형·음 막대), TAB 줄, 전체 개요. 좌표 변환과 마우스 적중 판정도 여기서 한다.
import { store, noteName } from './state.js';
import { STRING_NAMES, candidates } from './tab.js';
import { peaksIn } from './waveform.js';
import * as mk from './marks.js';
import { notate } from './rhythm.js';

export const KEY_W = 48, RULER = 20, WAVE = 36, TOP = RULER + WAVE;
export const TAB_TOP = 32, TAB_GAP = 20, TAB_PAD = 5, TAB_H = 182;
const BLACK = new Set([1, 3, 6, 8, 10]);

// 해머링은 같은 줄에서 높은 프렛으로, 풀링은 낮은 프렛으로, 슬라이드는 같은 줄에서 이어져야 자연스럽다
export function legatoOk(n, prev) {
  if (!prev || prev.string !== n.string || prev.fret < 0 || n.fret < 0) return false;
  if (n.tech === 'h') return n.fret > prev.fret;
  if (n.tech === 'p') return n.fret < prev.fret;
  return n.fret !== prev.fret;
}

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
  // TAB 줄 클릭: 다른 줄 후보(흐린 숫자)를 먼저, 그다음 실제 숫자를 찾는다
  hitTab(x, y) {
    const s = Math.round((y - TAB_TOP) / TAB_GAP) + 1;
    const g = (this.ghosts || []).find(o => o.string === s && x >= o.x0 && x <= o.x1);
    if (g) return { ghost: true, id: g.id, string: s };
    const spot = (this.tabSpots || []).find(o => o.string === s && x >= o.x0 && x <= o.x1);
    return spot ? store.tab.get(spot.id) : null;
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
    const [w, h] = fit(this.tabC, TAB_H), g = this.tabC.getContext('2d');
    g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, w, h);
    for (let s = 1; s <= 6; s++) {
      const y = TAB_TOP + (s - 1) * TAB_GAP;
      g.fillStyle = '#999'; g.fillRect(KEY_W, y, w - KEY_W, 1);
      g.fillStyle = '#555'; g.font = '11px -apple-system'; g.fillText(STRING_NAMES[s], 18, y + 4);
    }
    g.font = '700 11px -apple-system'; g.fillStyle = '#333'; g.fillText('TAB', 6, TAB_TOP - 8);
    for (let b = store.barAt(this.s); b <= store.barAt(this.e); b++) { const x = this.X(store.barStart(b)); if (x >= KEY_W) { g.fillStyle = '#333'; g.fillRect(x, TAB_TOP, 1.5, TAB_GAP * 5); } }
    // 1) 자리 잡기: 숫자는 음 시작에서 TAB_PAD 만큼 띄워 마디선·박선에 붙지 않게 하고,
    //    같은 줄 앞 숫자(벤딩 화살표 포함)와 겹치면 뒤로 밀고, 다음 마디선을 넘으면 앞으로 당긴다.
    const lastX = {};
    this.tabSpots = [];
    const ns = [...store.tab.values()].filter(n => n.t >= this.s && n.t <= this.e).sort((a, b) => a.t - b.t);
    for (const n of ns) {
      const label = n.fret < 0 ? '?' : n.tech === 'x' ? 'x' : String(n.fret);
      g.font = '700 13px -apple-system';
      const tw = g.measureText(label).width, extra = n.tech === 'b' || n.tech === 'r' ? 15 : 0;
      let x = Math.max(this.X(n.t) + TAB_PAD, (lastX[n.string] ?? -1e9) + 3);
      const nextBar = this.X(store.barStart(store.barAt(n.t) + 1));
      if (x + tw + extra > nextBar - 7) x = Math.max((lastX[n.string] ?? -1e9) + 3, this.X(n.t) + 1, nextBar - 7 - tw - extra);
      lastX[n.string] = x + tw + extra;
      this.tabSpots.push({ id: n.id, string: n.string, x0: x - 3, x1: x + tw + 3, x, tw, label, n });
    }
    // 2) 숫자
    for (const sp of this.tabSpots) {
      const { n, x, tw, label } = sp, on = store.sel.has(n.id), y = TAB_TOP + (n.string - 1) * TAB_GAP;
      g.font = `${on ? 800 : 600} 13px -apple-system`;
      g.fillStyle = on ? '#fce7f3' : '#f7f7f5'; g.fillRect(x - 2, y - 8, tw + 4, 16);
      g.fillStyle = on ? '#db2777' : n.fret < 0 ? '#dc2626' : n.lockString ? '#1d4ed8' : '#111';
      g.fillText(label, x, y + 5);
    }
    // 3) 주법 기호는 숫자를 다 그린 뒤 맨 위에 그려서 다른 음 숫자에 가리지 않게 한다
    this.#techMarks(g);
    // 4) 박자 꼬리: 인쇄 TAB과 같은 기둥·빔·잇단음표
    this.#rhythm(g);
    // 선택한 음은 다른 줄로 칠 수 있는 자리를 흐리게 보여 준다. 클릭하면 그 줄로 바뀐다.
    this.ghosts = [];
    const sel = store.selected();
    if (sel.length && sel.length <= 8) for (const n of sel) {
      const cur = store.tab.get(n.id); if (!cur || n.t < this.s || n.t > this.e) continue;
      for (const c of candidates(n.midi, undefined, store.P.maxFret)) {
        if (c.string === cur.string) continue;
        const x = this.X(n.t) + TAB_PAD, y = TAB_TOP + (c.string - 1) * TAB_GAP, label = String(c.fret);
        g.font = '600 12px -apple-system'; const tw = g.measureText(label).width;
        g.setLineDash([3, 2]); g.strokeStyle = '#db277799'; g.strokeRect(x - 2.5, y - 7.5, tw + 5, 15); g.setLineDash([]);
        g.fillStyle = '#f7f7f5'; g.fillRect(x - 2, y - 7, tw + 4, 14);
        g.fillStyle = '#db277799'; g.fillText(label, x, y + 4);
        this.ghosts.push({ id: n.id, string: c.string, x0: x - 3, x1: x + tw + 3 });
      }
    }
    const px = this.X(this.tr.clock()); if (px >= KEY_W) { g.fillStyle = '#16a34a'; g.fillRect(px - 1, 0, 2, h); }
  }

  #rhythm(g) {
    if (!this.tabSpots.length) return;
    const r = notate(this.tabSpots.map(sp => sp.n), store.P), top = TAB_TOP + 5 * TAB_GAP + 7, bot = top + 18;
    const groups = new Map();
    for (const sp of this.tabSpots) { const x = r.get(sp.n.id); if (x) (groups.get(x.groupKey) || groups.set(x.groupKey, []).get(x.groupKey)).push({ sp, x }); }
    g.strokeStyle = g.fillStyle = '#333';
    for (const grp of groups.values()) {
      grp.sort((a, b) => a.sp.n.t - b.sp.n.t);
      const xs = grp.map(o => o.sp.x + o.sp.tw / 2), rs = grp.map(o => o.x);
      grp.forEach((o, i) => {
        const long = ['2분', '점2분', '온'].includes(rs[i].value);
        g.lineWidth = 1; g.setLineDash(long ? [2, 2] : []);
        g.beginPath(); g.moveTo(xs[i], top); g.lineTo(xs[i], bot); g.stroke(); g.setLineDash([]);
        if (rs[i].dotted) { g.beginPath(); g.arc(xs[i] + 4, bot - 3, 1.4, 0, 7); g.fill(); }
      });
      g.lineWidth = 2.4;
      for (let lv = 1; lv <= 3; lv++) {
        const y = bot - (lv - 1) * 4;
        for (let i = 0; i < grp.length; i++) {
          if (rs[i].beams < lv) continue;
          g.beginPath();
          if (i + 1 < grp.length && rs[i + 1].beams >= lv) { g.moveTo(xs[i], y); g.lineTo(xs[i + 1], y); }
          else if (!(i > 0 && rs[i - 1].beams >= lv)) { const d = i + 1 < grp.length || grp.length === 1 ? 7 : -7; g.moveTo(xs[i], y); g.lineTo(xs[i] + d, y); }
          g.stroke();
        }
      }
      if (rs[0].tuplet && grp.length > 1) {
        const a = xs[0], b = xs.at(-1), y = bot + 7;
        g.lineWidth = 0.8; g.beginPath(); g.moveTo(a, y - 3); g.lineTo(a, y); g.lineTo(b, y); g.lineTo(b, y - 3); g.stroke();
        g.font = '9px -apple-system'; g.textAlign = 'center'; g.fillText(String(rs[0].tuplet), (a + b) / 2, y + 10); g.textAlign = 'left';
      }
    }
  }

  // 벤딩·릴리즈는 곡선 화살표, 해머링·풀링은 이음줄 + h/p, 슬라이드는 사선, 비브라토는 물결.
  // 해머링·풀링·슬라이드가 앞 음과 줄이 다르거나 방향이 안 맞으면 빨갛게 표시한다.
  #techMarks(g) {
    const spot = new Map(this.tabSpots.map(o => [o.id, o]));
    const halo = (text, x, y) => { g.lineWidth = 3; g.strokeStyle = '#f7f7f5'; g.strokeText(text, x, y); g.fillText(text, x, y); };
    const stroke = (d, w = 1.3) => { g.lineWidth = w; g.stroke(new Path2D(d)); };
    for (const sp of this.tabSpots) {
      const n = sp.n, y = TAB_TOP + (n.string - 1) * TAB_GAP, right = sp.x + sp.tw;
      g.textAlign = 'center';
      if (n.tech === 'b' || n.tech === 'r') {
        const m = n.tech === 'b' ? mk.bend(right, y) : mk.release(right, y);
        g.strokeStyle = '#f7f7f5'; stroke(m.curve, 4); stroke(m.head, 4);
        g.strokeStyle = g.fillStyle = '#b45309'; stroke(m.curve); stroke(m.head);
        if (n.tech === 'b') { g.font = '700 9px -apple-system'; halo(mk.BEND_LABEL[n.bend || 2] || `${(n.bend || 2) / 2}`, m.tip[0], m.tip[1] - 3); }
      } else if (n.tech === 'v') {
        g.strokeStyle = '#f7f7f5'; stroke(mk.vibrato(sp.x - 1, y - 11, Math.max(14, sp.tw + 4)), 3.5);
        g.strokeStyle = '#b45309'; stroke(mk.vibrato(sp.x - 1, y - 11, Math.max(14, sp.tw + 4)), 1.2);
      } else if (['h', 'p', 's'].includes(n.tech)) {
        const prev = store.prevNote(store.get(n.id)), pt = prev && store.tab.get(prev.id), ps = prev && spot.get(prev.id);
        const ok = legatoOk(n, pt), x1 = sp.x + sp.tw / 2, x0 = ps ? ps.x + ps.tw / 2 : sp.x - 14;
        g.strokeStyle = g.fillStyle = ok ? '#b45309' : '#dc2626';
        if (n.tech === 's') stroke(mk.slide(ps ? ps.x + ps.tw : sp.x - 14, sp.x, y, !pt || n.fret >= pt.fret), 1.4);
        else {
          const sl = mk.slur(x0, x1, y);
          g.strokeStyle = '#f7f7f5'; stroke(sl.path, 3.5); g.strokeStyle = ok ? '#b45309' : '#dc2626'; stroke(sl.path, 1.2);
          g.font = 'italic 700 10px -apple-system'; halo(n.tech, sl.label[0], sl.label[1]);
        }
      }
      g.textAlign = 'left';
    }
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
