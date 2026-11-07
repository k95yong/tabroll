// 박자 정리와 리듬 표기. 화면과 무관한 순수 함수만 둔다.
//
// tidy(): 박마다 가장 잘 맞는 쪼개기(8분·셋잇단·16분·여섯잇단·32분)를 골라 음 시작을 붙이고,
//         단선율 기준으로 겹치는 음은 자르고 짧은 빈틈은 메운 뒤 끝도 칸에 맞춘다.
// notate(): 음마다 박 안 위치·쪼개기·길이(칸 수)·꼬리(beam) 개수를 계산한다. 인쇄용 TAB에서 쓴다.

// 쪼개기 후보: 한 박을 몇 칸으로 나누나. cost는 복잡한 쪼개기에 주는 벌점(읽기 쉬운 쪽을 고르게).
export const DIVS = [
  { div: 1, cost: 0 }, { div: 2, cost: 0 }, { div: 4, cost: 0.0004 },
  { div: 3, cost: 0.0012 }, { div: 6, cost: 0.002 }, { div: 8, cost: 0.003 },
];

const beatOf = (t, offset, beat) => Math.floor((t - offset) / beat + 1e-6);

// 한 박에 들어온 시작 시각들에 가장 잘 맞는 쪼개기를 고른다. 두 음이 같은 칸에 몰리면 큰 벌점.
export function bestDivision(starts, beatStart, beat, allowed = DIVS) {
  let best = null;
  for (const { div, cost } of allowed) {
    const slot = beat / div, used = new Set();
    let err = 0, clash = 0;
    for (const t of starts) {
      const k = Math.round((t - beatStart) / slot);
      err += ((t - beatStart - k * slot) / beat) ** 2;
      if (used.has(k)) clash++; used.add(k);
    }
    // 음이 한두 개뿐인 박에 잇단음표를 쓰면 읽기 어렵다: 셋잇단·여섯잇단에 벌점을 더 준다
    const sparse = starts.length <= 2 && (div === 3 || div === 6) ? 0.004 : 0;
    const score = err / Math.max(1, starts.length) + cost + sparse + clash * 0.05;
    if (!best || score < best.score - 1e-9) best = { div, score };
  }
  return best.div;
}

export function tidy(notes, { bpm, offset, gapFill = 0.5, allowed = DIVS } = {}) {
  const beat = 60 / bpm;
  const ns = notes.map(n => ({ ...n })).sort((a, b) => a.t - b.t);
  // 1) 박마다 쪼개기를 정하고 시작을 붙인다
  const byBeat = new Map();
  for (const n of ns) { const b = beatOf(n.t + beat / 16, offset, beat); (byBeat.get(b) || byBeat.set(b, []).get(b)).push(n); }
  for (const [b, group] of byBeat) {
    const bs = offset + b * beat, div = bestDivision(group.map(n => n.t), bs, beat, allowed), slot = beat / div;
    for (const n of group) {
      let k = Math.round((n.t - bs) / slot);
      if (k >= div) k = div - 1; // 다음 박으로 넘어가지 않게
      n.t = bs + k * slot; n.div = div;
    }
  }
  ns.sort((a, b) => a.t - b.t);
  // 같은 칸에 같은 음이 겹치면 하나만 남긴다
  const out = [];
  for (const n of ns) {
    const prev = out.at(-1);
    if (prev && Math.abs(prev.t - n.t) < 1e-6 && prev.midi === n.midi) { prev.te = Math.max(prev.te, n.te); continue; }
    out.push(n);
  }
  // 2) 단선율: 겹치면 자르고, 다음 음까지 빈틈이 한 칸의 gapFill 배 이하이면 메운다. 끝은 칸에 맞춘다.
  for (let i = 0; i < out.length; i++) {
    const n = out[i], next = out[i + 1], slot = beat / (n.div || 4);
    let te = n.te;
    if (next && next.t > n.t + 1e-6) {
      if (te > next.t) te = next.t;
      const gap = next.t - te;
      if (gap > 0 && gap <= Math.max(slot * gapFill, 0.06)) te = next.t;
    }
    // 끝을 32분 격자에 맞추되, 다음 음을 넘지 않고 최소 한 칸(또는 다음 음까지)은 남긴다
    const g32 = beat / 8;
    te = offset + Math.round((te - offset) / g32) * g32;
    const limit = next && next.t > n.t + 1e-6 ? next.t : Infinity;
    n.te = Math.min(limit, Math.max(te, n.t + Math.min(slot, limit - n.t)));
  }
  return out;
}

