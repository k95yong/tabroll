// 화면 요소와 모듈을 연결한다.
import { store, noteName } from './state.js';
import { Synth } from './synth.js';
import { Transport } from './transport.js';
import { View } from './view.js';
import { Editor } from './editor.js';
import { IO } from './io.js';
import { MidiInput } from './midiin.js';
import { Inspector } from './inspector.js';
import { buildKeymap, extraHandler, comboOf, helpHtml } from './keymap.js';
import { Tips, ZONE_TIPS } from './tips.js';
import { KEY_W, RULER, TOP } from './view.js';
import { printHtml } from './print.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const RATES = [0.25, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25];

// ---------- 알림 ----------
let toastT = 0;
function notify(text, ms = 2600) { const el = $('#toast'); el.textContent = text; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => (el.style.opacity = 0), ms); }

// ---------- 모듈 ----------
const media = $('#media');
const synth = new Synth();
const tr = new Transport(media, synth);
const view = new View({ roll: $('#roll'), tab: $('#tab'), overview: $('#overview') }, tr);
const ed = new Editor(view, tr, notify);
const io = new IO({
  media, view, synth, notify,
  onMedia: (name) => { $('#mediaName').textContent = name; hideWelcome(); },
});
const midi = new MidiInput(tr, synth, {
  view,
  onState: (text, ok) => { $('#midiState').textContent = text; $('#midiState').className = ok ? 'ok' : ''; },
  onRec: on => { $('#rec').classList.toggle('rec-on', on); notify(on ? '건반 녹음 켬: 재생하면서 치면 음이 들어옵니다' : '건반 녹음 끔'); },
});
const inspector = new Inspector($('#inspector'), ed, tr);
ed.attach();

// ---------- 풍선 도움말 ----------
const tips = new Tips();
$('#tipsOn').checked = tips.on;
$('#tipsOn').onchange = e => tips.setEnabled(e.target.checked);
const at = (e, c) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
$('#roll').addEventListener('mousemove', e => {
  if (ed.drag) return tips.hide();
  const [x, y] = at(e, $('#roll')), h = y >= TOP && x >= KEY_W ? view.hit(x, y) : null;
  tips.show(ZONE_TIPS[x < KEY_W ? 'keys' : y < RULER ? 'ruler' : y < TOP ? 'wave' : h ? (h.part === 'mid' ? 'note' : 'edge') : 'empty'], e);
});
$('#tab').addEventListener('mousemove', e => { const [x, y] = at(e, $('#tab')), h = view.hitTab(x, y); tips.show(ZONE_TIPS[h?.ghost ? 'ghost' : h ? 'tabNum' : 'tabEmpty'], e); });
$('#overview').addEventListener('mousemove', e => tips.show(ZONE_TIPS.overview, e));
for (const id of ['#roll', '#tab', '#overview']) $(id).addEventListener('mouseleave', () => tips.hide());

// ---------- 앱 동작 (단축키·버튼 공용) ----------
const app = {
  store, tr, view, ed, io, midi,
  playFromView() { tr.stop(); tr.play(tr.loop.on ? tr.loop.a : Math.max(0, view.s)); },
  toggleLoop() { tr.toggleLoop([Math.max(0, view.s), view.e]); notify(tr.loop.on ? `반복 ${tr.loop.a.toFixed(2)}s ~ ${tr.loop.b.toFixed(2)}s` : '반복 끔'); },
  toggleMetro() { tr.metro = !tr.metro; $('#metro').classList.toggle('on', tr.metro); },
  toggleFollow() { view.follow = !view.follow; $('#follow').classList.toggle('on', view.follow); notify(view.follow ? '재생 위치를 따라갑니다' : '화면 고정'); },
  setOffsetHere() { store.setMeta({ offset: +tr.clock().toFixed(3) }); syncInputs(); notify(`1마디 시작 = ${store.P.offset.toFixed(2)}초`); },
  setRate(r) { tr.setRate(r); $('#rate').value = r; notify(`속도 ${Math.round(r * 100)}%`); },
  setMix(mode) {
    const vm = mode === 2 ? 0 : 1, vn = mode === 1 ? 0 : 0.6;
    tr.setMediaVol(vm); tr.setNotesVol(vn); $('#volMedia').value = vm; $('#volNotes').value = vn;
    notify({ 1: '원음만', 2: '악보 소리만', 3: '원음 + 악보' }[mode]);
  },
  hearSel() { store.selected().forEach(n => tr.audition(n)); },
  cycleBend() { const n = store.primary(); if (n) ed.setBend(n.tech === 'b' ? (n.bend % 3) + 1 : 2); },
  help(show) { $('#helpBox').hidden = !show; },
};

