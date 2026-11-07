// 오른쪽 패널: 선택한 음의 높이·줄·주법·시간을 숫자로 고친다.
import { store, noteName, TECH_LABEL, TECHS } from './state.js';
import { candidates, STRING_NAMES } from './tab.js';
import { legatoOk } from './view.js';

const opt = (v, label, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;

export class Inspector {
  constructor(el, editor, transport) {
    Object.assign(this, { el, ed: editor, tr: transport });
    el.addEventListener('change', e => this.#apply(e.target));
    el.addEventListener('click', e => {
      const st = e.target.closest('[data-str]');
      if (st) { const n = store.primary(); if (n) { store.edit(() => { n.lockString = +st.dataset.str; n.src = 'user'; }); this.tr.audition(n); } return; }
      const b = e.target.closest('[data-act]'); if (b) this.#act(b.dataset.act);
    });
  }

  render() {
    const sel = store.selected();
    if (!sel.length) { this.el.innerHTML = this.#summary(); return; }
    if (sel.length > 1) { this.el.innerHTML = this.#multi(sel); return; }
    const n = sel[0], tab = store.tab.get(n.id) || {}, pos = store.beatPos(n.t);
    const pitches = []; for (let m = n.midi + 12; m >= n.midi - 12; m--) pitches.push(opt(m, noteName(m), n.midi));
    const strings = candidates(n.midi, undefined, store.P.maxFret);
    this.el.innerHTML = `
      <h4>선택한 음</h4>
      <div class="big">${noteName(n.midi)} <span>${tab.string ? `${tab.string}번 줄 ${tab.fret}프렛` : '칠 수 없는 음'}</span></div>
      <label>음높이 <select data-f="midi">${pitches.join('')}</select></label>
      <label>줄 <select data-f="lockString">${opt('', `자동 (${tab.string ? STRING_NAMES[tab.string] + ' ' + tab.fret : '-'})`, n.lockString || '')}${strings.map(c => opt(c.string, `${c.string}번 ${STRING_NAMES[c.string]} · ${c.fret}프렛`, n.lockString || '')).join('')}</select></label>
      <div class="strings">${strings.map(c => `<button data-str="${c.string}" class="${c.string === tab.string ? 'on' : ''}" title="${c.string}번 줄 ${c.fret}프렛">${c.string}<small>${STRING_NAMES[c.string]}·${c.fret}</small></button>`).join('')}</div>
      <button data-act="same" title="곡 전체에서 ${noteName(n.midi)} 음을 지금 줄(${tab.string}번)로 맞춤 (G)">같은 ${noteName(n.midi)} 전부 ${tab.string}번 줄로</button>
      <label>주법 <select data-f="tech">${opt('', '없음', n.tech)}${TECHS.map(t => opt(t, TECH_LABEL[t], n.tech)).join('')}</select></label>
      ${n.tech === 'b' ? `<label>벤딩 <select data-f="bend">${[1, 2, 3, 4].map(b => opt(b, { 1: '½음', 2: '1음 (full)', 3: '1½음', 4: '2음' }[b], n.bend || 2)).join('')}</select></label>` : ''}
      ${['h', 'p', 's'].includes(n.tech) && !legatoOk(tab, store.prevNote(n) && store.tab.get(store.prevNote(n).id)) ? `<p class="warn">⚠ ${TECH_LABEL[n.tech]}: 앞 음과 같은 줄${n.tech === 'h' ? '에서 높은 프렛' : n.tech === 'p' ? '에서 낮은 프렛' : ''}이어야 자연스럽습니다</p><button data-act="fixleg">앞 음과 같은 줄로 맞추기</button>` : ''}
      <label>시작(초) <input data-f="t" type="number" step="0.005" value="${n.t.toFixed(3)}"></label>
      <label>길이(초) <input data-f="len" type="number" step="0.005" min="0.01" value="${(n.te - n.t).toFixed(3)}"></label>
      <label>세기 <input data-f="vel" type="range" min="20" max="127" value="${n.vel}"></label>
      <p class="dim">${pos.bar}마디 ${pos.beat.toFixed(2)}박 · ${{ user: '직접 고친 음', rec: '건반 녹음', import: '불러온 음', midi: 'MIDI' }[n.src] || ''}</p>
      <div class="acts"><button data-act="hear">▶ 듣기</button><button data-act="dup">복제</button><button data-act="del" class="danger">삭제</button></div>`;
  }
  #summary() {
    const P = store.P, ns = store.notes, unplayable = [...store.tab.values()].filter(n => n.fret < 0).length;
    return `<h4>${P.title || '새 채보'}</h4>
      <p>음 ${ns.length}개 · ♩=${P.bpm} · ${P.beatsPerBar}/4 · 칸 ${store.snap ? store.snap + '분' : '자유'}</p>
      ${unplayable ? `<p class="warn">기타로 칠 수 없는 음 ${unplayable}개 (TAB에 빨간 ?)</p>` : ''}
      <p class="dim">음을 클릭하거나 빈 곳을 끌어 여러 음을 고르면 여기서 고칠 수 있습니다.<br><kbd>?</kbd> 단축키 보기</p>`;
  }
  #multi(sel) {
    const t0 = Math.min(...sel.map(n => n.t)), t1 = Math.max(...sel.map(n => n.te));
    return `<h4>${sel.length}음 선택</h4>
      <p class="dim">${t0.toFixed(2)}s ~ ${t1.toFixed(2)}s · ${[...new Set(sel.map(n => noteName(n.midi)))].join(' ')}</p>
      <div class="acts wrap">
        <button data-act="up">반음 ↑</button><button data-act="down">반음 ↓</button>
        <button data-act="oup">옥타브 ↑</button><button data-act="odown">옥타브 ↓</button>
        <button data-act="quant">칸에 맞추기</button><button data-act="auto">줄 자동</button>
        <button data-act="sup" title="⌥↑">줄 ↑ (가는 줄)</button><button data-act="sdown" title="⌥↓">줄 ↓ (굵은 줄)</button>
        <button data-act="same">같은 음 전부 같은 줄로</button>
        <button data-act="notech">주법 지우기</button><button data-act="copy">복사</button>
        <button data-act="loop">이 구간 반복</button><button data-act="del" class="danger">삭제</button>
      </div>`;
  }
  #apply(el) {
    const f = el.dataset.f, n = store.primary(); if (!f || !n) return;
    const v = el.value;
    store.edit(() => {
      if (f === 'midi') n.midi = +v;
      else if (f === 'lockString') n.lockString = v ? +v : null;
      else if (f === 'tech') { n.tech = v; if (v === 'b' && !n.bend) n.bend = 2; }
      else if (f === 'bend') n.bend = +v;
      else if (f === 't') { const len = n.te - n.t; n.t = Math.max(0, +v); n.te = n.t + len; }
      else if (f === 'len') n.te = n.t + Math.max(0.01, +v);
      else if (f === 'vel') n.vel = +v;
      n.src = 'user';
    });
    if (f === 'midi') this.tr.audition(n);
  }
  #act(a) {
    const ed = this.ed;
    ({
      hear: () => store.selected().forEach(n => this.tr.audition(n)),
      dup: () => ed.duplicate(), del: () => ed.remove(), copy: () => ed.copy(),
      fixleg: () => {
        const n = store.primary(), prev = n && store.prevNote(n); if (!prev) return;
        const ps = store.tab.get(prev.id)?.string;
        if (candidates(n.midi, undefined, store.P.maxFret).some(c => c.string === ps)) store.edit(() => { n.lockString = ps; });
        else { const s = store.tab.get(n.id)?.string; if (candidates(prev.midi, undefined, store.P.maxFret).some(c => c.string === s)) store.edit(() => { prev.lockString = s; }); }
      },
      same: () => ed.setStringSamePitch(), sup: () => ed.cycleString(-1), sdown: () => ed.cycleString(1),
      up: () => ed.transpose(1), down: () => ed.transpose(-1), oup: () => ed.transpose(12), odown: () => ed.transpose(-12),
      quant: () => ed.quantize('sel'), auto: () => ed.setString(0), notech: () => ed.setTech(''),
      loop: () => { const s = store.selected(); this.tr.setLoop(Math.min(...s.map(n => n.t)) - 0.1, Math.max(...s.map(n => n.te)) + 0.1, true); },
    })[a]?.();
  }
}
