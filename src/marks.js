// TAB 주법 기호의 모양(SVG 경로 문자열). 화면(Canvas Path2D)과 인쇄(SVG)가 같은 모양을 쓴다.
// 좌표는 숫자(프렛) 글자 기준: (x, y) = 그 줄의 선 위 숫자 오른쪽 끝, 위쪽이 -y.

export const BEND_LABEL = { 1: '½', 2: 'full', 3: '1½', 4: '2' };

// 벤딩: 숫자 오른쪽에서 출발해 아래가 볼록하게 휘며 오른쪽 위로 올라가는 화살표
export function bend(x, y, size = 1) {
  const w = 11 * size, h = 15 * size, x0 = x + 1, y0 = y - 2, tx = x0 + w, ty = y0 - h;
  return {
    curve: `M${x0} ${y0} Q${tx} ${y0} ${tx} ${ty + 3 * size}`,
    head: `M${tx - 3 * size} ${ty + 4 * size} L${tx} ${ty} L${tx + 3 * size} ${ty + 4 * size}`,
    tip: [tx, ty], width: w + 3 * size,
  };
}

// 릴리즈: 위에서 내려오는 화살표 (벤딩한 음을 원래 음으로 되돌림)
export function release(x, y, size = 1) {
  const w = 11 * size, h = 15 * size, x0 = x + 1, top = y - 2 - h, tx = x0 + w, ty = y - 4;
  return {
    curve: `M${x0} ${top} Q${tx} ${top} ${tx} ${ty - 3 * size}`,
    head: `M${tx - 3 * size} ${ty - 4 * size} L${tx} ${ty} L${tx + 3 * size} ${ty - 4 * size}`,
    tip: [x0, top], width: w + 3 * size,
  };
}

// 이음줄(해머링·풀링): 두 숫자 위를 잇는 호. 글자(h/p)는 호 꼭대기 위에 둔다.
export function slur(x0, x1, y, size = 1) {
  const lift = Math.min(10, 4 + (x1 - x0) * 0.12) * size, top = y - 9 * size;
  return { path: `M${x0} ${top} Q${(x0 + x1) / 2} ${top - lift * 2} ${x1} ${top}`, label: [(x0 + x1) / 2, top - lift - 3 * size] };
}

// 슬라이드: 두 숫자 사이 사선 (올라가면 /, 내려가면 \)
export function slide(x0, x1, y, up, size = 1) {
  const a = Math.max(x0 + 2, x1 - 12 * size), b = x1 - 3 * size, d = 4 * size;
  return `M${a} ${y + (up ? d : -d)} L${b} ${y + (up ? -d : d)}`;
}

// 비브라토: 숫자 위 물결
export function vibrato(x, y, w = 16, size = 1) {
  let p = `M${x} ${y}`;
  for (let i = 0; i < 4; i++) p += ` q${w / 8} ${(i % 2 ? 3 : -3) * size} ${w / 4} 0`;
  return p;
}

// 4분쉼표: 번개 모양 (x = 가운데, y = 위쪽 끝)
export function quarterRest(x, y, size = 1) {
  const k = size;
  return `M${x - 2 * k} ${y} L${x + 2.5 * k} ${y + 5 * k} L${x - 1.5 * k} ${y + 9 * k} L${x + 2.5 * k} ${y + 13 * k} Q${x - 3 * k} ${y + 11 * k} ${x - 0.5 * k} ${y + 17 * k}`;
}
