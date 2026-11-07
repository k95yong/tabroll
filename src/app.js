import { assignFrets, asciiTab, STRING_NAMES } from './tab.js';
import { writeMidi, readMidi } from './midifile.js';
import { Synth } from './synth.js';
import { printHtml } from './print.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const NN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = m => NN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const AUTOSAVE = 'tabroll:autosave';
const TECH_KEYS = { h: 'h', p: 'p', b: 'b', r: 'r', s: 's', v: 'v', x: 'x' };
const TECH_LABEL = { h: '해머링', p: '풀링', b: '벤딩', r: '릴리즈', s: '슬라이드', v: '비브라토', x: '뮤트' };

// ---------- 상태 ----------
let P = blankProject();
let nextId = 1, sel = null, snap = 16, undoStack = [], redoStack = [], dirty = false;
let viewS = -0.2, viewE = 4, tabbed = new Map();
let fileHandle = null;
const media = $('#media'), synth = new Synth();

function blankProject() {
  return { app: 'tabroll', version: 1, title: '새 채보', bpm: 120, offset: 0, beatsPerBar: 4, maxFret: 22, notes: [], media: null };
}
const barLen = () => 60 / P.bpm * P.beatsPerBar;
const barStart = b => P.offset + (b - 1) * barLen(); // b는 1부터
const barAt = t => Math.floor((t - P.offset) / barLen() + 1e-6) + 1;
const snapStep = () => (snap ? barLen() / (snap * P.beatsPerBar / 4) : 0);
function snapT(t, free = false) {
  const s = snapStep(); if (!s || free) return t;
  const b0 = barStart(barAt(t));
  return b0 + Math.round((t - b0) / s) * s;
}
const byTime = () => [...P.notes].sort((a, b) => a.t - b.t || a.midi - b.midi);
const selNote = () => P.notes.find(n => n.id === sel);
const msg = (s, ms = 2500) => { $('#msg').textContent = s; clearTimeout(msg.t); msg.t = setTimeout(() => ($('#msg').textContent = ''), ms); };

// ---------- 변경·되돌리기·저장 ----------
const snapshot = () => JSON.stringify(P.notes);
function edit(fn, { merge = false } = {}) {
  if (!merge) { undoStack.push(snapshot()); if (undoStack.length > 300) undoStack.shift(); redoStack = []; }
  fn();
  changed();
}
function changed() {
  dirty = true;
  recomputeTab();
  $('#saved').textContent = '● 저장 안 됨';
  clearTimeout(changed.t);
  changed.t = setTimeout(() => localStorage.setItem(AUTOSAVE, JSON.stringify(P)), 400);
  draw();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); P.notes = JSON.parse(undoStack.pop()); if (!selNote()) sel = null; changed(); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); P.notes = JSON.parse(redoStack.pop()); if (!selNote()) sel = null; changed(); }
function recomputeTab() {
  tabbed = new Map(assignFrets(P.notes, { maxFret: P.maxFret }).map(n => [n.id, n]));
}

