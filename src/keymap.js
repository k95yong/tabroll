// 단축키 표. 키 처리와 단축키 안내 화면이 같은 표를 쓴다.
// 조합 표기: Mod(⌘/Ctrl) · Alt(⌥) · Shift(⇧) + 키 이름(e.code 기준: A, 1, [, Space, ArrowUp …)

const CODE = { BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Slash: '/', Comma: ',', Period: '.', Backquote: '`' };
export function comboOf(e) {
  const k = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Numpad') ? e.code.slice(6) : CODE[e.code] || e.code;
  return [(e.metaKey || e.ctrlKey) && 'Mod', e.altKey && 'Alt', e.shiftKey && 'Shift', k].filter(Boolean).join('+');
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const PRETTY = { Mod: isMac ? '⌘' : 'Ctrl', Alt: isMac ? '⌥' : 'Alt', Shift: '⇧', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Delete: 'Del', Backspace: '⌫', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab' };
export const pretty = combo => combo.split('+').map(p => `<kbd>${PRETTY[p] || p}</kbd>`).join('');

export function buildKeymap(a) {
  // [그룹, 조합(여러 개 가능), 설명, 실행]
  return [
    ['재생', ['Space'], '재생 / 정지', () => a.tr.toggle()],
    ['재생', ['Shift+Space'], '보이는 구간(또는 반복 구간) 처음부터', () => a.playFromView()],
    ['재생', ['L'], '반복 켜기·끄기 (눈금자를 끌어 구간 지정)', () => a.toggleLoop()],
    ['재생', ['M'], '메트로놈', () => a.toggleMetro()],
    ['재생', ['K'], 'MIDI 건반 녹음', () => a.midi.toggleRec()],
    ['재생', ['-', '='], '속도 내리기 / 올리기', null],
    ['재생', ['1', '2', '3'], '원음만 / 악보만 / 둘 다', null],
    ['재생', ['O'], '지금 위치를 1마디 시작으로', () => a.setOffsetHere()],
    ['화면', ['[', ']'], '앞 / 뒤 마디', null],
    ['화면', ['Z', 'Shift+Z'], '확대 / 축소 (⌘+휠도 됨, 휠 = 좌우 이동)', null],
    ['화면', ['F'], '재생 위치 따라가기 켜기·끄기', () => a.toggleFollow()],
    ['화면', ['Shift+F'], '전체 음 보기', () => a.view.fitAll()],
    ['선택', ['Tab', 'Shift+Tab'], '다음 / 이전 음', null],
    ['선택', ['Mod+A'], '보이는 음 모두 선택', () => a.ed.selectAllInView()],
    ['선택', ['Escape'], '선택 해제', () => a.store.clearSel()],
    ['편집', ['ArrowUp', 'ArrowDown'], '반음 위 / 아래 (⇧ 옥타브)', null],
    ['편집', ['ArrowLeft', 'ArrowRight'], '한 칸 앞 / 뒤 (⇧ 길이 줄이기 / 늘리기)', null],
    ['편집', ['N'], '재생 위치에 음 추가', () => a.ed.addAtCursor()],
    ['편집', ['Mod+C', 'Mod+V'], '복사 / 재생 위치에 붙여넣기', null],
    ['편집', ['Mod+D'], '바로 뒤에 복제', () => a.ed.duplicate()],
    ['편집', ['Delete', 'Backspace'], '삭제', () => a.ed.remove()],
    ['편집', ['Q', 'Shift+Q'], '칸에 맞추기 (선택 / 보이는 음 전부)', null],
    ['편집', ['Enter'], '선택한 음 듣기', () => a.hearSel()],
    ['편집', ['Mod+Z', 'Mod+Shift+Z'], '되돌리기 / 다시하기', null],
    ['TAB', ['Alt+1'], '줄 고정 (⌥1~⌥6), ⌥0 자동 — TAB 숫자를 위아래로 끌어도 됨', null],
    ['TAB', ['H', 'P', 'B', 'R', 'S', 'V', 'X'], '해머링 · 풀링 · 벤딩 · 릴리즈 · 슬라이드 · 비브라토 · 뮤트', null],
    ['TAB', ['Shift+B'], '벤딩 크기 바꾸기 (½ → full → 1½)', () => a.cycleBend()],
    ['TAB', ['0'], '주법 지우기', () => a.ed.setTech('')],
    ['파일', ['Mod+O'], '음원·영상 열기', () => a.io.pickMedia()],
    ['파일', ['Mod+S', 'Mod+Shift+S'], '저장 / 다른 이름으로', null],
    ['파일', ['Mod+P'], 'TAB 인쇄 / PDF', () => a.io.print()],
    ['도움', ['Shift+/'], '단축키 보기', () => a.help(true)],
  ];
}

// 표에 실행 함수가 없는 키(여러 키를 한 줄로 설명한 것)는 여기서 처리한다
export function extraHandler(a) {
  const rates = [0.25, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25];
  return combo => {
    const m = combo.match(/^(Shift\+)?(ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/);
    if (m) {
      const sh = !!m[1], dir = m[2] === 'ArrowUp' || m[2] === 'ArrowRight' ? 1 : -1;
      if (m[2] === 'ArrowUp' || m[2] === 'ArrowDown') a.ed.transpose(dir * (sh ? 12 : 1));
      else sh ? a.ed.resize(dir) : a.ed.nudge(dir);
      return true;
    }
    if (/^Alt\+[0-6]$/.test(combo)) { a.ed.setString(+combo.slice(4)); return true; }
    if (/^[HPBRSVX]$/.test(combo)) { a.ed.setTech(combo.toLowerCase()); return true; }
    switch (combo) {
      case '-': case '=': { const i = rates.indexOf(a.tr.rate), j = Math.max(0, Math.min(rates.length - 1, (i < 0 ? 7 : i) + (combo === '=' ? 1 : -1))); a.setRate(rates[j]); return true; }
      case '1': case '2': case '3': a.setMix(+combo); return true;
      case '[': a.view.gotoBar(-1); return true;
      case ']': a.view.gotoBar(1); return true;
      case 'Z': a.view.zoom(0.7); return true;
      case 'Shift+Z': a.view.zoom(1 / 0.7); return true;
      case 'Tab': a.ed.selectNeighbor(1); return true;
      case 'Shift+Tab': a.ed.selectNeighbor(-1); return true;
      case 'Mod+C': a.ed.copy(); return true;
      case 'Mod+V': a.ed.paste(); return true;
      case 'Q': a.ed.quantize('sel'); return true;
      case 'Shift+Q': a.ed.quantize('view'); return true;
      case 'Mod+Z': a.store.undo(); return true;
      case 'Mod+Shift+Z': case 'Mod+Y': a.store.redo(); return true;
      case 'Mod+S': a.io.save(); return true;
      case 'Mod+Shift+S': a.io.save(true); return true;
    }
    return false;
  };
}

export function helpHtml(keymap) {
  const groups = {};
  for (const [g, combos, desc] of keymap) (groups[g] ||= []).push(`<tr><td>${combos.map(pretty).join(' ')}</td><td>${desc}</td></tr>`);
  return Object.entries(groups).map(([g, rows]) => `<section><h3>${g}</h3><table>${rows.join('')}</table></section>`).join('');
}
