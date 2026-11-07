// 브라우저 스모크 테스트 (Playwright 필요): node tests/ui.smoke.mjs [스크린샷경로]
// 서버를 띄우고 데모 프로젝트를 열어 끌기·길이·추가·삭제·단축키·내보내기를 확인한다.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 5199;
const srv = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));
const fail = (m) => { console.error('FAIL', m); srv.kill(); process.exit(1); };
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/?project=examples/demo.tabroll.json`);
  await page.waitForFunction(() => window.tabroll?.project.notes.length > 0);
  await page.waitForTimeout(300);
  const box = await page.locator('#roll').boundingBox();
  const geo = id => page.evaluate(id => { const n = tabroll.project.notes.find(n => n.id === id), L = tabroll.lay; return { x: tabroll.X((n.t + n.te) / 2), xr: tabroll.X(n.te) - 2, y: L.Y(n.midi) + L.rh / 2, rh: L.rh, t: n.t, te: n.te, midi: n.midi }; }, id);

  // 1) 가운데 끌기: 두 칸 위로, 오른쪽으로
  let g = await geo(1);
  await page.mouse.move(box.x + g.x, box.y + g.y); await page.mouse.down();
  await page.mouse.move(box.x + g.x + 60, box.y + g.y - 2 * g.rh, { steps: 6 }); await page.mouse.up();
  let a = await geo(1);
  if (a.midi !== g.midi + 2 || !(a.t > g.t)) fail(`끌기 실패 ${JSON.stringify([g, a])}`);
  // 2) 오른쪽 끝 늘리기
  await page.mouse.move(box.x + a.xr, box.y + a.y); await page.mouse.down();
  await page.mouse.move(box.x + a.xr + 80, box.y + a.y, { steps: 6 }); await page.mouse.up();
  const b = await geo(1);
  if (!(b.te > a.te + 0.05)) fail('길이 늘리기 실패');
  // 3) 키보드: 반음 내리기, 오른쪽 한 칸, 줄 고정, 주법
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Alt+Digit3'); await page.keyboard.press('h');
  const k = await page.evaluate(() => { const n = tabroll.project.notes.find(n => n.id === 1); return { midi: n.midi, lock: n.lockString, tech: n.tech, tab: tabroll.tabbed.get(1) }; });
  if (k.midi !== g.midi + 1 || k.lock !== 3 || k.tech !== 'h' || k.tab.string !== 3) fail('키보드 편집 실패 ' + JSON.stringify(k));
  // 4) 더블클릭 추가 → Delete → 되돌리기 2번
  const n0 = await page.evaluate(() => tabroll.project.notes.length);
  await page.mouse.dblclick(box.x + box.width - 40, box.y + 60);
  const n1 = await page.evaluate(() => tabroll.project.notes.length);
  await page.keyboard.press('Delete');
  const n2 = await page.evaluate(() => tabroll.project.notes.length);
  if (n1 !== n0 + 1 || n2 !== n0) fail(`추가/삭제 실패 ${n0} ${n1} ${n2}`);
  for (let i = 0; i < 8; i++) await page.keyboard.press('Meta+z');
  const r = await geo(1);
  if (r.midi !== g.midi || Math.abs(r.t - g.t) > 1e-6) fail('되돌리기 실패');
  // 5) Tab 키 선택 이동, 재생 시작/정지
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space'); await page.waitForTimeout(400); await page.keyboard.press('Space');
  // 6) TAB 텍스트 내보내기
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.querySelector('#exAscii').click())]);
  const txt = await (await dl.createReadStream()).toArray().then(c => Buffer.concat(c).toString());
  if (!/^e\|/m.test(txt)) fail('TAB 텍스트 이상\n' + txt);
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
  if (errs.length) fail('페이지 오류: ' + errs.join(' | '));
  console.log('OK ui smoke');
  console.log(txt.split('\n').slice(0, 9).join('\n'));
} finally { await browser.close(); srv.kill(); }