function loadProject(obj, { name } = {}) {
  const notes = Array.isArray(obj) ? obj : obj.notes || [];
  const base = Array.isArray(obj) ? {} : obj;
  P = { ...blankProject(), ...base, notes: [] };
  nextId = 1;
  P.notes = notes.filter(n => isFinite(n.t) && isFinite(n.midi)).map(n => ({
    id: nextId++, t: +n.t, te: +(n.te ?? n.t + 0.2), midi: Math.round(n.midi), vel: n.vel ?? 96,
    tech: n.tech && TECH_KEYS[n.tech] ? n.tech : '', bend: n.bend ?? (n.tech === 'b' ? 2 : 0),
    lockString: n.lockString || null, src: n.src || 'import',
  }));
  undoStack = []; redoStack = []; sel = null;
  syncInputs(); recomputeTab(); fitView();
  dirty = false; $('#saved').textContent = name ? `불러옴: ${name}` : '';
  localStorage.setItem(AUTOSAVE, JSON.stringify(P));
  if (P.media?.name && !media.src) $('#mediaName').textContent = `이 프로젝트의 음원: ${P.media.name} (📂로 열어 주십시오)`;
  draw();
}
function projectJson() {
  return JSON.stringify({ ...P, notes: byTime().map(({ id, ...n }) => ({ ...n, t: +n.t.toFixed(4), te: +n.te.toFixed(4) })), saved: new Date().toISOString() }, null, 1);
}
function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const safeName = () => (P.title || 'tabroll').replace(/[\\/:*?"<>|]/g, '_');
async function saveProject(saveAs = false) {
  const data = projectJson();
  try {
    if (window.showSaveFilePicker) {
      if (!fileHandle || saveAs) fileHandle = await showSaveFilePicker({ suggestedName: `${safeName()}.tabroll.json`, types: [{ description: 'TabRoll 프로젝트', accept: { 'application/json': ['.json'] } }] });
      const w = await fileHandle.createWritable(); await w.write(data); await w.close();
    } else download(`${safeName()}.tabroll.json`, data, 'application/json');
    dirty = false; $('#saved').textContent = `✓ 저장함 ${new Date().toLocaleTimeString()}`;
  } catch (e) { if (e.name !== 'AbortError') msg('저장 실패: ' + e.message); }
}

// ---------- 파일 열기 ----------
function openMediaFile(f) {
  media.src = URL.createObjectURL(f);
  media.classList.toggle('audio-only', f.type.startsWith('audio'));
  P.media = { name: f.name };
  $('#mediaName').textContent = f.name;
  media.onloadedmetadata = () => { if (!P.notes.length) fitView(); drawOverview(); };
}
async function openAnyFile(f) {
  if (/^(audio|video)\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|flac|mp4|mov|webm|mkv)$/i.test(f.name)) return openMediaFile(f);
  if (/\.midi?$/i.test(f.name)) {
    const { notes, bpm } = readMidi(await f.arrayBuffer());
    if (P.notes.length && !confirm(`MIDI 음 ${notes.length}개로 지금 음을 바꿀까요?`)) return;
    loadProject({ ...P, bpm: P.notes.length ? P.bpm : bpm, notes: notes.map(n => ({ ...n, src: 'midi' })) }, { name: f.name });
    return;
  }
  try {
    const obj = JSON.parse(await f.text());
    if (dirty && P.notes.length && !confirm('저장 안 된 변경이 있습니다. 불러올까요?')) return;
    loadProject(obj, { name: f.name });
  } catch (e) { msg('읽을 수 없는 파일입니다: ' + f.name); }
}
$('#openMedia').onclick = () => $('#fileMedia').click();
$('#openProject').onclick = () => $('#fileProject').click();
$('#fileMedia').onchange = e => e.target.files[0] && openMediaFile(e.target.files[0]);
$('#fileProject').onchange = e => { e.target.files[0] && openAnyFile(e.target.files[0]); e.target.value = ''; };
for (const ev of ['dragover', 'drop']) document.addEventListener(ev, e => e.preventDefault());
document.addEventListener('drop', e => [...e.dataTransfer.files].forEach(openAnyFile));
$('#side').addEventListener('dragenter', () => $('#side').classList.add('drag'));
$('#side').addEventListener('dragleave', () => $('#side').classList.remove('drag'));
$('#side').addEventListener('drop', () => $('#side').classList.remove('drag'));

$('#saveProject').onclick = () => saveProject();
$('#exJson').onclick = () => saveProject(true);
$('#exMidi').onclick = () => download(`${safeName()}.mid`, writeMidi(byTime(), P.bpm), 'audio/midi');
$('#exAscii').onclick = () => download(`${safeName()}_TAB.txt`, asciiTab([...tabbed.values()], { ...P, grid: snap >= 32 ? 32 : 16, title: `${P.title}  (♩=${P.bpm})` }), 'text/plain');
$('#exPrint').onclick = printTab;
function printTab() {
  const w = window.open('', '_blank');
  if (!w) return msg('팝업이 막혔습니다. 이 사이트의 팝업을 허용해 주십시오.');
  w.document.write(printHtml(P, [...tabbed.values()])); w.document.close();
}

// ---------- 헤더 입력 ----------
function syncInputs() {
  $('#title').value = P.title; $('#bpm').value = P.bpm; $('#offset').value = (+P.offset).toFixed(2); $('#beats').value = P.beatsPerBar;
}
$('#title').oninput = e => { P.title = e.target.value; changed(); };
$('#bpm').onchange = e => { P.bpm = Math.max(30, +e.target.value || 120); changed(); };
$('#offset').onchange = e => { P.offset = +e.target.value || 0; changed(); };
$('#beats').onchange = e => { P.beatsPerBar = +e.target.value; changed(); };
$('#setOffset').onclick = () => { P.offset = +clock().toFixed(3); syncInputs(); changed(); msg(`1마디 시작을 ${P.offset.toFixed(2)}초로 맞췄습니다`); };
$$('[data-snap]').forEach(b => b.onclick = () => setSnap(+b.dataset.snap));
function setSnap(v) { snap = v; $$('[data-snap]').forEach(x => x.classList.toggle('on', +x.dataset.snap === v)); draw(); }

// ---------- 재생 ----------
let playing = false, anchor = { perf: 0, t: 0 }, cursorT = 0, loopOn = false, metroOn = false;
let scheduled = new Map(), voices = [], schedTimer = null, nextBeat = 0;
const rate = () => +$('#rate').value;
function clock() {
  if (!playing) return cursorT;
  return anchor.t + (performance.now() - anchor.perf) / 1000 * rate();
}
function stopVoices() { voices.forEach(v => v.stop()); voices = []; scheduled.clear(); }
function play(from = cursorT) {
  synth.resume();
  cursorT = from; playing = true;
  anchor = { perf: performance.now(), t: from };
  stopVoices();
  nextBeat = Math.ceil((from - P.offset) / (60 / P.bpm) - 1e-6);
  if (media.src) {
    media.playbackRate = rate(); media.preservesPitch = true;
    media.volume = +$('#volMedia').value;
    media.currentTime = Math.max(0, from);
    media.play().catch(() => {});
  }
  $('#play').textContent = '⏸';
  clearInterval(schedTimer); schedTimer = setInterval(schedule, 25); schedule();
}
function stop() {
  cursorT = clock(); playing = false;
  clearInterval(schedTimer); stopVoices(); media.pause(); flushRecording();
  $('#play').textContent = '▶'; draw();
}
function seek(t) { const was = playing; if (was) stop(); cursorT = Math.max(0, t); if (was) play(cursorT); else draw(); }
function schedule() {
  let t = clock();
  // 영상과 시계가 벌어지면 영상 쪽에 맞춘다
  if (media.src && !media.paused && Math.abs(media.currentTime - t) > 0.08) { anchor = { perf: performance.now(), t: media.currentTime }; t = media.currentTime; }
  if (loopOn && t >= viewE) { seek(Math.max(0, viewS)); return; }
  if (media.src && media.ended) { stop(); return; }
  const horizon = t + 0.25 * rate(), gainNotes = +$('#volNotes').value;
  synth.volume = gainNotes;
  if (gainNotes > 0) for (const n of P.notes) {
    if (n.t < t - 0.01 || n.t >= horizon || scheduled.has(n.id)) continue;
    const when = synth.now + (n.t - t) / rate(), until = synth.now + (n.te - t) / rate();
    scheduled.set(n.id, true);
    voices.push(synth.note(n.midi, { when, until, vel: n.vel, bendTo: n.tech === 'b' ? n.midi + (n.bend || 2) : null, vibrato: n.tech === 'v' }));
  }
  if (metroOn) {
    const beat = 60 / P.bpm;
    while (P.offset + nextBeat * beat < horizon) {
      const bt = P.offset + nextBeat * beat;
      if (bt >= t - 0.01) synth.click(synth.now + (bt - t) / rate(), ((nextBeat % P.beatsPerBar) + P.beatsPerBar) % P.beatsPerBar === 0);
      nextBeat++;
    }
  }
  if (voices.length > 64) voices = voices.slice(-32);
  // 재생 위치가 화면 밖으로 나가면 따라간다
  if (!loopOn && t > viewE - (viewE - viewS) * 0.05) { const w = viewE - viewS; viewS = t - w * 0.05; viewE = viewS + w; }
}
$('#play').onclick = () => (playing ? stop() : play());
$('#loop').onclick = () => toggleLoop();
$('#metro').onclick = () => { metroOn = !metroOn; $('#metro').classList.toggle('on', metroOn); };
function toggleLoop() { loopOn = !loopOn; $('#loop').classList.toggle('on', loopOn); msg(loopOn ? '보이는 구간을 반복합니다' : '반복 해제'); }
$('#rate').onchange = () => { if (playing) { const t = clock(); stop(); play(t); } };
$('#volMedia').oninput = e => (media.volume = +e.target.value);
function setMix(mode) {
  const vm = mode === 2 ? 0 : 1, vn = mode === 1 ? 0 : 0.6;
  $('#volMedia').value = vm; $('#volNotes').value = vn; media.volume = vm;
  msg({ 1: '원음만', 2: '악보 소리만', 3: '원음 + 악보' }[mode]);
}
function audition(n) { synth.resume(); const v = synth.note(n.midi, { until: synth.now + 0.4, vel: 100 }); voices.push(v); }

// ---------- MIDI 건반 ----------
let recOn = false, held = new Map(), monitor = new Map();
function onMidi(e) {
  const [st, note, vel] = e.data, type = st & 0xf0;
  if (type === 0x90 && vel > 0) {
    synth.resume();
    monitor.get(note)?.stop(); monitor.set(note, synth.note(note, { vel }));
    if (recOn && playing) held.set(note, { t: clock(), midi: note, vel });
    else if (!recOn && sel) { // 녹음 중이 아니면 선택한 음의 높이를 건반으로 바꾼다
      const n = selNote(); if (n) edit(() => { n.midi = note; n.src = 'user'; });
    }
  } else if (type === 0x80 || (type === 0x90 && vel === 0)) {
    monitor.get(note)?.stop(); monitor.delete(note);
    const h = held.get(note); held.delete(note);
    if (h) addRecorded({ ...h, te: clock() });
  }
}
function addRecorded(h) {
  if (h.te - h.t < 0.03) return;
  edit(() => {
    // 단선율: 새 음과 겹치는 앞 음은 새 음 직전에서 끊는다
    for (const n of P.notes) if (n.t < h.t && n.te > h.t && n.src === 'rec') n.te = h.t;
    P.notes.push({ id: nextId++, t: h.t, te: h.te, midi: h.midi, vel: h.vel, tech: '', bend: 0, lockString: null, src: 'rec' });
  });
}
function flushRecording() { const t = clock(); for (const h of held.values()) addRecorded({ ...h, te: t }); held.clear(); }
function toggleRec() { recOn = !recOn; $('#rec').classList.toggle('rec-on', recOn); msg(recOn ? '건반 녹음 켬: 재생 중에 치시면 음이 들어옵니다' : '건반 녹음 끔'); }
$('#rec').onclick = toggleRec;
if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess().then(acc => {
    const bind = () => {
      const names = []; acc.inputs.forEach(i => { i.onmidimessage = onMidi; names.push(i.name); });
      $('#midiState').textContent = names.length ? `🎹 ${names[0]}` : '건반 없음 (마우스·키보드로 편집)';
      $('#midiState').className = names.length ? 'ok' : '';
    };
    bind(); acc.onstatechange = bind;
  }, () => ($('#midiState').textContent = '건반 권한 없음'));
} else $('#midiState').textContent = '이 브라우저는 MIDI 건반을 지원하지 않습니다';

