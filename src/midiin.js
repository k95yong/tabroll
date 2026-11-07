// MIDI 건반: 누르면 소리를 내고, 녹음 중이면 음을 기록한다. 녹음 중이 아닐 때 음을 선택해 두면 그 음의 높이를 바꾼다.
import { store } from './state.js';

export class MidiInput {
  constructor(transport, synth, { onState, onRec, view }) {
    Object.assign(this, { tr: transport, synth, onState, onRec, view });
    this.rec = false;
    this.held = new Map();
    this.monitor = new Map();
    Object.defineProperty(view, 'held', { get: () => [...this.held.values()] });
    transport.on(kind => { if (kind === 'stop') this.flush(); });
    if (!navigator.requestMIDIAccess) { onState('이 브라우저는 MIDI 건반을 지원하지 않습니다', false); return; }
    navigator.requestMIDIAccess().then(acc => {
      const bind = () => {
        const names = []; acc.inputs.forEach(i => { i.onmidimessage = e => this.#msg(e); names.push(i.name); });
        onState(names.length ? `🎹 ${names[0]}` : '건반 없음 (마우스·키보드로 편집)', names.length > 0);
      };
      bind(); acc.onstatechange = bind;
    }, () => onState('건반 권한 없음', false));
  }
  toggleRec() { this.rec = !this.rec; this.onRec(this.rec); }

  #msg(e) {
    const [st, note, vel] = e.data, type = st & 0xf0;
    if (type === 0x90 && vel > 0) {
      this.synth.resume();
      this.monitor.get(note)?.stop(); this.monitor.set(note, this.synth.note(note, { vel }));
      if (this.rec && this.tr.playing) this.held.set(note, { t: this.tr.clock(), midi: note, vel });
      else if (!this.rec && store.sel.size === 1) { const n = store.primary(); store.edit(() => { n.midi = note; n.src = 'user'; }); }
    } else if (type === 0x80 || (type === 0x90 && vel === 0)) {
      this.monitor.get(note)?.stop(); this.monitor.delete(note);
      const h = this.held.get(note); this.held.delete(note);
      if (h) this.#add({ ...h, te: this.tr.clock() });
    }
  }
  #add(h) {
    if (h.te - h.t < 0.03) return;
    store.edit(() => {
      // 단선율: 새 음과 겹치는 앞 녹음 음은 새 음 직전에서 끊는다
      for (const n of store.notes) if (n.src === 'rec' && n.t < h.t && n.te > h.t) n.te = h.t;
      store.P.notes.push(store.makeNote({ ...h, src: 'rec' }));
    });
  }
  flush() { const t = this.tr.clock(); for (const h of this.held.values()) this.#add({ ...h, te: t }); this.held.clear(); }
}
