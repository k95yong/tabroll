// 표준 MIDI 파일(SMF) 읽기·쓰기. 단선율 리드 편집에 필요한 만큼만 다룬다.

const PPQ = 480;

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

export function writeMidi(notes, bpm = 120) {
  const tick = t => Math.max(0, Math.round(t * bpm / 60 * PPQ));
  const ev = [];
  for (const n of notes) {
    ev.push({ at: tick(n.t), on: true, midi: n.midi, vel: n.vel ?? 96 });
    ev.push({ at: Math.max(tick(n.t) + 1, tick(n.te)), on: false, midi: n.midi, vel: 0 });
  }
  ev.sort((a, b) => a.at - b.at || (a.on - b.on)); // 같은 시점이면 note-off 먼저
  const tempo = Math.round(60e6 / bpm);
  const track = [0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255,
    0, 0xc0, 29]; // 오버드라이브 기타
  let last = 0;
  for (const e of ev) {
    track.push(...vlq(e.at - last), e.on ? 0x90 : 0x80, e.midi & 127, e.vel & 127);
    last = e.at;
  }
  track.push(0, 0xff, 0x2f, 0);
  const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const head = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (PPQ >> 8) & 255, PPQ & 255];
  return new Uint8Array([...head, 0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track]);
}

export function readMidi(buf) {
  const d = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);
  let p = 0;
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p++)); return s; };
  const u32 = () => { const v = d.getUint32(p); p += 4; return v; };
  const u16 = () => { const v = d.getUint16(p); p += 2; return v; };
  const vl = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  if (str(4) !== 'MThd') throw new Error('MIDI 파일이 아닙니다');
  const hl = u32(); u16(); const ntrk = u16(); const div = u16(); p += hl - 6;
  if (div & 0x8000) throw new Error('SMPTE 시간 단위는 지원하지 않습니다');
  const raw = [], tempos = [{ at: 0, us: 500000 }];
  for (let k = 0; k < ntrk && p < d.byteLength; k++) {
    if (str(4) !== 'MTrk') break;
    const end = u32() + p;
    let at = 0, status = 0;
    while (p < end) {
      at += vl();
      let b = d.getUint8(p);
      if (b & 0x80) { status = b; p++; }
      const type = status & 0xf0;
      if (status === 0xff) {
        const mt = d.getUint8(p++), len = vl();
        if (mt === 0x51) tempos.push({ at, us: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2) });
        p += len;
      } else if (status === 0xf0 || status === 0xf7) { p += vl(); }
      else if (type === 0xc0 || type === 0xd0) p += 1;
      else {
        const a = d.getUint8(p++), v = d.getUint8(p++);
        if (type === 0x90 || type === 0x80) raw.push({ at, ch: status & 15, midi: a, on: type === 0x90 && v > 0, vel: v });
      }
    }
    p = end;
  }
  tempos.sort((a, b) => a.at - b.at);
  const sec = at => {
    let s = 0, prev = 0, us = 500000;
    for (const t of tempos) { if (t.at > at) break; s += (t.at - prev) / div * us / 1e6; prev = t.at; us = t.us; }
    return s + (at - prev) / div * us / 1e6;
  };
  raw.sort((a, b) => a.at - b.at);
  const open = new Map(), notes = [];
  for (const e of raw) {
    const key = e.ch * 128 + e.midi;
    if (e.on) open.set(key, e);
    else if (open.has(key)) { const s = open.get(key); open.delete(key); notes.push({ t: sec(s.at), te: sec(e.at), midi: e.midi, vel: s.vel }); }
  }
  const bpm = Math.round(60e6 / (tempos.find(t => t.at === 0 && t.us !== 500000)?.us || tempos.at(-1).us));
  return { notes: notes.sort((a, b) => a.t - b.t), bpm };
}