// ---------- 단축키 ----------
const keymap = buildKeymap(app), extra = extraHandler(app);
const byCombo = new Map(); for (const [, combos, , fn] of keymap) if (fn) for (const c of combos) byCombo.set(c, fn);
$('#helpBody').innerHTML = helpHtml(keymap);
document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) { if (e.key === 'Escape' || e.key === 'Enter') e.target.blur(); return; }
  if (!$('#helpBox').hidden) { if (e.key === 'Escape' || e.key === '?') app.help(false); return; }
  if (!$('#sheetBox').hidden && e.key === 'Escape') { app.toggleSheet(); return; }
  if (e.repeat && /^(Space|L|M|K|F|O)$/.test(comboOf(e))) return;
  const combo = comboOf(e), fn = byCombo.get(combo);
  if (fn) { e.preventDefault(); fn(); return; }
  if (extra(combo)) e.preventDefault();
});

// ---------- 도구줄 ----------
$('#rate').innerHTML = RATES.map(r => `<option value="${r}"${r === 1 ? ' selected' : ''}>${Math.round(r * 100)}%</option>`).join('');
$('#rate').onchange = e => app.setRate(+e.target.value);
$('#play').onclick = () => tr.toggle();
$('#loop').onclick = () => app.toggleLoop();
$('#metro').onclick = () => app.toggleMetro();
$('#rec').onclick = () => midi.toggleRec();
$('#follow').onclick = () => app.toggleFollow();
$('#volMedia').oninput = e => tr.setMediaVol(+e.target.value);
$('#volNotes').oninput = e => tr.setNotesVol(+e.target.value);
$('#openMedia').onclick = () => io.pickMedia();
$('#openProject').onclick = () => io.pickProject();
$('#saveProject').onclick = () => io.save();
$('#exJson').onclick = () => io.save(true);
$('#exMidi').onclick = () => io.exportMidi();
$('#exAscii').onclick = () => io.exportAscii();
$('#exPrint').onclick = () => io.print();
$('#tidy').onclick = () => ed.tidy();
// 악보 미리보기: 인쇄될 TAB을 그대로 보여 주고, 고칠 때마다 다시 그린다
let sheetT = 0;
function refreshSheet() { if ($('#sheetBox').hidden) return; clearTimeout(sheetT); sheetT = setTimeout(() => { $('#sheetFrame').srcdoc = printHtml(store.P, [...store.tab.values()], { autoPrint: false }); }, 150); }
app.toggleSheet = () => { $('#sheetBox').hidden = !$('#sheetBox').hidden; refreshSheet(); };
$('#sheet').onclick = () => app.toggleSheet();
$('#sheetClose').onclick = () => app.toggleSheet();
$('#sheetPrint').onclick = () => io.print();
store.on(kind => { if (kind !== 'select') refreshSheet(); });
$('#undo').onclick = () => store.undo();
$('#redo').onclick = () => store.redo();
$('#help').onclick = () => app.help(true);
$('#helpBox').onclick = e => { if (e.target.id === 'helpBox') app.help(false); };
$('#setOffset').onclick = () => app.setOffsetHere();
$('#title').oninput = e => { store.P.title = e.target.value; store.changed('meta'); };
$('#bpm').onchange = e => store.setMeta({ bpm: Math.min(300, Math.max(30, +e.target.value || 120)) });
$('#offset').onchange = e => store.setMeta({ offset: +e.target.value || 0 });
$('#beats').onchange = e => store.setMeta({ beatsPerBar: +e.target.value });
$$('[data-snap]').forEach(b => b.onclick = () => { store.snap = +b.dataset.snap; syncSnap(); view.draw(); });
function syncSnap() { $$('[data-snap]').forEach(x => x.classList.toggle('on', +x.dataset.snap === store.snap)); }
function syncInputs() {
  $('#title').value = store.P.title; $('#bpm').value = store.P.bpm;
  $('#offset').value = (+store.P.offset).toFixed(2); $('#beats').value = store.P.beatsPerBar;
}

