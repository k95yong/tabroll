// 인쇄·PDF용 TAB 페이지.
// - 박마다 폭을 음 개수에 맞춰 정하고(빽빽한 박은 넓게), 마디를 한 줄에 들어가는 만큼 채운다.
// - TAB 아래에 박자 꼬리(기둥·빔)와 셋잇단·여섯잇단 표시를 그린다.
import { STRING_NAMES } from './tab.js';
import { notate } from './rhythm.js';
import * as mk from './marks.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const W = 760, L = 34, R = 752, GAP = 14, TOP = 30, MIN_BEAT = 46, PER_NOTE = 19;

export function printHtml(p, tabbed, { autoPrint = true } = {}) {
  const placed = tabbed.filter(n => n.fret >= 0 && n.string).sort((a, b) => a.t - b.t);
  const bpb = p.beatsPerBar, rhythm = notate(placed, p);
  const barOf = n => rhythm.get(n.id).bar;
  const first = placed.length ? Math.max(0, barOf(placed[0])) : 0, last = placed.length ? barOf(placed.at(-1)) : 0;

  // 마디마다 박 폭 정하기
  const bars = [];
  for (let b = first; b <= last; b++) {
    const notes = placed.filter(n => barOf(n) === b);
    const beats = Array.from({ length: bpb }, (_, q) => {
      const inBeat = notes.filter(n => rhythm.get(n.id).beatInBar === q);
      const bends = inBeat.filter(n => n.tech === 'b' || n.tech === 'r').length; // 화살표 자리
      // 박 안에서 가장 가까운 두 음이 같은 줄이면 숫자 폭만큼, 다른 줄이어도 기둥이 붙지 않을 만큼 벌어지게 폭을 잡는다
      const ps = inBeat.map(n => ({ pos: rhythm.get(n.id).pos, n })).sort((a, b) => a.pos - b.pos);
      let need = 0;
      for (let i = 1; i < ps.length; i++) {
        const dp = Math.max(0.02, ps[i].pos - ps[i - 1].pos), same = ps[i].n.string === ps[i - 1].n.string;
        const gap = (same ? 6 + String(ps[i - 1].n.fret).length * 5.6 : 8) + (ps[i - 1].n.tech === 'b' ? 12 : 0);
        need = Math.max(need, gap / dp + 16);
      }
      return Math.max(MIN_BEAT, inBeat.length * PER_NOTE + bends * 12 + 8, Math.min(need, 260));
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
    const allPos = new Map(), widths = new Map();
    for (const bar of sys) {
      parts.push(`<line x1="${x}" y1="${TOP}" x2="${x}" y2="${bottom}" stroke="#222"/>`);
      parts.push(`<text x="${x + 2}" y="${TOP - 14}" font-size="10" font-weight="700" fill="#1d4ed8">${bar.b + 1}</text>`);
      const beatX = []; let bx = x + 6 + 8 * scale; // 마디선에서 띄운다
      bar.beats.forEach(w => { beatX.push([bx, w * scale]); bx += w * scale; });
      const pos = new Map(), lastOn = {}, barEnd = x + bar.natural * scale - 4;
      for (const n of [...bar.notes].sort((a, b) => a.t - b.t)) {
        const r = rhythm.get(n.id), [b0, bw] = beatX[r.beatInBar], wd = String(n.fret).length * 5.6;
        const tail = n.tech === 'b' || n.tech === 'r' ? 13 : 0;
        let px = Math.max(b0 + 4 + r.pos * (bw - 16), (lastOn[n.string] ?? -1e9) + 4); // 같은 줄 앞 숫자와 겹치면 민다
        if (px + wd + tail > barEnd) px = Math.max((lastOn[n.string] ?? -1e9) + 2, barEnd - wd - tail); // 마디선을 넘지 않게
        lastOn[n.string] = px + wd + tail;
        pos.set(n.id, px); allPos.set(n.id, px);
      }
      // 숫자와 주법
      for (const n of bar.notes) {
        const nx = pos.get(n.id), y = TOP + (n.string - 1) * GAP;
        const label = n.tech === 'x' ? 'x' : String(n.fret);
        const w = 4 + label.length * 5.6;
        parts.push(`<rect x="${nx - 2}" y="${y - 6}" width="${w}" height="12" fill="#fff"/>`);
        parts.push(`<text x="${nx}" y="${y + 4}" font-size="10.5" font-weight="600">${esc(label)}</text>`);
        widths.set(n.id, label.length * 5.6);
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
    // 주법 기호는 숫자를 다 그린 뒤 맨 위에 (흰 테두리를 깔아 다른 숫자·선에 묻히지 않게)
    const path = (d, w = 1) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w + 2.5}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#222" stroke-width="${w}" stroke-linecap="round"/>`;
    const text = (t, x, y, extra = '') => `<text x="${x}" y="${y}" font-size="8" text-anchor="middle" stroke="#fff" stroke-width="2.5" paint-order="stroke" ${extra}>${esc(t)}</text>`;
    for (const n of sys.flatMap(b => b.notes)) {
      if (!n.tech || n.tech === 'x') continue;
      const nx = allPos.get(n.id), right = nx + widths.get(n.id), y = TOP + (n.string - 1) * GAP;
      if (n.tech === 'b' || n.tech === 'r') {
        const m = n.tech === 'b' ? mk.bend(right, y, 0.85) : mk.release(right, y, 0.85);
        parts.push(path(m.curve, 0.9), path(m.head, 0.9));
        if (n.tech === 'b') parts.push(text(mk.BEND_LABEL[n.bend || 2] || `${(n.bend || 2) / 2}`, m.tip[0], m.tip[1] - 2.5, 'font-weight="700"'));
      } else if (n.tech === 'v') parts.push(path(mk.vibrato(nx - 1, y - 10, Math.max(13, widths.get(n.id) + 4), 0.8), 0.8));
      else {
        const i = placed.indexOf(n), prev = placed[i - 1], have = prev && allPos.has(prev.id);
        const x1 = nx + widths.get(n.id) / 2, x0 = have ? allPos.get(prev.id) + widths.get(prev.id) / 2 : x1 - 16;
        if (n.tech === 's') parts.push(path(mk.slide(have ? allPos.get(prev.id) + widths.get(prev.id) : nx - 14, nx, y, !prev || n.fret >= prev.fret, 0.85), 0.9));
        else { const sl = mk.slur(x0, x1, y, 0.85); parts.push(path(sl.path, 0.8), text(n.tech, sl.label[0], sl.label[1], 'font-style="italic" font-weight="700"')); }
      }
    }
    return `<svg viewBox="0 0 ${W} ${bottom + 48}" width="100%">${parts.join('')}</svg>`;
  };

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(p.title)} – TAB</title>
<style>@page{size:A4;margin:11mm}body{font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;color:#111;margin:0}
h1{font-size:20px;margin:0 0 2px}.meta{font-size:11px;color:#555;margin-bottom:6px}svg{display:block;break-inside:avoid;margin-bottom:2px}
.legend{font-size:10px;color:#777;margin-top:8px}</style></head><body>
<h1>${esc(p.title)}</h1><div class="meta">♩=${p.bpm} · ${bpb}/4 · 표준 튜닝 · TabRoll</div>
${systems.map(sysSvg).join('\n')}
<div class="legend">h 해머링 · p 풀링 (이음줄) · ↗ 벤딩 (½ · full · 1½ = 밀어 올리는 폭) · ↘ 릴리즈 · / 슬라이드 · 물결 비브라토 · x 뮤트 · 3·6 셋잇단·여섯잇단 · 점선 기둥은 2분음표 이상</div>
${autoPrint ? "<script>addEventListener('load',()=>setTimeout(()=>print(),300))</script>" : ''}</body></html>`;
}
