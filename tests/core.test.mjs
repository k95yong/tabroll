import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignFrets, asciiTab, candidates } from '../src/tab.js';
import { writeMidi, readMidi } from '../src/midifile.js';

const N = (t, midi, extra = {}) => ({ id: t * 100, t, te: t + 0.2, midi, ...extra });

test('후보 운지는 표준 튜닝 범위 안의 줄만 낸다', () => {
  assert.deepEqual(candidates(40).map(c => [c.string, c.fret]), [[6, 0]]);
  assert.equal(candidates(64).length, 5); // e 개방현부터 E 24프렛 밖 제외
  assert.equal(candidates(30).length, 0);
});

test('펜타토닉 런은 한 손 위치(10~13프렛) 안에 배치된다', () => {
  // F 장조 펜타토닉: F4 G4 A4 C5 D5 F5 (10프렛 박스)
  const run = [65, 67, 69, 72, 74, 77].map((m, i) => N(i * 0.25, m));
  const out = assignFrets(run);
  const frets = out.map(n => n.fret);
  assert.ok(Math.max(...frets) - Math.min(...frets) <= 4, `손 벌림이 너무 큼: ${frets}`);
});

test('줄 고정(lockString)을 지킨다', () => {
  const out = assignFrets([N(0, 69, { lockString: 3 })]);
  assert.equal(out[0].string, 3);
  assert.equal(out[0].fret, 14);
});

test('칠 수 없는 음은 fret -1로 표시한다', () => {
  assert.equal(assignFrets([N(0, 20)])[0].fret, -1);
});

test('ASCII TAB은 마디마다 6줄을 만들고 프렛과 주법을 적는다', () => {
  const notes = assignFrets([N(0, 69, { tech: 'v' }), N(0.5, 72, { tech: 'h' })]);
  const txt = asciiTab(notes, { bpm: 120, offset: 0, grid: 16 });
  const lines = txt.trim().split('\n');
  assert.equal(lines.filter(l => /^[eBGDAE]\|/.test(l)).length, 6);
  assert.match(txt, /~/);
  assert.match(txt, /h/);
});

test('MIDI 파일로 썼다 읽으면 음과 시간이 유지된다', () => {
  const notes = [N(0, 60), N(0.5, 64), N(1.25, 67)];
  const { notes: back, bpm } = readMidi(writeMidi(notes, 90).buffer);
  assert.equal(bpm, 90);
  assert.deepEqual(back.map(n => n.midi), [60, 64, 67]);
  back.forEach((n, i) => assert.ok(Math.abs(n.t - notes[i].t) < 0.005 && Math.abs(n.te - notes[i].te) < 0.005));
});