// ---------- 화면 ----------
const roll = $('#roll'), rg = roll.getContext('2d');
const tabC = $('#tab'), tg = tabC.getContext('2d');
const ov = $('#overview'), og = ov.getContext('2d');
const KEY_W = 48, RULER = 20;
let lay = null;
function pitchRange() {
  const ms = P.notes.map(n => n.midi);
  let lo = ms.length ? Math.min(...ms) - 3 : 52, hi = ms.length ? Math.max(...ms) + 3 : 76;
  if (hi - lo < 20) { const c = (hi + lo) / 2; lo = Math.floor(c - 10); hi = Math.ceil(c + 10); }
  return [lo, hi];
}
function fitCanvas(c, h) {
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const H = h ?? r.height;
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [r.width, H];
}
const X = t => KEY_W + (t - viewS) / (viewE - viewS) * (lay.w - KEY_W);
const T = x => viewS + (x - KEY_W) / (lay.w - KEY_W) * (viewE - viewS);

function draw() {
  if (draw.q) return;
  draw.q = requestAnimationFrame(() => { draw.q = 0; drawRoll(); drawTab(); drawOverview(); drawInfo(); });
}
function drawRoll() {
  const [w, h] = fitCanvas(roll);
  const [lo, hi] = drag?.range || pitchRange();
  const rh = (h - RULER) / (hi - lo + 1);
  lay = { w, h, lo, hi, rh, Y: m => RULER + (hi - m) * rh, M: y => hi - Math.floor((y - RULER) / rh) };
  const g = rg;
  g.fillStyle = '#14161b'; g.fillRect(0, 0, w, h);
  for (let m = lo; m <= hi; m++) {
    const black = [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
    g.fillStyle = black ? '#121419' : '#1a1d23'; g.fillRect(KEY_W, lay.Y(m), w - KEY_W, rh);
    g.fillStyle = black ? '#2a2d34' : '#d8d8d8'; g.fillRect(0, lay.Y(m), KEY_W - 4, rh - 0.5);
    if (rh >= 9) { g.fillStyle = black ? '#aaa' : '#333'; g.font = `${Math.min(11, rh - 2)}px -apple-system`; g.fillText(nm(m), 4, lay.Y(m) + rh - 3); }
  }
  // 격자
  const s = snapStep(), beat = 60 / P.bpm;
  const b1 = barAt(viewS) - 1, b2 = barAt(viewE) + 1;
  g.font = '11px -apple-system';
  for (let b = b1; b <= b2; b++) {
    const b0 = barStart(b);
    if (s && (viewE - viewS) / s < 400) for (let t = b0; t < b0 + barLen() - 1e-6; t += s) { const x = X(t); if (x > KEY_W) { g.fillStyle = '#ffffff0c'; g.fillRect(x, RULER, 1, h); } }
    for (let q = 0; q < P.beatsPerBar; q++) {
      const x = X(b0 + q * beat); if (x < KEY_W || x > w) continue;
      g.fillStyle = q ? '#ffffff22' : '#fbbf24aa'; g.fillRect(x, RULER, q ? 1 : 2, h);
      if (!q && b >= 1) { g.fillStyle = '#fbbf24'; g.fillText(`${b}마디`, x + 3, 14); }
      else if (q && X(b0 + beat) - X(b0) > 40) { g.fillStyle = '#6b7280'; g.fillText(`${q + 1}`, x + 3, 14); }
    }
  }
  g.fillStyle = '#ffffff10'; g.fillRect(KEY_W, 0, w, RULER);
  // 음
  g.save(); g.beginPath(); g.rect(KEY_W, RULER, w - KEY_W, h); g.clip();
  for (const n of P.notes) {
    if (n.te < viewS || n.t > viewE) continue;
    const x0 = X(n.t), x1 = Math.max(X(n.te), x0 + 4), y = lay.Y(n.midi);
    const col = n.id === sel ? '#f472b6' : n.src === 'user' ? '#a78bfa' : n.src === 'rec' ? '#fb923c' : '#9ca3af';
    g.fillStyle = col; g.fillRect(x0, y + 1, x1 - x0, rh - 2);
    g.fillStyle = '#ffffff66'; g.fillRect(x0, y + 1, 3, rh - 2); g.fillRect(x1 - 3, y + 1, 3, rh - 2);
    if (n.id === sel) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x0, y + 1, x1 - x0, rh - 2); }
    if (x1 - x0 > 24 && rh > 9) { g.fillStyle = '#111'; g.font = `600 ${Math.min(11, rh - 3)}px -apple-system`; g.fillText(nm(n.midi) + (n.tech ? ' ' + n.tech : ''), x0 + 5, y + rh - 3); }
  }
  for (const h0 of held.values()) { const x0 = X(h0.t), x1 = X(clock()); g.fillStyle = '#fdba74'; g.fillRect(x0, lay.Y(h0.midi) + 1, Math.max(3, x1 - x0), rh - 2); }
  g.restore();
  // 재생선
  const px = X(clock());
  if (px >= KEY_W && px <= w) { g.fillStyle = '#4ade80'; g.fillRect(px - 1, 0, 2, h); }
  if (loopOn) { g.fillStyle = '#7c3aed33'; g.fillRect(KEY_W, 0, w, 4); }
}
function drawTab() {
  const [w, h] = fitCanvas(tabC, 150);
  const g = tg, top = 22, gap = 20;
  g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, w, h);
  for (let s = 1; s <= 6; s++) {
    const y = top + (s - 1) * gap;
    g.fillStyle = '#999'; g.fillRect(KEY_W, y, w - KEY_W, 1);
    g.fillStyle = '#555'; g.font = '11px -apple-system'; g.fillText(STRING_NAMES[s], 18, y + 4);
  }
  g.font = '700 11px -apple-system'; g.fillStyle = '#333'; g.fillText('TAB', 6, top - 8);
  const b1 = barAt(viewS), b2 = barAt(viewE);
  for (let b = b1; b <= b2; b++) { const x = X(barStart(b)); if (x >= KEY_W) { g.fillStyle = '#333'; g.fillRect(x, top, 1.5, gap * 5); } }
  for (const n of tabbed.values()) {
    if (n.t < viewS || n.t > viewE) continue;
    const x = X(n.t), y = top + (n.string - 1) * gap;
    const label = n.fret < 0 ? '?' : n.tech === 'x' ? 'x' : String(n.fret);
    g.font = `${n.id === sel ? 800 : 600} 13px -apple-system`;
    const tw = g.measureText(label).width;
    g.fillStyle = '#f7f7f5'; g.fillRect(x - 2, y - 8, tw + 4, 16);
    g.fillStyle = n.id === sel ? '#db2777' : n.fret < 0 ? '#dc2626' : n.lockString ? '#1d4ed8' : '#111';
    g.fillText(label, x, y + 5);
    if (n.tech && n.tech !== 'x') { g.font = '10px -apple-system'; g.fillStyle = '#b45309'; g.fillText({ h: 'h', p: 'p', b: `b${n.bend || 2}`, r: 'r', s: '/', v: '~' }[n.tech], x + tw + 2, y - 3); }
  }
  const px = X(clock()); if (px >= KEY_W) { g.fillStyle = '#16a34a'; g.fillRect(px - 1, 0, 2, h); }
}
function songEnd() { return Math.max(media.duration || 0, ...P.notes.map(n => n.te), viewE, 10); }
function drawOverview() {
  const [w, h] = fitCanvas(ov, 34), g = og, end = songEnd();
  g.fillStyle = '#0c0e12'; g.fillRect(0, 0, w, h);
  const ox = t => t / end * w;
  const [lo, hi] = pitchRange();
  g.fillStyle = '#6b7280';
  for (const n of P.notes) g.fillRect(ox(n.t), 4 + (hi - n.midi) / (hi - lo) * (h - 8), Math.max(1, ox(n.te) - ox(n.t)), 2);
  g.strokeStyle = '#3b82f6'; g.lineWidth = 2; g.strokeRect(ox(viewS), 1, ox(viewE) - ox(viewS), h - 2);
  g.fillStyle = '#4ade80'; g.fillRect(ox(clock()), 0, 2, h);
}
function drawInfo() {
  const n = selNote(), t = tabbed.get(sel);
  $('#sel').textContent = n ? `선택: ${nm(n.midi)} · ${n.t.toFixed(3)}s · 길이 ${(n.te - n.t).toFixed(3)}s` : '';
  $('#noteInfo').innerHTML = n && t ? `<b>${nm(n.midi)}</b> → ${t.string}번 줄 ${t.fret}프렛${n.lockString ? ' (고정)' : ''}<br>
    ${barAt(n.t)}마디 ${((n.t - barStart(barAt(n.t))) / (60 / P.bpm) + 1).toFixed(2)}박 · 주법: ${TECH_LABEL[n.tech] || '없음'}` :
    `음 ${P.notes.length}개 · ♩=${P.bpm} · 칸 ${snap ? snap + '분' : '자유'}<br><span class="dim">? 를 누르면 단축키가 나옵니다</span>`;
}
function fitView() {
  const ns = byTime();
  if (ns.length) { viewS = Math.max(0, barStart(barAt(ns[0].t)) - 0.2); viewE = viewS + barLen() * 2 + 0.4; }
  else { viewS = Math.max(0, P.offset - 0.2); viewE = viewS + barLen() * 2 + 0.4; }
}
function gotoBar(delta) {
  const b = barAt(viewS + 0.25) + delta, w = viewE - viewS;
  viewS = Math.max(-0.2, barStart(b) - 0.2); viewE = viewS + w;
  if (!playing) cursorT = Math.max(0, barStart(b)); draw();
}
function zoom(f, at = (viewS + viewE) / 2) {
  const w = Math.min(120, Math.max(0.4, (viewE - viewS) * f));
  const k = (at - viewS) / (viewE - viewS); viewS = at - w * k; viewE = viewS + w; draw();
}
addEventListener('resize', draw);
(function frame() { if (playing) { drawRoll(); drawTab(); drawOverview(); } requestAnimationFrame(frame); })();

