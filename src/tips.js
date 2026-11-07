// 마우스를 올리면 그 자리에서 할 수 있는 일을 알려 주는 풍선 도움말.
// - 버튼·입력칸: title(또는 data-tip)을 빠르게 띄운다 (브라우저 기본 툴팁은 1초 넘게 늦다)
// - 캔버스: 마우스가 있는 구역(눈금자·파형·막대·막대 끝·빈 곳·TAB 숫자·후보 숫자…)에 맞는 설명
const KEY = 'tabroll:tips';

export class Tips {
  constructor() {
    this.el = Object.assign(document.createElement('div'), { id: 'tip', role: 'tooltip' });
    document.body.append(this.el);
    this.on = localStorage.getItem(KEY) !== 'off';
    this.timer = 0; this.cur = null; this.suppressed = false;
    // title 은 기본 툴팁과 겹치지 않게 data-tip 으로 옮긴다
    const adopt = root => root.querySelectorAll('[title]').forEach(el => { el.dataset.tip = el.title; el.removeAttribute('title'); });
    adopt(document);
    new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.title) { n.dataset.tip = n.title; n.removeAttribute('title'); }
        adopt(n);
      }
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-tip]');
      if (t) this.show(t.dataset.tip, e, 280); else if (!e.target.closest('canvas')) this.hide();
    });
    document.addEventListener('mousemove', e => { if (this.el.classList.contains('show')) this.#place(e); });
    document.addEventListener('mousedown', () => { this.hide(); this.suppressed = true; });
    document.addEventListener('mouseup', () => { this.suppressed = false; });
    document.addEventListener('keydown', () => this.hide());
  }
  setEnabled(v) { this.on = v; localStorage.setItem(KEY, v ? 'on' : 'off'); if (!v) this.hide(); }

  // 같은 내용이면 자리만 따라가고, 바뀌면 잠깐 뒤에 띄운다
  show(html, e, delay = 350) {
    if (!this.on || this.suppressed || !html) return this.hide();
    if (html === this.cur) { this.#place(e); return; }
    this.cur = html; clearTimeout(this.timer);
    this.el.classList.remove('show');
    const pt = { clientX: e.clientX, clientY: e.clientY };
    this.timer = setTimeout(() => { this.el.innerHTML = html; this.el.classList.add('show'); this.#place(pt); }, delay);
  }
  hide() { clearTimeout(this.timer); this.cur = null; this.el.classList.remove('show'); }
  #place(e) {
    const r = this.el.getBoundingClientRect(), pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > innerWidth - 6) x = e.clientX - r.width - pad;
    if (y + r.height > innerHeight - 6) y = e.clientY - r.height - pad;
    this.el.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }
}

const k = s => `<kbd>${s}</kbd>`;
// 캔버스 구역별 설명. app.js 가 마우스 위치로 구역을 정해 넘긴다.
export const ZONE_TIPS = {
  keys: `<b>건반</b><br>클릭하면 그 음을 들려줍니다`,
  ruler: `<b>눈금자</b><br>클릭: 재생 위치 옮기기<br>좌우로 끌기: 반복 구간 정하기 (${k('L')} 켜기·끄기)`,
  wave: `<b>파형</b><br>클릭: 재생 위치 옮기기<br>솟은 곳이 음이 시작되는 자리입니다`,
  empty: `<b>빈 곳</b><br>더블클릭: 이 높이·자리에 음 추가<br>끌기: 박스로 여러 음 고르기 (${k('⇧')} 더하기)<br>클릭: 선택 해제 + 재생 위치 옮기기<br>휠: 좌우 이동 · ${k('⌘')}+휠: 확대`,
  note: `<b>음 막대</b><br>끌기: 위치·음높이 옮기기 (${k('⇧')} 누르면 칸 무시)<br>${k('⇧')}클릭: 선택에 더하기 · 잡으면 소리가 납니다<br>선택 뒤: ${k('↑')}${k('↓')} 반음 · ${k('←')}${k('→')} 한 칸 · ${k('Delete')} 삭제<br>${k('H')} 해머링 ${k('P')} 풀링 ${k('B')} 벤딩 ${k('V')} 비브라토`,
  edge: `<b>막대 끝</b><br>좌우로 끌기: 음 시작·끝 길이 조절<br>${k('⇧')} 누르면 칸 무시`,
  tabNum: `<b>TAB 숫자</b><br>클릭: 그 음 고르기 (다른 줄 후보가 점선으로 뜹니다)<br>위아래로 끌기: 다른 줄로 옮기기<br>${k('⌥')}${k('↑')}${k('↓')} 한 줄씩 · ${k('G')} 같은 음 전부 같은 줄`,
  ghost: `<b>다른 줄 후보</b><br>클릭: 이 음을 이 줄로<br>${k('⇧')}클릭: 곡 전체의 같은 음을 이 줄로`,
  tabEmpty: `<b>TAB</b><br>막대(음)를 고르면 칠 수 있는 다른 줄이 점선 숫자로 뜹니다<br>파란 숫자 = 줄을 직접 고정한 음 · 빨간 ? = 칠 수 없는 음`,
  overview: `<b>전체 곡</b><br>클릭·끌기: 보는 구간 옮기기<br>파란 상자 = 지금 보는 구간, 초록 선 = 재생 위치`,
};
