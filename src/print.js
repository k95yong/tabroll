// 인쇄·PDF용 TAB 페이지.
// - 박마다 폭을 음 개수에 맞춰 정하고(빽빽한 박은 넓게), 마디를 한 줄에 들어가는 만큼 채운다.
// - TAB 아래에 박자 꼬리(기둥·빔)와 셋잇단·여섯잇단 표시를 그린다.
import { STRING_NAMES } from './tab.js';
import { notate } from './rhythm.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TECH = { h: 'H', p: 'P', b: 'B', r: 'R', s: 'sl.', v: '~' };

const W = 760, L = 34, R = 752, GAP = 14, TOP = 30, MIN_BEAT = 46, PER_NOTE = 19;

export function printHtml(p, tabbed) {
  const placed = tabbed.filter(n => n.fret >= 0 && n.string).sort((a, b) => a.t - b.t);
  const bpb = p.beatsPerBar, rhythm = notate(placed, p);
  const barOf = n => rhythm.get(n.id).bar;
  const first = placed.length ? Math.max(0, barOf(placed[0])) : 0, last = placed.length ? barOf(placed.at(-1)) : 0;

  // 마디마다 박 폭 정하기
  const bars = [];
  for (let b = first; b <= last; b++) {
    const notes = placed.filter(n => barOf(n) === b);
    const beats = Array.from({ length: bpb }, (_, q) => {
      const k = notes.filter(n => rhythm.get(n.id).beatInBar === q).length;
      return Math.max(MIN_BEAT, k * PER_NOTE + 8);
    });
    bars.push({ b, notes, beats, natural: beats.reduce((a, c) => a + c, 0) + 10 });
  }
  // 한 줄에 들어가는 만큼 마디를 채운다 (최대 4마디)
  const avail = R - L - 16, systems = [];
  let cur = [], used = 0;
  for (const bar of bars) {
    if (cur.length && (used + bar.natural > avail || cur.length >= 4)) { systems.push(cur); cur = []; used = 0; }
    cur.push(bar); used += bar.natural;
  }
  if (cur.length) systems.push(cur);

  const sysSvg = sys => {
    const parts = [], bottom = TOP + 5 * GAP, stemTop = bottom + 8, stemBot = bottom + 30;
    const scale = avail / sys.reduce((a, c) => a + c.natural, 0);
    for (let s = 1; s <= 6; s++) {
      const y = TOP + (s - 1) * GAP;
      parts.push(`<line x1="${L}" y1="${y}" x2="${R}" y2="${y}" stroke="#555" stroke-width=".6"/>`);
      parts.push(`<text x="${L - 9}" y="${y + 3}" font-size="8" fill="#888" text-anchor="middle">${STRING_NAMES[s]}</text>`);
    }
    ['T', 'A', 'B'].forEach((c, i) => parts.push(`<text x="${L + 4}" y="${TOP + 19 + i * 17}" font-size="11" font-weight="700">${c}</text>`));
    let x = L + 16;
    for (const bar of sys) {
      parts.push(`<line x1="${x}" y1="${TOP}" x2="${x}" y2="${bottom}" stroke="#222"/>`);
      parts.push(`<text x="${x + 2}" y="${TOP - 14}" font-size="10" font-weight="700" fill="#1d4ed8">${bar.b + 1}</text>`);
      const beatX = []; let bx = x + 8 * scale;
      bar.beats.forEach(w => { beatX.push([bx, w * scale]); bx += w * scale; });
      const pos = new Map();
      for (const n of bar.notes) {
        const r = rhythm.get(n.id), [b0, bw] = beatX[r.beatInBar];
        pos.set(n.id, b0 + 4 + r.pos * (bw - 10));
      }
      // 숫자와 주법
      for (const n of bar.notes) {
        const nx = pos.get(n.id), y = TOP + (n.string - 1) * GAP;
        const label = n.tech === 'x' ? 'x' : n.tech === 'b' ? `${n.fret}b${n.fret + (n.bend || 2)}` : String(n.fret);
        const w = 4 + label.length * 5.6;
        parts.push(`<rect x="${nx - 2}" y="${y - 6}" width="${w}" height="12" fill="#fff"/>`);
        parts.push(`<text x="${nx}" y="${y + 4}" font-size="10.5" font-weight="600">${esc(label)}</text>`);
        if (TECH[n.tech]) parts.push(`<text x="${nx}" y="${TOP - 4}" font-size="8" fill="#b45309">${TECH[n.tech]}</text>`);
      }
      // 리듬: 박마다 기둥과 빔
      const groups = new Map();
      for (const n of bar.notes) { const r = rhythm.get(n.id); (groups.get(r.groupKey) || groups.set(r.groupKey, []).get(r.groupKey)).push(n); }
      for (const g of groups.values()) {
        const xs = g.map(n => pos.get(n.id) + 3), rs = g.map(n => rhythm.get(n.id));
        g.forEach((n, i) => {
          const r = rs[i], long = r.value === '2분' || r.value === '점2분' || r.value === '온';
          parts.push(`<line x1="${xs[i]}" y1="${stemTop}" x2="${xs[i]}" y2="${stemBot}" stroke="#222" stroke-width="${long ? 0.6 : 1}"${long ? ' stroke-dasharray="2 2"' : ''}/>`);
          if (r.dotted) parts.push(`<circle cx="${xs[i] + 4}" cy="${stemBot - 3}" r="1.2" fill="#222"/>`);
        });
        for (let lv = 1; lv <= 3; lv++) {
          const y = stemBot - (lv - 1) * 3.5;
          for (let i = 0; i < g.length; i++) {
            if (rs[i].beams < lv) continue;
            if (i + 1 < g.length && rs[i + 1].beams >= lv) parts.push(`<line x1="${xs[i]}" y1="${y}" x2="${xs[i + 1]}" y2="${y}" stroke="#222" stroke-width="2.2"/>`);
            else if (!(i > 0 && rs[i - 1].beams >= lv)) {
              const dir = i + 1 < g.length || g.length === 1 ? 1 : -1; // 혼자인 음은 짧은 꼬리
              parts.push(`<line x1="${xs[i]}" y1="${y}" x2="${xs[i] + dir * 6}" y2="${y}" stroke="#222" stroke-width="2.2"/>`);
            }
          }
        }
        if (rs[0].tuplet && g.length > 1) {
          const a = xs[0], b = xs.at(-1), yy = stemBot + 8;
          parts.push(`<path d="M${a} ${yy - 3}V${yy}H${b}V${yy - 3}" fill="none" stroke="#555" stroke-width=".7"/>`);
          parts.push(`<text x="${(a + b) / 2}" y="${yy + 9}" font-size="8" text-anchor="middle" fill="#333">${rs[0].tuplet}</text>`);
        }
      }
      x += bar.natural * scale;
    }
    parts.push(`<line x1="${x}" y1="${TOP}" x2="${x}" y2="${bottom}" stroke="#222" stroke-width="1.3"/>`);
    return `<svg viewBox="0 0 ${W} ${bottom + 48}" width="100%">${parts.join('')}</svg>`;
  };

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(p.title)} – TAB</title>
<style>@page{size:A4;margin:11mm}body{font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;color:#111;margin:0}
h1{font-size:20px;margin:0 0 2px}.meta{font-size:11px;color:#555;margin-bottom:6px}svg{display:block;break-inside:avoid;margin-bottom:2px}
.legend{font-size:10px;color:#777;margin-top:8px}</style></head><body>
<h1>${esc(p.title)}</h1><div class="meta">♩=${p.bpm} · ${bpb}/4 · 표준 튜닝 · TabRoll</div>
${systems.map(sysSvg).join('\n')}
<div class="legend">H 해머링 · P 풀링 · 7b9 벤딩(7프렛을 9프렛 음까지) · R 릴리즈 · sl. 슬라이드 · ~ 비브라토 · x 뮤트 · 3·6 셋잇단·여섯잇단 · 점선 기둥은 2분음표 이상</div>
<script>addEventListener('load',()=>setTimeout(()=>print(),300))</script></body></html>`;
}