// ---------- 끌어다 놓기 ----------
for (const ev of ['dragover', 'drop']) document.addEventListener(ev, e => e.preventDefault());
document.addEventListener('drop', e => [...e.dataTransfer.files].forEach(f => io.openFile(f)));
$('#side').addEventListener('dragenter', () => $('#side').classList.add('drag'));
for (const ev of ['dragleave', 'drop']) $('#side').addEventListener(ev, () => $('#side').classList.remove('drag'));

// ---------- 시작 안내 ----------
function hideWelcome() { $('#welcome').hidden = true; }
$('#welcome').addEventListener('click', e => {
  const w = e.target.closest('[data-w]')?.dataset.w; if (!w) return;
  if (w === 'media') io.pickMedia();
  if (w === 'project') io.pickProject();
  if (w === 'demo') io.openUrlProject('examples/demo.tabroll.json');
  hideWelcome();
});

// ---------- 화면 갱신 ----------
function refreshStatus() {
  const sel = store.selected();
  $('#selInfo').textContent = sel.length === 1 ? `선택: ${noteName(sel[0].midi)} · ${sel[0].t.toFixed(3)}s` : sel.length ? `${sel.length}음 선택` : '';
  $('#saved').textContent = store.dirty ? '● 저장 안 됨 (브라우저에는 자동 저장)' : '';
  $('#saved').className = store.dirty ? 'dirty' : '';
  $('#undo').disabled = !store.undoStack.length; $('#redo').disabled = !store.redoStack.length;
}
store.on(kind => {
  if (kind === 'load') { syncInputs(); if (store.notes.length) hideWelcome(); }
  if (kind === 'meta') syncInputs();
  inspector.render(); refreshStatus(); view.draw();
});
tr.on(kind => {
  if (kind === 'play' || kind === 'stop') $('#play').textContent = tr.playing ? '⏸' : '▶';
  if (kind === 'loop') $('#loop').classList.toggle('on', tr.loop.on);
  if (kind !== 'tick') view.draw();
});
(function frame() {
  if (tr.playing) view.render();
  $('#time').textContent = `${tr.clock().toFixed(2)}s`;
  requestAnimationFrame(frame);
})();
addEventListener('resize', () => view.draw());
addEventListener('beforeunload', () => io.autosave());

// ---------- 시작 ----------
(async function boot() {
  io.backupAutosave();
  const q = new URLSearchParams(location.search), src = q.get('project'), auto = io.restore();
  try {
    // 같은 프로젝트를 다시 열면 자동 저장본을 이어서 쓴다. 단, 파일 쪽이 더 최근에 저장됐으면 파일을 연다.
    let fileObj = null;
    if (src) { try { fileObj = await (await fetch(src)).json(); } catch { /* 아래에서 처리 */ } }
    const stamp = o => Math.max(Date.parse(o?.saved || 0) || 0, Date.parse(o?.tidied || 0) || 0);
    const edited = Date.parse(auto?.editedAt || 0) || 0; // 자동 저장본에서 실제로 고친 시각
    const useAuto = auto && (!src || (auto._source === src && edited && edited >= stamp(fileObj)));
    if (useAuto) { store.load(auto); view.fitAll(); notify('자동 저장본을 이어서 엽니다'); }
    else if (fileObj) { store.load({ ...fileObj, _source: src }); view.fitAll(); }
    if (q.get('media')) await io.openMedia(q.get('media'), { wave: q.get('wave') });
  } catch (e) { notify('시작 파일을 읽지 못했습니다: ' + e.message, 5000); }
  syncInputs(); syncSnap(); store.retab(); inspector.render(); refreshStatus();
  if (!store.notes.length && !media.src && !q.get('media')) $('#welcome').hidden = false;
  view.draw();
})();

// 테스트·디버깅용
window.tabroll = { store, view, tr, ed, io };
