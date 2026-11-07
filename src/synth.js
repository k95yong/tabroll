// 악보 확인용 간단한 리드 기타 톤과 메트로놈.

export class Synth {
  constructor() {
    this.ctx = new AudioContext();
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.5;
    // 살짝 찌그러뜨려 실로폰처럼 들리지 않게 한다
    this.shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(2.2 * x); }
    this.shaper.curve = curve;
    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = 'lowpass'; this.lp.frequency.value = 3200;
    this.shaper.connect(this.lp).connect(this.out).connect(this.ctx.destination);
  }

  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  get now() { return this.ctx.currentTime; }
  set volume(v) { this.out.gain.value = v; }

  // when/until 은 AudioContext 시간. until 이 없으면 stop()으로 끈다.
  note(midi, { when = this.now, until = null, vel = 96, bendTo = null, vibrato = false } = {}) {
    const ctx = this.ctx, f = 440 * 2 ** ((midi - 69) / 12);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), mix = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'triangle';
    o1.frequency.setValueAtTime(f, when); o2.frequency.setValueAtTime(f, when);
    o2.detune.value = 4;
    mix.gain.value = 0.35;
    o1.connect(mix); o2.connect(g); mix.connect(g); g.connect(this.shaper);
    const a = 0.35 * (vel / 127);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(a, when + 0.006);
    g.gain.exponentialRampToValueAtTime(a * 0.6, when + 0.5);
    if (bendTo != null && until) {
      const f2 = 440 * 2 ** ((bendTo - 69) / 12), t2 = when + Math.min(0.12, (until - when) * 0.4);
      for (const o of [o1, o2]) o.frequency.linearRampToValueAtTime(f2, t2);
    }
    let lfo = null;
    if (vibrato) {
      lfo = ctx.createOscillator(); const depth = ctx.createGain();
      lfo.frequency.value = 5.5; depth.gain.value = 30; // 약 ±0.3반음
      lfo.connect(depth); depth.connect(o1.detune); depth.connect(o2.detune);
      lfo.start(when + 0.08);
    }
    o1.start(when); o2.start(when);
    const stop = (t = this.now) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0.0001, t, 0.03);
      for (const o of [o1, o2, lfo]) if (o) o.stop(t + 0.2);
    };
    if (until) stop(Math.max(until, when + 0.04));
    return { stop };
  }

  click(when, accent = false) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = accent ? 1600 : 1000;
    g.gain.setValueAtTime(0.25, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g).connect(this.ctx.destination);
    o.start(when); o.stop(when + 0.06);
  }
}
