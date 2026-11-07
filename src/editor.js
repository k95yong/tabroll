// 음 편집 명령과 마우스 조작. 명령은 선택한 음 전체에 적용된다.
import { store, TECH_LABEL } from './state.js';
import { candidates } from './tab.js';
import { tidy } from './rhythm.js';
import { RULER, TOP, TAB_GAP } from './view.js';

export class Editor {
  constructor(view, transport, notify) {
    Object.assign(this, { view, tr: transport, notify });
    this.clip = [];
    this.drag = null;
  }

  // ---------- 명령 ----------
  get step() { return store.snapStep || store.barLen / 64; }
  #each(fn, label) {
    const sel = store.selected(); if (!sel.length) return false;
    store.edit(() => sel.forEach(n => { fn(n); n.src = 'user'; }));
    if (label) this.notify(label);
    return true;
  }
  transpose(d) { if (this.#each(n => { n.midi = Math.max(20, Math.min(108, n.midi + d)); })) this.#hear(); }
  nudge(dir) { const d = dir * this.step; this.#each(n => { const dd = Math.max(-n.t, d); n.t += dd; n.te += dd; }); }
  resize(dir) { const d = dir * this.step; this.#each(n => { n.te = Math.max(n.t + this.step * 0.5, n.te + d); }); }
  quantize(scope = 'sel') {
    const q = n => { const len = n.te - n.t; n.t = store.snapT(n.t); n.te = Math.max(n.t + this.step * 0.5, store.snapT(n.t + len)); };
    if (scope === 'view') {
      store.edit(() => store.notes.filter(n => n.t >= this.view.s && n.t <= this.view.e).forEach(q));
      this.notify('보이는 음을 칸에 맞췄습니다');
    } else this.#each(q, '칸에 맞췄습니다');
  }
  // 박자 정리: 선택한 음(없으면 전체)을 박마다 맞는 칸에 붙이고 겹침·빈틈을 정리한다
  tidy() {
    const scope = store.sel.size ? store.selected() : store.notes;
    if (!scope.length) return;
    const out = tidy(scope, store.P), keep = new Map(out.map(n => [n.id, n])), ids = new Set(scope.map(n => n.id));
    let moved = 0;
    store.edit(() => {
      store.P.notes = store.notes.filter(n => !ids.has(n.id) || keep.has(n.id));
      for (const n of store.notes) {
        const o = keep.get(n.id); if (!o) continue;
        if (Math.abs(o.t - n.t) > 1e-4 || Math.abs(o.te - n.te) > 1e-4) moved++;
        Object.assign(n, { t: o.t, te: o.te, div: o.div });
      }
    });
    for (const id of [...store.sel]) if (!store.get(id)) store.sel.delete(id);
    this.notify(`박자 정리: ${scope.length}음 중 ${moved}음 손봄${scope.length - out.length ? `, 겹친 ${scope.length - out.length}음 합침` : ''} (⌘Z로 되돌리기)`, 4000);
  }
  remove() {
    const sel = store.selected(); if (!sel.length) return;
    const ns = store.byTime(), after = ns.find(n => n.t > sel.at(-1).t && !store.sel.has(n.id));
    store.edit(() => { store.P.notes = store.notes.filter(n => !store.sel.has(n.id)); });
    store.select(sel.length === 1 && after ? after.id : []);
    this.notify(`${sel.length}음 삭제`);
  }
  setTech(t) {
    const sel = store.selected(); if (!sel.length) return;
    const allOn = sel.every(n => n.tech === t);
    this.#each(n => { n.tech = allOn ? '' : t; if (n.tech === 'b' && !n.bend) n.bend = 2; }, `주법: ${allOn || !t ? '없음' : TECH_LABEL[t]}`);
  }
  setBend(semi) { this.#each(n => { n.tech = 'b'; n.bend = semi; }, `벤딩 ${semi === 1 ? '½' : semi === 2 ? 'full' : semi / 2 + '음'}`); }
  setString(s) {
    // 그 줄로 칠 수 없는 음은 건너뛰고 알려 준다
    const bad = s ? store.selected().filter(n => !candidates(n.midi, undefined, store.P.maxFret).some(c => c.string === s)) : [];
    this.#each(n => { if (!bad.includes(n)) n.lockString = s || null; },
      !s ? '줄 자동 배치' : bad.length ? `${s}번 줄로 고정 (그 줄로 칠 수 없는 ${bad.length}음은 그대로)` : `${s}번 줄로 고정`);
  }
  copy() {
    const sel = store.selected().sort((a, b) => a.t - b.t); if (!sel.length) return;
    const t0 = sel[0].t; this.clip = sel.map(({ id, ...n }) => ({ ...n, t: n.t - t0, te: n.te - t0 }));
    this.notify(`${sel.length}음 복사`);
  }
  paste(at = this.tr.clock()) {
    if (!this.clip.length) return;
    const t0 = store.snapT(at), made = this.clip.map(n => store.makeNote({ ...n, t: t0 + n.t, te: t0 + n.te }));
    store.edit(() => store.P.notes.push(...made));
    store.select(made.map(n => n.id));
    this.notify(`${made.length}음 붙여넣기`);
  }
  duplicate() {
    const sel = store.selected().sort((a, b) => a.t - b.t); if (!sel.length) return;
    const span = Math.max(...sel.map(n => n.te)) - sel[0].t;
    const made = sel.map(({ id, ...n }) => store.makeNote({ ...n, t: n.t + span, te: n.te + span }));
    store.edit(() => store.P.notes.push(...made));
    store.select(made.map(n => n.id));
  }
  addAt(t, midi) {
    const n = store.makeNote({ t: Math.max(0, store.snapT(t)), te: Math.max(0, store.snapT(t)) + (store.snapStep || store.barLen / 16), midi });
    store.edit(() => store.P.notes.push(n));
    store.select(n.id); this.tr.audition(n);
    return n;
  }
  addAtCursor() { this.addAt(this.tr.clock(), store.primary()?.midi ?? 64); }
  selectNeighbor(dir, add = false) {
    const ns = store.byTime(); if (!ns.length) return;
    const cur = dir > 0 ? store.selected().sort((a, b) => b.t - a.t)[0] : store.primary();
    const i = cur ? ns.indexOf(cur) : -1;
    const n = i < 0 ? ns.find(n => n.t >= this.view.s) || ns[0] : ns[Math.max(0, Math.min(ns.length - 1, i + dir))];
    store.select(n.id, { add }); this.tr.audition(n); this.view.reveal(n.t);
  }
  selectAllInView() { store.select(store.notes.filter(n => n.t >= this.view.s && n.t <= this.view.e).map(n => n.id)); }
  #hear() { const n = store.primary(); if (n) this.tr.audition(n); }

  // ---------- 마우스: 피아노 롤 ----------
  attach() {
    const { roll, tabC, ov } = this.view, v = this.view;
    const pos = (e, c) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    roll.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const [x, y] = pos(e, roll);
      if (y < RULER) { this.drag = { kind: 'ruler', x0: x, t0: Math.max(0, v.T(x)) }; return; }
      if (y < TOP) { this.tr.seek(Math.max(0, v.T(x))); return; }
      const h = v.hit(x, y);
      if (!h) { this.drag = { kind: 'box', x0: x, y0: y, add: e.shiftKey || e.metaKey }; v.box = { x0: x, y0: y, x1: x, y1: y }; return; }
      if (e.shiftKey || e.metaKey) { store.toggle(h.n.id); if (!store.sel.has(h.n.id)) return; }
      else if (!store.sel.has(h.n.id)) store.select(h.n.id);
      this.tr.audition(h.n);
      const group = store.selected().map(n => ({ n, t: n.t, te: n.te, midi: n.midi }));
      store.checkpoint();
      v.pinRange = [v.lo, v.hi];
      this.drag = { kind: 'note', part: h.part, anchor: h.n, x0: x, y0: y, group, moved: false };
    });
    addEventListener('mousemove', e => {
      const [x, y] = pos(e, roll), d = this.drag;
      if (!d) {
        const h = y >= TOP && v.hit(x, y);
        roll.style.cursor = y < RULER ? 'col-resize' : y < TOP ? 'pointer' : !h ? 'crosshair' : h.part === 'mid' ? 'grab' : 'ew-resize';
        return;
      }
      if (d.kind === 'ruler') { if (Math.abs(x - d.x0) > 3) { v.ghostLoop = { a: d.t0, b: Math.max(0, v.T(x)) }; if (v.ghostLoop.a > v.ghostLoop.b) v.ghostLoop = { a: v.ghostLoop.b, b: v.ghostLoop.a }; v.draw(); } return; }
      if (d.kind === 'box') { v.box.x1 = x; v.box.y1 = y; v.draw(); return; }
      if (Math.abs(x - d.x0) + Math.abs(y - d.y0) > 2) d.moved = true;
      if (!d.moved) return;
      const free = e.shiftKey, dt = v.T(x) - v.T(d.x0), minLen = Math.max(0.02, (store.snapStep || 0.05) * 0.5);
      const a = d.group.find(g => g.n === d.anchor);
      if (d.part === 'mid') {
        // 잡은 음의 시작을 칸에 맞추고 같은 만큼 묶음 전체를 옮긴다
        const shift = Math.max(-Math.min(...d.group.map(g => g.t)), store.snapT(a.t + dt, free) - a.t);
        const dm = Math.round((d.y0 - y) / v.rh);
        const before = d.anchor.midi;
        for (const g of d.group) { g.n.t = g.t + shift; g.n.te = g.te + shift; g.n.midi = Math.max(20, Math.min(108, g.midi + dm)); g.n.src = 'user'; }
        if (d.anchor.midi !== before) this.tr.audition(d.anchor);
      } else if (d.part === 'r') {
        const de = store.snapT(a.te + dt, free) - a.te;
        for (const g of d.group) { g.n.te = Math.max(g.t + minLen, g.te + de); g.n.src = 'user'; }
      } else {
        const ds = store.snapT(a.t + dt, free) - a.t;
        for (const g of d.group) { g.n.t = Math.max(0, Math.min(g.te - minLen, g.t + ds)); g.n.src = 'user'; }
      }
      store.retab(); v.draw();
    });
    addEventListener('mouseup', e => {
      const d = this.drag; if (!d) return;
      this.drag = null;
      if (d.kind === 'ruler') {
        if (v.ghostLoop) { this.tr.setLoop(v.ghostLoop.a, v.ghostLoop.b, true); v.ghostLoop = null; this.notify('반복 구간을 정했습니다 (L로 켜고 끄기)'); }
        else this.tr.seek(d.t0);
        return;
      }
      if (d.kind === 'box') {
        const b = v.box; v.box = null;
        if (Math.abs(b.x1 - b.x0) + Math.abs(b.y1 - b.y0) < 4) { if (!d.add) store.clearSel(); if (!this.tr.playing) this.tr.seek(Math.max(0, v.T(b.x0))); }
        else store.select(v.notesInBox(b), { add: d.add });
        v.draw(); return;
      }
      v.pinRange = null;
      if (d.moved) store.changed(); else { store.undoStack.pop(); v.draw(); }
    });
    roll.addEventListener('dblclick', e => {
      const [x, y] = pos(e, roll); if (y < TOP || v.hit(x, y)) return;
      this.addAt(v.T(x), v.M(y));
    });
    roll.addEventListener('wheel', e => {
      e.preventDefault();
      const [x] = pos(e, roll);
      if (e.metaKey || e.ctrlKey) return v.zoom(Math.exp(e.deltaY * 0.004), v.T(x));
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      v.scrollBy(dx / v.w * v.span);
    }, { passive: false });
    roll.addEventListener('contextmenu', e => e.preventDefault());

    // ---------- TAB 줄: 숫자를 위아래로 끌면 줄이 바뀐다 ----------
    tabC.addEventListener('mousedown', e => {
      const [x, y] = pos(e, tabC), n = v.hitTab(x, y);
      if (!n) { store.clearSel(); return; }
      store.select(n.id, { add: e.shiftKey }); this.tr.audition(n);
      const src = store.get(n.id), y0 = y;
      const move = ev => {
        const [, yy] = pos(ev, tabC), s = Math.max(1, Math.min(6, n.string + Math.round((yy - y0) / TAB_GAP)));
        const cur = store.tab.get(n.id)?.string;
        if (s !== cur && candidates(src.midi, undefined, store.P.maxFret).some(c => c.string === s)) { store.edit(() => { src.lockString = s; }); }
      };
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
      addEventListener('mousemove', move); addEventListener('mouseup', up);
    });
    tabC.addEventListener('wheel', e => { e.preventDefault(); v.scrollBy((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / v.w * v.span); }, { passive: false });

    // ---------- 전체 개요 ----------
    const ovJump = e => { const [x] = pos(e, ov), t = x / ov.getBoundingClientRect().width * v.songEnd(), w = v.span; v.setView(t - w / 2, t + w / 2); };
    ov.addEventListener('mousedown', e => {
      ovJump(e);
      const move = ev => ovJump(ev), up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
      addEventListener('mousemove', move); addEventListener('mouseup', up);
    });
  }
}
