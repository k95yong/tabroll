// 음(midi)을 기타 줄·프렛에 배치하고 TAB 텍스트를 만든다.
// 줄 번호는 1(가장 높은 e)부터 6(가장 낮은 E)까지.

export const STANDARD_TUNING = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
export const STRING_NAMES = { 1: 'e', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' };

export function candidates(midi, tuning = STANDARD_TUNING, maxFret = 22) {
  const out = [];
  for (let s = 1; s <= 6; s++) {
    const f = midi - tuning[s];
    if (f >= 0 && f <= maxFret) out.push({ string: s, fret: f });
  }
  return out;
}

// 손 위치 이동이 가장 적은 운지를 동적 계획법으로 고른다.
// note.lockString 이 있으면 그 줄만 후보로 쓴다.
export function assignFrets(notes, opts = {}) {
  const tuning = opts.tuning || STANDARD_TUNING;
  const maxFret = opts.maxFret ?? 22;
  const pref = opts.preferFret ?? 7; // 아무 정보 없을 때 선호하는 손 위치
  const sorted = [...notes].sort((a, b) => a.t - b.t);
  if (!sorted.length) return [];

  const cand = sorted.map(n => {
    let c = candidates(n.midi, tuning, maxFret);
    if (n.lockString) {
      const only = c.filter(x => x.string === n.lockString);
      if (only.length) c = only;
    }
    return c.length ? c : [{ string: 0, fret: -1 }]; // 칠 수 없는 음
  });

  // 상태 = (운지 후보, 검지 위치 H). 한 손 자세에서 H..H+3 프렛은 손을 옮기지 않고 누른다.
  // 손 위치 이동에 비용을 주면, 두 음씩만 비교할 때 생기던 '손이 조금씩 미끄러지는' 배치가 사라진다.
  const states = (c, prevHs) => {
    if (c.fret < 0) return [{ c, H: prevHs[0] ?? pref, pen: 100 }];
    if (c.fret === 0) return (prevHs.length ? prevHs : [pref]).map(H => ({ c, H, pen: 0 }));
    const out = [];
    for (let H = Math.max(1, c.fret - 4); H <= c.fret; H++) out.push({ c, H, pen: c.fret - H === 4 ? 0.4 : 0 });
    return out;
  };
  const local = st => st.pen + 0.015 * Math.abs(st.H - pref) + (st.c.fret > 17 ? 0.3 : 0);
  const move = (a, b, gap) => {
    const relax = gap > 0.6 ? 0.35 : 1; // 쉼이 길면 손을 옮겨도 부담이 적다
    const d = Math.abs(a.H - b.H);
    return (d ? (0.6 + 0.35 * d) * relax : 0) + 0.06 * Math.abs(a.c.string - b.c.string);
  };

  let layer = cand[0].flatMap(c => states(c, []));
  let cost = layer.map(local);
  const backs = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = Math.max(0, sorted[i].t - sorted[i - 1].te);
    const prevHs = [...new Set(layer.map(s => s.H))];
    const next = cand[i].flatMap(c => states(c, prevHs));
    const nc = [], bk = [];
    next.forEach(st => {
      let best = Infinity, arg = 0;
      layer.forEach((ps, k) => { const v = cost[k] + move(ps, st, gap); if (v < best) { best = v; arg = k; } });
      nc.push(best + local(st)); bk.push(arg);
    });
    backs.push({ layer, bk });
    layer = next; cost = nc;
  }
  let j = cost.indexOf(Math.min(...cost));
  const pick = new Array(sorted.length);
  for (let i = sorted.length - 1; i >= 0; i--) {
    pick[i] = layer[j].c;
    if (i > 0) { const { layer: pl, bk } = backs[i - 1]; j = bk[j]; layer = pl; }
  }
  return sorted.map((n, i) => ({ ...n, string: pick[i].string, fret: pick[i].fret }));
}

const TECH_MARK = { h: 'h', p: 'p', b: 'b', r: 'r', s: '/', v: '~', x: 'x' };

// 마디별 ASCII TAB. grid: 마디당 칸 수(16 = 16분음표).
export function asciiTab(notes, { bpm, offset, beatsPerBar = 4, grid = 16, barsPerLine = 2, title = '' }) {
  const barLen = 60 / bpm * beatsPerBar;
  const placed = notes.filter(n => n.fret >= 0 && n.string);
  if (!placed.length) return title ? `${title}\n(음 없음)\n` : '(음 없음)\n';
  const barOf = t => Math.floor((t - offset) / barLen + 1e-6);
  const first = Math.max(0, Math.min(...placed.map(n => barOf(n.t))));
  const last = Math.max(...placed.map(n => barOf(n.t)));
  const lines = [];
  if (title) lines.push(title, '');
  for (let b0 = first; b0 <= last; b0 += barsPerLine) {
    const rows = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' };
    let header = '  ';
    for (let b = b0; b < b0 + barsPerLine && b <= last; b++) {
      const cells = Array.from({ length: grid }, () => ({}));
      for (const n of placed) {
        if (barOf(n.t) !== b) continue;
        const k = Math.min(grid - 1, Math.max(0, Math.round(((n.t - offset) / barLen - b) * grid)));
        const mark = TECH_MARK[n.tech] || '';
        // 슬라이드는 도착 음 앞에, 나머지 기호는 프렛 뒤에 붙인다
        cells[k][n.string] = n.tech === 's' ? '/' + n.fret : n.fret + mark;
      }
      const widths = cells.map(c => Math.max(1, ...Object.values(c).map(v => v.length)));
      for (let s = 1; s <= 6; s++) {
        rows[s] += '|' + cells.map((c, k) => (c[s] || '').padEnd(widths[k], '-') + '-').join('');
      }
      const barHeader = String(b + 1).padEnd(widths.reduce((a, w) => a + w + 1, 0) + 1, ' ');
      header += barHeader;
    }
    lines.push(header);
    for (let s = 1; s <= 6; s++) lines.push(STRING_NAMES[s] + rows[s] + '|');
    lines.push('');
  }
  return lines.join('\n');
}