// ---------- 마우스 편집 ----------
let drag = null;
const pos = (e, c = roll) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function hit(x, y) {
  if (!lay || y < RULER) return null;
  const m = lay.M(y);
  const cands = P.notes.filter(n => n.midi === m && x >= X(n.t) - 3 && x <= Math.max(X(n.te), X(n.t) + 4) + 3);
  const n = cands.sort((a, b) => (b.id === sel) - (a.id === sel))[0];
  if (!n) return null;
  const x0 = X(n.t), x1 = Math.max(X(n.te), x0 + 4);
  return { n, part: x1 - x0 > 16 && x - x0 < 6 ? 'l' : x1 - x < 6 ? 'r' : 'mid' };
}
roll.addEventListener('mousedown', e => {
  const [x, y] = pos(e);
  if (y < RULER) { seek(Math.max(0, T(x))); return; }
  const h = hit(x, y);
  if (!h) { sel = null; draw(); return; }
  sel = h.n.id; synth.resume(); audition(h.n);
  undoStack.push(snapshot()); redoStack = [];
  drag = { ...h, x0: x, y0: y, t: h.n.t, te: h.n.te, midi: h.n.midi, moved: false, range: [lay.lo, lay.hi] };
  draw();
});
addEventListener('mousemove', e => {
  const [x, y] = pos(e);
  if (!drag) {
    const h = lay && hit(x, y);
    roll.style.cursor = y < RULER ? 'pointer' : !h ? 'crosshair' : h.part === 'mid' ? 'grab' : 'ew-resize';
    return;
  }
  const d = drag, n = d.n, dt = T(x) - T(d.x0), free = e.shiftKey, minLen = Math.max(0.02, (snapStep() || 0.05) * 0.5);
  if (Math.abs(x - d.x0) + Math.abs(y - d.y0) > 2) d.moved = true;
  if (!d.moved) return;
  if (d.part === 'mid') {
    const len = d.te - d.t; n.t = Math.max(0, snapT(d.t + dt, free)); n.te = n.t + len;
    const m = Math.max(d.range[0], Math.min(d.range[1], d.midi + Math.round((d.y0 - y) / lay.rh)));
    if (m !== n.midi) { n.midi = m; audition(n); }
  } else if (d.part === 'r') n.te = Math.max(n.t + minLen, snapT(d.te + dt, free));
  else n.t = Math.max(0, Math.min(n.te - minLen, snapT(d.t + dt, free)));
  n.src = 'user'; recomputeTab(); draw();
});
addEventListener('mouseup', () => {
  if (!drag) return;
  const moved = drag.moved; drag = null;
  if (moved) changed(); else { undoStack.pop(); draw(); }
});
roll.addEventListener('dblclick', e => {
  const [x, y] = pos(e); if (y < RULER || hit(x, y)) return;
  const t = Math.max(0, snapT(T(x))), len = snapStep() || barLen() / 16, m = lay.M(y);
  edit(() => { const n = { id: nextId++, t, te: t + len, midi: m, vel: 96, tech: '', bend: 0, lockString: null, src: 'user' }; P.notes.push(n); sel = n.id; audition(n); });
});
roll.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.metaKey || e.ctrlKey) { const [x] = pos(e); zoom(Math.exp(e.deltaY * 0.004), T(x)); return; }
  const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / lay.w * (viewE - viewS);
  viewS += d; viewE += d; draw();
}, { passive: false });
tabC.addEventListener('mousedown', e => {
  const [x, y] = pos(e, tabC), s = Math.round((y - 22) / 20) + 1;
  const n = [...tabbed.values()].filter(n => n.string === s && Math.abs(X(n.t) + 5 - x) < 12).sort((a, b) => Math.abs(X(a.t) - x) - Math.abs(X(b.t) - x))[0];
  if (n) { sel = n.id; audition(n); draw(); }
});
ov.addEventListener('mousedown', e => {
  const [x] = pos(e, ov), t = x / ov.getBoundingClientRect().width * songEnd(), w = viewE - viewS;
  viewS = t - w / 2; viewE = viewS + w; if (!playing) cursorT = Math.max(0, t); draw();
});