// 칸 수 → 음표 이름과 꼬리 개수. 한 박 = 4분음표 기준.
function valueOf(beatsLen) {
  const table = [[4, '온', 0], [3, '점2분', 0], [2, '2분', 0], [1.5, '점4분', 0], [1, '4분', 0], [0.75, '점8분', 1], [0.5, '8분', 1], [0.375, '점16분', 2], [0.25, '16분', 2], [0.125, '32분', 3]];
  let best = table[0], d = Infinity;
  for (const row of table) { const e = Math.abs(Math.log2(beatsLen / row[0])); if (e < d) { d = e; best = row; } }
  return { name: best[1], beams: best[2], dotted: best[1].startsWith('점') };
}

export function notate(notes, { bpm, offset, beatsPerBar = 4 }) {
  const beat = 60 / bpm;
  const ns = [...notes].sort((a, b) => a.t - b.t);
  const byBeat = new Map();
  for (const n of ns) { const b = beatOf(n.t, offset, beat); (byBeat.get(b) || byBeat.set(b, []).get(b)).push(n); }
  const res = new Map();
  for (const [b, group] of byBeat) {
    const bs = offset + b * beat;
    const div = group[0].div || bestDivision(group.map(n => n.t), bs, beat);
    const tuplet = div === 3 || div === 6 ? div : 0;
    group.forEach((n, i) => {
      const next = group[i + 1], end = Math.min(n.te, next ? next.t : bs + beat);
      // 박 안의 음은 다음 음(또는 박 끝)까지를 표기 길이로 본다. 박을 넘는 긴 음은 실제 길이를 쓴다.
      const lenBeats = group.length === 1 && n.te - bs > beat * 0.99 ? (n.te - n.t) / beat : Math.max(1 / div, (end - n.t) / beat);
      const v = valueOf(tuplet ? lenBeats * tuplet / (tuplet === 3 ? 2 : 4) : lenBeats);
      res.set(n.id, {
        bar: Math.floor(b / beatsPerBar), beatInBar: ((b % beatsPerBar) + beatsPerBar) % beatsPerBar,
        pos: (n.t - bs) / beat, div, tuplet, beams: v.beams, value: v.name, dotted: v.dotted,
        groupKey: b, first: i === 0, last: i === group.length - 1,
      });
    });
  }
  return res;
}

// 아무 음도 울리지 않는 박(시작하는 음도, 이어지는 음도 없는 박)을 마디·박 번호로 돌려준다
export function restBeats(notes, { bpm, offset, beatsPerBar = 4 }) {
  const beat = 60 / bpm, out = [];
  if (!notes.length) return out;
  const first = Math.floor((Math.min(...notes.map(n => n.t)) - offset) / beat + 1e-6);
  const last = Math.floor((Math.max(...notes.map(n => n.te)) - offset) / beat - 1e-6);
  const b0 = Math.floor(first / beatsPerBar) * beatsPerBar, b1 = (Math.floor(last / beatsPerBar) + 1) * beatsPerBar;
  for (let b = b0; b < b1; b++) {
    const s = offset + b * beat, e = s + beat;
    if (!notes.some(n => n.t < e - 1e-6 && n.te > s + beat * 0.25)) out.push({ bar: Math.floor(b / beatsPerBar), beatInBar: b % beatsPerBar, t: s });
  }
  return out;
}
