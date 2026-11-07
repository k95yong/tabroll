// 프로젝트 데이터, 선택, 되돌리기, 박자 계산. 화면·소리와 무관한 순수 상태만 둔다.
import { assignFrets } from './tab.js';

export const TECHS = ['h', 'p', 'b', 'r', 's', 'v', 'x'];
export const TECH_LABEL = { h: '해머링', p: '풀링', b: '벤딩', r: '릴리즈', s: '슬라이드', v: '비브라토', x: '뮤트' };
const NN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = m => NN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function blankProject() {
  return { app: 'tabroll', version: 1, title: '새 채보', bpm: 120, offset: 0, beatsPerBar: 4, maxFret: 22, notes: [], media: null };
}

// 바깥에서 들어온 음 하나를 내부 형식으로 정리한다
export function normalizeNote(n, id) {
  return {
    id, t: +n.t, te: Math.max(+n.t + 0.01, +(n.te ?? n.t + 0.2)), midi: Math.round(n.midi), vel: n.vel ?? 96,
    tech: TECHS.includes(n.tech) ? n.tech : '', bend: n.bend ?? (n.tech === 'b' ? 2 : 0),
    lockString: n.lockString >= 1 && n.lockString <= 6 ? n.lockString : null, src: n.src || 'import',
    ...(n.div ? { div: n.div } : {}), // 박자 정리에서 정한 그 박의 쪼개기
  };
}

class Store {
  constructor() {
    this.P = blankProject();
    this.nextId = 1;
    this.sel = new Set();
    this.snap = 16;
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.tab = new Map();
    this.listeners = new Set();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind) { for (const fn of this.listeners) fn(kind); }

  // ---- 박자 ----
  get barLen() { return 60 / this.P.bpm * this.P.beatsPerBar; }
  get beatLen() { return 60 / this.P.bpm; }
  barStart(b) { return this.P.offset + (b - 1) * this.barLen; } // b는 1부터
  barAt(t) { return Math.floor((t - this.P.offset) / this.barLen + 1e-6) + 1; }
  get snapStep() { return this.snap ? this.barLen / (this.snap * this.P.beatsPerBar / 4) : 0; }
  snapT(t, free = false) {
    const s = this.snapStep; if (!s || free) return t;
    const b0 = this.barStart(this.barAt(t));
    return b0 + Math.round((t - b0) / s) * s;
  }
  beatPos(t) { const b = this.barAt(t); return { bar: b, beat: (t - this.barStart(b)) / this.beatLen + 1 }; }

  // ---- 음 ----
  get notes() { return this.P.notes; }
  byTime() { return [...this.P.notes].sort((a, b) => a.t - b.t || a.midi - b.midi); }
  get(id) { return this.P.notes.find(n => n.id === id); }
  // 바로 앞 음 (해머링·풀링·슬라이드가 어느 음에서 이어지는지)
  prevNote(n) { let best = null; for (const m of this.P.notes) if (m !== n && m.t < n.t - 1e-6 && (!best || m.t > best.t)) best = m; return best; }
  selected() { return this.P.notes.filter(n => this.sel.has(n.id)); }
  primary() { const s = this.selected(); return s.length ? s.sort((a, b) => a.t - b.t)[0] : null; }
  makeNote(fields) { return normalizeNote({ src: 'user', ...fields }, this.nextId++); }

  select(ids, { add = false } = {}) {
    if (!add) this.sel.clear();
    for (const id of [].concat(ids)) if (id != null) this.sel.add(id);
    this.emit('select');
  }
  toggle(id) { this.sel.has(id) ? this.sel.delete(id) : this.sel.add(id); this.emit('select'); }
  clearSel() { if (this.sel.size) { this.sel.clear(); this.emit('select'); } }

  // ---- 변경 ----
  checkpoint() {
    this.undoStack.push(JSON.stringify(this.P.notes));
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
  }
  edit(fn) { this.checkpoint(); fn(); this.changed(); }
  changed(kind = 'notes') {
    this.dirty = true;
    this.retab();
    this.emit(kind);
  }
  undo() { this.#swap(this.undoStack, this.redoStack); }
  redo() { this.#swap(this.redoStack, this.undoStack); }
  #swap(from, to) {
    if (!from.length) return false;
    to.push(JSON.stringify(this.P.notes));
    this.P.notes = JSON.parse(from.pop());
    for (const id of [...this.sel]) if (!this.get(id)) this.sel.delete(id);
    this.changed();
    return true;
  }
  retab() { this.tab = new Map(assignFrets(this.P.notes, { maxFret: this.P.maxFret }).map(n => [n.id, n])); }

  setMeta(fields) { Object.assign(this.P, fields); this.changed('meta'); }

  // ---- 불러오기·저장 ----
  load(obj) {
    const notes = Array.isArray(obj) ? obj : obj.notes || [];
    const base = Array.isArray(obj) ? {} : obj;
    this.P = { ...blankProject(), ...base, notes: [] };
    this.nextId = 1;
    this.P.notes = notes.filter(n => isFinite(n.t) && isFinite(n.midi)).map(n => normalizeNote(n, this.nextId++));
    this.undoStack = []; this.redoStack = []; this.sel.clear(); this.dirty = false;
    this.retab();
    this.emit('load');
  }
  toJSON() {
    const notes = this.byTime().map(({ id, ...n }) => ({ ...n, t: +n.t.toFixed(4), te: +n.te.toFixed(4) }));
    return { ...this.P, notes, saved: new Date().toISOString() };
  }
}

export const store = new Store();