// ---------- 키보드 ----------
function moveSel(fn) { const n = selNote(); if (!n) return; edit(() => { fn(n); n.src = 'user'; }); }
function selectNeighbor(dir) {
  const ns = byTime(); if (!ns.length) return;
  const i = ns.findIndex(n => n.id === sel);
  const n = i < 0 ? ns.find(n => n.t >= viewS) || ns[0] : ns[Math.max(0, Math.min(ns.length - 1, i + dir))];
  sel = n.id; audition(n);
  if (n.t < viewS || n.t > viewE) { const w = viewE - viewS; viewS = n.t - w * 0.2; viewE = viewS + w; }
  draw();
}
document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  if (!$('#helpBox').hidden) { if (e.key === 'Escape' || e.key === '?') $('#helpBox').hidden = true; return; }
  const k = e.key, mod = e.metaKey || e.ctrlKey, n = selNote(), step = snapStep() || barLen() / 64;
  const handled = () => e.preventDefault();
  if (mod) {
    if (k === 'z' && !e.shiftKey) { handled(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { handled(); redo(); }
    else if (k === 's') { handled(); saveProject(e.shiftKey); }
    else if (k === 'o') { handled(); $('#fileMedia').click(); }
    else if (k === 'p') { handled(); printTab(); }
    else if (k === 'd' && n) { handled(); edit(() => { const c = { ...n, id: nextId++, t: n.te, te: n.te + (n.te - n.t), src: 'user' }; P.notes.push(c); sel = c.id; }); }
    return;
  }
  if (e.altKey && /^Digit[0-6]$/.test(e.code) && n) { handled(); const s = +e.code.slice(5); moveSel(x => (x.lockString = s || null)); msg(s ? `${s}번 줄로 고정` : '줄 자동 배치'); return; }
  switch (k) {
    case ' ': handled(); if (e.shiftKey) { stop(); play(Math.max(0, viewS)); } else playing ? stop() : play(); break;
    case 'Enter': if (n) { handled(); audition(n); } break;
    case 'ArrowUp': case 'ArrowDown': if (n) { handled(); moveSel(x => { x.midi += (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1); }); audition(n); } break;
    case 'ArrowLeft': case 'ArrowRight': if (n) {
      handled(); const d = k === 'ArrowRight' ? step : -step;
      if (e.shiftKey) moveSel(x => { x.te = Math.max(x.t + step * 0.5, x.te + d); });
      else moveSel(x => { x.t = Math.max(0, x.t + d); x.te = x.te + d; });
    } break;
    case 'Tab': handled(); selectNeighbor(e.shiftKey ? -1 : 1); break;
    case 'Delete': case 'Backspace': if (n) { handled(); const ns = byTime(), i = ns.indexOf(n); edit(() => { P.notes = P.notes.filter(x => x !== n); }); sel = (ns[i + 1] || ns[i - 1])?.id ?? null; draw(); } break;
    case 'Escape': sel = null; draw(); break;
    case 'q': if (n) moveSel(x => { const len = x.te - x.t; x.t = snapT(x.t); x.te = Math.max(x.t + step * 0.5, snapT(x.t + len)); }); break;
    case 'Q': edit(() => { for (const x of P.notes) if (x.t >= viewS && x.t <= viewE) { const len = x.te - x.t; x.t = snapT(x.t); x.te = Math.max(x.t + step * 0.5, snapT(x.t + len)); } }); msg('보이는 음을 칸에 맞췄습니다'); break;
    case 'n': case 'N': { const t = snapT(clock()); edit(() => { const c = { id: nextId++, t, te: t + (snapStep() || barLen() / 16), midi: n?.midi ?? 64, vel: 96, tech: '', bend: 0, lockString: null, src: 'user' }; P.notes.push(c); sel = c.id; audition(c); }); break; }
    case 'l': case 'L': toggleLoop(); break;
    case 'm': case 'M': $('#metro').click(); break;
    case 'k': case 'K': toggleRec(); break;
    case 'o': case 'O': $('#setOffset').click(); break;
    case '[': gotoBar(-1); break;
    case ']': gotoBar(1); break;
    case 'z': zoom(0.7); break;
    case 'Z': zoom(1 / 0.7); break;
    case '-': case '=': { const sel_ = $('#rate'), i = sel_.selectedIndex + (k === '=' ? 1 : -1); if (i >= 0 && i < sel_.options.length) { sel_.selectedIndex = i; sel_.onchange(); msg(`속도 ${Math.round(rate() * 100)}%`); } break; }
    case '1': case '2': case '3': setMix(+k); break;
    case '?': $('#helpBox').hidden = false; break;
    case '0': if (n) moveSel(x => { x.tech = ''; }); break;
    default: {
      const t = TECH_KEYS[k.toLowerCase()];
      if (t && n) { moveSel(x => { x.tech = x.tech === t ? '' : t; if (t === 'b' && !x.bend) x.bend = 2; }); msg(`주법: ${n.tech ? TECH_LABEL[n.tech] : '없음'}`); }
    }
  }
});
$('#help').onclick = () => ($('#helpBox').hidden = false);
$('#helpBox').onclick = e => { if (e.target.id === 'helpBox') $('#helpBox').hidden = true; };
addEventListener('beforeunload', e => { if (dirty && !localStorage.getItem(AUTOSAVE)) { e.preventDefault(); e.returnValue = ''; } });

// ---------- 시작 ----------
(async function boot() {
  const url = new URLSearchParams(location.search);
  try {
    const src = url.get('project'), auto = JSON.parse(localStorage.getItem(AUTOSAVE) || 'null');
    // 같은 프로젝트를 다시 열면 작업하던 자동 저장본을 이어서 쓴다
    if (src && !(auto && auto._source === src)) { loadProject({ ...(await (await fetch(src)).json()), _source: src }, { name: src.split('/').pop() }); }
    else if (auto) loadProject(auto, { name: '자동 저장본 이어서' });
    if (url.get('media')) { media.src = url.get('media'); P.media = { name: url.get('media') }; $('#mediaName').textContent = url.get('media'); media.classList.toggle('audio-only', /\.(mp3|wav|m4a|ogg|flac)$/i.test(url.get('media'))); }
  } catch (e) { msg('시작 파일을 읽지 못했습니다: ' + e.message); }
  syncInputs(); recomputeTab(); draw();
})();

// 테스트·디버깅용
window.tabroll = { get project() { return P; }, get tabbed() { return tabbed; }, get view() { return [viewS, viewE]; }, loadProject, X: t => X(t), get lay() { return lay; } };
