// 음원에서 파형 요약(구간별 최대 진폭)을 뽑는다. 음이 시작되는 자리를 눈으로 맞출 때 쓴다.
const BIN = 0.005; // 5ms 단위

export async function loadPeaks(source, ctx) {
  const buf = source instanceof Blob ? await source.arrayBuffer() : await (await fetch(source)).arrayBuffer();
  const audio = await ctx.decodeAudioData(buf);
  const per = Math.max(1, Math.round(audio.sampleRate * BIN));
  const n = Math.ceil(audio.length / per), peaks = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = i * per, e = Math.min(d.length, j + per); j < e; j++) { const v = d[j] < 0 ? -d[j] : d[j]; if (v > m) m = v; }
      if (m > peaks[i]) peaks[i] = m;
    }
  }
  let max = 0; for (const v of peaks) if (v > max) max = v;
  if (max > 0) for (let i = 0; i < n; i++) peaks[i] /= max;
  return { peaks, bin: BIN, duration: audio.duration };
}

// [t0, t1] 구간에서 픽셀 하나당 최대값
export function peaksIn(wave, t0, t1, px) {
  const out = new Float32Array(px), { peaks, bin } = wave;
  for (let x = 0; x < px; x++) {
    const a = Math.max(0, Math.floor((t0 + (t1 - t0) * x / px) / bin)), b = Math.min(peaks.length, Math.ceil((t0 + (t1 - t0) * (x + 1) / px) / bin));
    let m = 0; for (let i = a; i < b; i++) if (peaks[i] > m) m = peaks[i];
    out[x] = m;
  }
  return out;
}
