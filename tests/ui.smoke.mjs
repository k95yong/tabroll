// 브라우저 스모크 테스트 (Playwright 필요): node tests/ui.smoke.mjs [스크린샷경로]
// 데모 프로젝트를 열어 마우스·키보드 편집, 묶음 선택, 반복 구간, 패널, 내보내기를 확인한다.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { mkdtempSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 5199;
// 작업 폴더 흉내: 데모를 임시 폴더에 복사해 /files/ 로 연다 (저장이 그 파일로 돌아오는지 본다)
const work = mkdtempSync(join(tmpdir(), 'tabroll-'));
copyFileSync('examples/demo.tabroll.json', join(work, 'demo.json'));
const srv = spawn(process.execPath, ['tools/serve.mjs', String(port), '--dir', work], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined });
let failed = false;
const check = (ok, what, detail = '') => { console.log(`${ok ? '✔' : '✖'} ${what}${ok ? '' : ' ' + detail}`); if (!ok) failed = true; };
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/?project=examples/demo.tabroll.json`);
  await page.waitForFunction(() => window.tabroll?.store.notes.length > 0);
  await page.waitForTimeout(300);
  check(await page.locator('#welcome').isHidden(), '프로젝트가 있으면 시작 안내를 숨긴다');
  const box = await page.locator('#roll').boundingBox();
  const geo = id => page.evaluate(id => {
    const { store, view } = tabroll, n = store.get(id);
    return { x: view.X((n.t + n.te) / 2), xr: view.X(n.te) - 2, y: view.Y(n.midi) + view.rh / 2, rh: view.rh, t: n.t, te: n.te, midi: n.midi };
  }, id);
  const count = () => page.evaluate(() => tabroll.store.notes.length);
  const sel = () => page.evaluate(() => [...tabroll.store.sel]);

  // 끌어서 옮기기
  const g = await geo(1);
  await page.mouse.move(box.x + g.x, box.y + g.y); await page.mouse.down();
  await page.mouse.move(box.x + g.x + 60, box.y + g.y - 2 * g.rh, { steps: 6 }); await page.mouse.up();
  const a = await geo(1);
  check(a.midi === g.midi + 2 && a.t > g.t, '막대 끌기로 높이·위치 이동', JSON.stringify([g, a]));
  // 오른쪽 끝 늘리기
  await page.mouse.move(box.x + a.xr, box.y + a.y); await page.mouse.down();
  await page.mouse.move(box.x + a.xr + 80, box.y + a.y, { steps: 6 }); await page.mouse.up();
  check((await geo(1)).te > a.te + 0.05, '막대 끝 끌기로 길이 늘리기');
  // 키보드 편집
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Alt+Digit3'); await page.keyboard.press('h');
  const k = await page.evaluate(() => { const n = tabroll.store.get(1); return { midi: n.midi, lock: n.lockString, tech: n.tech, string: tabroll.store.tab.get(1).string }; });
  check(k.midi === g.midi + 1 && k.lock === 3 && k.tech === 'h' && k.string === 3, '키보드로 반음·이동·줄 고정·주법', JSON.stringify(k));
  // 패널에서 음높이 바꾸기
  await page.selectOption('#inspector select[data-f="midi"]', String(g.midi + 3));
  check((await geo(1)).midi === g.midi + 3, '오른쪽 패널에서 음높이 변경');
  // 되돌리기
  for (let i = 0; i < 10; i++) await page.keyboard.press('Meta+z');
  const r = await geo(1);
  check(r.midi === g.midi && Math.abs(r.t - g.t) < 1e-6, '되돌리기로 처음 상태 복원');

  // 박스 선택 → 묶음 조옮김 → 복사·붙여넣기 → 삭제
  const n0 = await count();
  await page.mouse.move(box.x + 60, box.y + 60); await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height - 10, { steps: 8 }); await page.mouse.up();
  const picked = await sel();
  check(picked.length >= 3, '빈 곳 끌어서 여러 음 선택', String(picked.length));
  const before = await page.evaluate(ids => ids.map(id => tabroll.store.get(id).midi), picked);
  await page.keyboard.press('ArrowUp');
  const after = await page.evaluate(ids => ids.map(id => tabroll.store.get(id).midi), picked);
  check(after.every((m, i) => m === before[i] + 1), '선택한 음 전체 반음 올리기');
  await page.keyboard.press('Meta+c');
  await page.evaluate(() => tabroll.tr.seek(tabroll.view.e - 0.5));
  await page.keyboard.press('Meta+v');
  check(await count() === n0 + picked.length, '복사·붙여넣기', `${n0} → ${await count()}`);
  await page.keyboard.press('Delete');
  check(await count() === n0, '붙여넣은 음 삭제');

  // 더블클릭 추가
  await page.mouse.dblclick(box.x + box.width - 40, box.y + 80);
  check(await count() === n0 + 1, '빈 곳 더블클릭으로 음 추가');
  await page.keyboard.press('Backspace');

  // 눈금자 끌어서 반복 구간
  await page.mouse.move(box.x + 200, box.y + 8); await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 8, { steps: 6 }); await page.mouse.up();
  const loop = await page.evaluate(() => tabroll.tr.loop);
  check(loop.on && loop.b - loop.a > 0.5, '눈금자 끌어서 반복 구간 지정', JSON.stringify(loop));

  // TAB 숫자 끌어서 줄 바꾸기
  const tb = await page.locator('#tab').boundingBox();
  const tn = await page.evaluate(() => { const { store, view } = tabroll; const n = [...store.tab.values()].find(n => n.t > view.s && n.string <= 3 && n.fret >= 5); return { id: n.id, x: view.X(n.t) + 5, y: 22 + (n.string - 1) * 20, s: n.string }; });
  await page.mouse.move(tb.x + tn.x, tb.y + tn.y); await page.mouse.down();
  await page.mouse.move(tb.x + tn.x, tb.y + tn.y + 20, { steps: 4 }); await page.mouse.up();
  check(await page.evaluate(id => tabroll.store.tab.get(id).string, tn.id) === tn.s + 1, 'TAB 숫자 끌어서 줄 바꾸기');

  // 흐린 후보 숫자 클릭으로 줄 바꾸기, ⌥↑↓, 같은 음 전부 같은 줄
  await page.evaluate(() => tabroll.store.select(3));
  await page.waitForTimeout(100);
  const gh = await page.evaluate(() => { tabroll.view.render(); const g = tabroll.view.ghosts[0]; return g && { x: (g.x0 + g.x1) / 2, y: 22 + (g.string - 1) * 20, s: g.string }; });
  await page.mouse.click(tb.x + gh.x, tb.y + gh.y);
  check(await page.evaluate(() => tabroll.store.tab.get(3).string) === gh.s, 'TAB의 흐린 후보 숫자를 눌러 줄 바꾸기');
  const s0 = await page.evaluate(() => tabroll.store.tab.get(3).string);
  await page.keyboard.press('Alt+ArrowDown');
  const s1 = await page.evaluate(() => tabroll.store.tab.get(3).string);
  check(s1 !== s0, '⌥↓ 로 다른 줄로 옮기기', `${s0}→${s1}`);
  await page.keyboard.press('g');
  const same = await page.evaluate(() => { const { store } = tabroll, m = store.get(3).midi, st = store.tab.get(3).string; return store.notes.filter(n => n.midi === m).every(n => store.tab.get(n.id).string === st); });
  check(same, 'G 로 같은 음 전부 같은 줄로');
  const pad = await page.evaluate(() => { const { view, store } = tabroll; view.render(); return view.tabSpots.every(sp => sp.x0 + 3 >= view.X(store.tab.get(sp.id).t) + 4); });
  check(pad, 'TAB 숫자가 마디선·박선에서 떨어져 그려짐');

  // 해머링 표시: 같은 줄이면 경고 없음, 다른 줄로 옮기면 경고와 고치기 버튼
  await page.evaluate(() => { const { store } = tabroll; const ns = store.byTime(); store.select(ns[2].id); });
  await page.keyboard.press('h');
  const warn1 = await page.locator('#inspector .warn').count();
  const prevOk = await page.evaluate(() => { const { store } = tabroll, n = store.primary(), p = store.prevNote(n); return store.tab.get(n.id).string === store.tab.get(p.id).string; });
  check(prevOk ? warn1 === 0 : warn1 === 1, '해머링 줄 검사 표시', `${prevOk} ${warn1}`);
  const print = await page.evaluate(async () => { const { printHtml } = await import('/src/print.js'); const { store } = tabroll; return printHtml(store.P, [...store.tab.values()]); });
  check(/<path d="M[^"]+Q/.test(print) && />H<\/text>/.test(print), '인쇄 TAB에 해머링 호와 H 표시');

  // 재생, 단축키 화면
  await page.keyboard.press('Space'); await page.waitForTimeout(400); await page.keyboard.press('Space');
  check(await page.evaluate(() => tabroll.tr.cursor > 0), '재생 후 위치가 앞으로 감');
  await page.keyboard.press('Shift+Slash');
  check(await page.locator('#helpBox').isVisible() && (await page.locator('#helpBody tr').count()) > 20, '단축키 화면');
  await page.keyboard.press('Escape');

  // TAB 텍스트 내보내기
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.querySelector('#exAscii').click())]);
  const txt = Buffer.concat(await (await dl.createReadStream()).toArray()).toString();
  check(/^e\|/m.test(txt), 'TAB 텍스트 내보내기');

  // 자동 저장 후 다시 열면 이어서 열림
  await page.evaluate(() => { tabroll.store.edit(() => { tabroll.store.get(2).midi += 1; }); tabroll.io.autosave(); });
  const m2 = await page.evaluate(() => tabroll.store.get(2).midi);
  await page.reload(); await page.waitForFunction(() => tabroll.store.notes.length > 0);
  check(await page.evaluate(() => tabroll.store.notes.find(n => Math.abs(n.t - tabroll.store.P.notes[1].t) < 1e-9).midi) === m2, '새로고침해도 자동 저장본을 이어서 연다');

  // 박자 정리 → ⌘S 로 작업 폴더 파일에 저장
  const p2 = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(`http://localhost:${port}/?project=/files/demo.json`);
  await p2.waitForFunction(() => tabroll.store.notes.length > 0);
  await p2.evaluate(() => { const n = tabroll.store.notes[2]; tabroll.store.edit(() => { n.t += 0.03; n.te += 0.03; }); });
  await p2.keyboard.press('t');
  const off = await p2.evaluate(() => { const { store } = tabroll, beat = 60 / store.P.bpm; return Math.max(...store.notes.map(n => { const x = (n.t - store.P.offset) / (beat / 4); return Math.abs(x - Math.round(x)); })); });
  check(off < 1e-3, '박자 정리(T)로 흔들린 음이 칸에 붙음', String(off));
  await p2.keyboard.press('Meta+s'); await p2.waitForTimeout(400);
  const saved = JSON.parse(readFileSync(join(work, 'demo.json'), 'utf8'));
  check(saved.saved && saved.notes.length === 10, '⌘S 로 작업 폴더 파일에 바로 저장');
  await p2.close();

  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
  check(!errs.length, '페이지 오류 없음', errs.join(' | '));
} finally { await browser.close(); srv.kill(); }
process.exit(failed ? 1 : 0);
