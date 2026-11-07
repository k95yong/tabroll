// 브라우저 스모크 테스트 (Playwright 필요): node tests/ui.smoke.mjs [스크린샷경로]
// 데모 프로젝트를 열어 마우스·키보드 편집, 묶음 선택, 반복 구간, 패널, 내보내기를 확인한다.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 5199;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
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

  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
  check(!errs.length, '페이지 오류 없음', errs.join(' | '));
} finally { await browser.close(); srv.kill(); }
process.exit(failed ? 1 : 0);
