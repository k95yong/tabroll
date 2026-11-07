// 인쇄·PDF용 TAB 페이지. 음은 마디 안 시간 비율대로 놓고, 박마다 눈금을 그린다.
import { STRING_NAMES } from './tab.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TECH = { h: 'H', p: 'P', b: 'B', r: 'R', s: 'sl.', v: '~', x: '' };

export function printHtml(p, tabbed, { barsPerSystem = 2 } = {}) {
  const barLen = 60 / p.bpm * p.beatsPerBar;
  const placed = tabbed.filter(n => n.fret >= 0 && n.string);
  const barOf = t => Math.floor((t - p.offset) / barLen + 1e-6);
  const first = placed.length ? Math.max(0, Math.min(...placed.map(n => barOf(n.t)))) : 0;
  const last = placed.length ? Math.max(...placed.map(n => barOf(n.t))) : 0;
  const W = 760, L = 40, R = 750, GAP = 15, SYS_H = 6 * GAP + 62;
  const systems = [];
  for (let b0 = first; b0 <= last; b0 += barsPerSystem) systems.push(b0);

  const sysSvg = b0 => {
    const parts = [], top = 30, bottom = top + 5 * GAP;
    const bw = (R - L - 20) / barsPerSystem, x0 = L + 20;
    for (let s = 1; s <= 6; s++) {
      const y = top + (s - 1) * GAP;
      parts.push(`<line x1="${L}" y1="${y}" x2="${R}" y2="${y}" stroke="#444" stroke-width=".7"/>`);
      parts.push(`<text x="${L - 10}" y="${y + 3}" font-size="9" fill="#777" text-anchor="middle">${STRING_NAMES[s]}</text>`);
    }
    ['T', 'A', 'B'].forEach((c, i) => parts.push(`<text x="${L + 6}" y="${top + 22 + i * 18}" font-size="12" font-weight="700">${c}</text>`));
    parts.push(`<line x1="${R}" y1="${top}" x2="${R}" y2="${bottom}" stroke="#222" stroke-width="1.2"/>`);
    for (let k = 0; k < barsPerSystem; k++) {
      const b = b0 + k, bx = x0 + k * bw;
      parts.push(`<line x1="${bx}" y1="${top}" x2="${bx}" y2="${bottom}" stroke="#222"/>`);
      if (b <= last) parts.push(`<text x="${bx + 2}" y="${top - 16}" font-size="10" font-weight="700" fill="#1d4ed8">${b + 1}</text>`);
      for (let q = 1; q < p.beatsPerBar; q++) parts.push(`<line x1="${bx + bw * q / p.beatsPerBar}" y1="${top - 6}" x2="${bx + bw * q / p.beatsPerBar}" y2="${top - 2}" stroke="#999"/>`);
      for (const n of placed) {
        if (barOf(n.t) !== b) continue;
        const pos = (n.t - p.offset) / barLen - b, x = bx + 8 + pos * (bw - 14), y = top + (n.string - 1) * GAP;
        const len = Math.max(0, Math.min(1 - pos, (n.te - n.t) / barLen)) * (bw - 14);
        const label = n.tech === 'x' ? 'x' : n.tech === 'b' && n.bend ? `${n.fret}b${n.fret + n.bend}` : String(n.fret);
        const w = 6 + label.length * 5.5;
        parts.push(`<rect x="${x - 2}" y="${y - 6}" width="${w}" height="12" fill="#fff"/>`);
        parts.push(`<text x="${x}" y="${y + 4}" font-size="11" font-weight="600">${esc(label)}</text>`);
        parts.push(`<line x1="${x}" y1="${bottom + 10}" x2="${x + Math.max(2, len)}" y2="${bottom + 10}" stroke="#bbb" stroke-width="2"/>`);
        if (TECH[n.tech]) parts.push(`<text x="${x + 1}" y="${top - 4}" font-size="8" fill="#b45309">${TECH[n.tech]}</text>`);
      }
    }
    return `<svg viewBox="0 0 ${W} ${SYS_H}" width="100%">${parts.join('')}</svg>`;
  };

  const body = systems.map(sysSvg).join('\n');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(p.title)} – TAB</title>
<style>@page{size:A4;margin:12mm}body{font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;color:#111;margin:0}
h1{font-size:20px;margin:0 0 2px}.meta{font-size:11px;color:#555;margin-bottom:8px}svg{display:block;break-inside:avoid;margin-bottom:4px}
.legend{font-size:10px;color:#777;margin-top:10px}</style></head><body>
<h1>${esc(p.title)}</h1><div class="meta">♩=${p.bpm} · ${p.beatsPerBar}/4 · 표준 튜닝 · TabRoll로 작성 · 숫자 아래 회색 줄은 음 길이</div>
${body}
<div class="legend">H 해머링 · P 풀링 · B 벤딩 · R 릴리즈 · sl. 슬라이드 · ~ 비브라토 · x 뮤트</div>
<script>addEventListener('load',()=>setTimeout(()=>print(),300))</script></body></html>`;
}
