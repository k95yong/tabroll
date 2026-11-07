import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tidy, bestDivision, notate } from '../src/rhythm.js';

const bpm = 60, beat = 1, offset = 0; // 한 박 = 1초라 계산이 쉽다
let id = 1;
const N = (t, te, midi = 60) => ({ id: id++, t, te, midi });
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('16분 네 음은 16분으로, 여섯 음은 여섯잇단으로 고른다', () => {
  assert.equal(bestDivision([0.01, 0.26, 0.49, 0.77], 0, beat), 4);
  assert.equal(bestDivision([0, 0.17, 0.33, 0.5, 0.66, 0.84], 0, beat), 6);
  assert.equal(bestDivision([0.02, 0.51], 0, beat), 2);
});

test('박자 정리는 흔들린 시작을 칸에 붙인다', () => {
  const out = tidy([N(0.03, 0.2), N(0.24, 0.45), N(0.52, 0.7), N(0.76, 0.98)], { bpm, offset });
  assert.deepEqual(out.map(n => +n.t.toFixed(3)), [0, 0.25, 0.5, 0.75]);
});

test('겹친 음은 다음 음 시작에서 자르고, 짧은 빈틈은 메운다', () => {
  const out = tidy([N(0, 0.4), N(0.25, 0.4), N(0.5, 0.62), N(0.75, 1.0)], { bpm, offset });
  assert.ok(close(out[0].te, 0.25), `겹침 자르기 ${out[0].te}`);
  assert.ok(close(out[2].te, 0.75), `빈틈 메우기 ${out[2].te}`);
});

test('같은 칸에 같은 음이 두 번 있으면 하나로 합친다', () => {
  const out = tidy([N(0.01, 0.2, 64), N(0.02, 0.24, 64), N(0.5, 0.9)], { bpm, offset });
  assert.equal(out.length, 2);
});

test('리듬 표기: 16분은 빔 2개, 8분은 1개, 여섯잇단은 tuplet 6', () => {
  const sixteenth = tidy([N(0, 0.25), N(0.25, 0.5), N(0.5, 0.75), N(0.75, 1)], { bpm, offset });
  const r = notate(sixteenth, { bpm, offset });
  assert.ok([...r.values()].every(x => x.beams === 2));
  const eighth = tidy([N(1, 1.5), N(1.5, 2)], { bpm, offset });
  assert.ok([...notate(eighth, { bpm, offset }).values()].every(x => x.beams === 1));
  const six = tidy([0, 1, 2, 3, 4, 5].map(k => N(2 + k / 6, 2 + (k + 1) / 6)), { bpm, offset });
  const rs = [...notate(six, { bpm, offset }).values()];
  assert.ok(rs.every(x => x.tuplet === 6 && x.beams === 2));
});

test('음이 두 개뿐인 박은 잇단음표보다 단순한 쪼개기를 고른다', () => {
  assert.notEqual(bestDivision([0, 0.17], 0, beat), 6);
});

test('아무 음도 울리지 않는 박을 쉼표 자리로 찾는다', async () => {
  const { restBeats } = await import('../src/rhythm.js');
  const rs = restBeats([N(0, 0.9), N(2, 2.5)], { bpm, offset, beatsPerBar: 4 });
  assert.deepEqual(rs.map(r => r.beatInBar), [1, 3]);
});
