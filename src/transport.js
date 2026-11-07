// 재생 시계: 원음(영상) 재생, 악보 음 예약, 메트로놈, 구간 반복.
import { store } from './state.js';

export class Transport {
  constructor(media, synth) {
    this.media = media;
    this.synth = synth;
    this.playing = false;
    this.cursor = 0;
    this.rate = 1;
    this.mediaVol = 1;
    this.notesVol = 0.6;
    this.metro = false;
    this.loop = { on: false, a: 0, b: 0 };
    this.anchor = { perf: 0, t: 0 };
    this.voices = [];
    this.scheduled = new Set();
    this.timer = null;
    this.nextBeat = 0;
    this.listeners = new Set();
  }
  on(fn) { this.listeners.add(fn); }
  emit(kind) { for (const fn of this.listeners) fn(kind); }
  get hasMedia() { return !!this.media.src; }

  clock() {
    if (!this.playing) return this.cursor;
    return this.anchor.t + (performance.now() - this.anchor.perf) / 1000 * this.rate;
  }
  play(from = this.cursor) {
    this.synth.resume();
    if (this.loop.on && (from < this.loop.a || from >= this.loop.b)) from = this.loop.a;
    this.cursor = Math.max(0, from);
    this.playing = true;
    this.anchor = { perf: performance.now(), t: this.cursor };
    this.#silence();
    this.nextBeat = Math.ceil((this.cursor - store.P.offset) / store.beatLen - 1e-6);
    if (this.hasMedia) {
      Object.assign(this.media, { playbackRate: this.rate, preservesPitch: true, volume: this.mediaVol });
      this.media.currentTime = this.cursor;
      this.media.play().catch(() => {});
    }
    clearInterval(this.timer);
    this.timer = setInterval(() => this.#tick(), 25);
    this.#tick();
    this.emit('play');
  }
  stop() {
    if (!this.playing) return;
    this.cursor = this.clock();
    this.playing = false;
    clearInterval(this.timer);
    this.#silence();
    this.media.pause();
    this.emit('stop');
  }
  toggle(from) { this.playing ? this.stop() : this.play(from); }
  seek(t) {
    const was = this.playing;
    if (was) this.stop();
    this.cursor = Math.max(0, t);
    if (was) this.play(this.cursor); else this.emit('seek');
  }
  setRate(r) { const t = this.clock(); this.rate = r; if (this.playing) { this.stop(); this.play(t); } this.emit('rate'); }
  setMediaVol(v) { this.mediaVol = v; this.media.volume = v; this.emit('mix'); }
  setNotesVol(v) { this.notesVol = v; this.emit('mix'); }
  setLoop(a, b, on = true) { this.loop = { on: on && b - a > 0.05, a: Math.min(a, b), b: Math.max(a, b) }; this.emit('loop'); }
  toggleLoop(defaultRange) {
    if (!this.loop.on && this.loop.b - this.loop.a < 0.05 && defaultRange) this.setLoop(...defaultRange);
    else { this.loop.on = !this.loop.on; this.emit('loop'); }
  }

  // 선택한 음 하나를 짧게 들려준다
  audition(n, dur = 0.4) { this.synth.resume(); this.voices.push(this.synth.note(n.midi, { until: this.synth.now + dur, vel: 100 })); }

  #silence() { this.voices.forEach(v => v.stop()); this.voices = []; this.scheduled.clear(); }
  #tick() {
    let t = this.clock();
    // 영상과 시계가 벌어지면 영상에 맞춘다
    if (this.hasMedia && !this.media.paused && Math.abs(this.media.currentTime - t) > 0.08) {
      this.anchor = { perf: performance.now(), t: this.media.currentTime }; t = this.media.currentTime;
    }
    if (this.loop.on && t >= this.loop.b) { this.seek(this.loop.a); return; }
    if (this.hasMedia && this.media.ended) { this.stop(); return; }
    const s = this.synth, horizon = t + 0.25 * this.rate;
    s.volume = this.notesVol;
    if (this.notesVol > 0) for (const n of store.notes) {
      if (n.t < t - 0.01 || n.t >= horizon || this.scheduled.has(n.id)) continue;
      this.scheduled.add(n.id);
      const legato = n.tech === 'h' || n.tech === 'p' || n.tech === 's';
      const prev = n.tech === 's' ? store.prevNote(n) : null;
      this.voices.push(s.note(n.midi, {
        when: s.now + (n.t - t) / this.rate, until: s.now + (n.te - t) / this.rate, vel: n.vel,
        bendTo: n.tech === 'b' ? n.midi + (n.bend || 2) : null, vibrato: n.tech === 'v',
        legato, glideFrom: prev ? prev.midi : null,
      }));
    }
    if (this.metro) {
      const P = store.P;
      for (let bt = P.offset + this.nextBeat * store.beatLen; bt < horizon; bt = P.offset + ++this.nextBeat * store.beatLen) {
        if (bt >= t - 0.01) s.click(s.now + (bt - t) / this.rate, ((this.nextBeat % P.beatsPerBar) + P.beatsPerBar) % P.beatsPerBar === 0);
      }
    }
    if (this.voices.length > 96) this.voices = this.voices.slice(-48);
    this.emit('tick');
  }
}
