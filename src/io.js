// 파일 열기·저장·내보내기, 자동 저장.
import { store } from './state.js';
import { asciiTab } from './tab.js';
import { writeMidi, readMidi } from './midifile.js';
import { printHtml } from './print.js';
import { loadPeaks } from './waveform.js';

export const AUTOSAVE = 'tabroll:autosave';
const MEDIA_RE = /\.(mp3|wav|m4a|aac|ogg|oga|flac|mp4|m4v|mov|webm|mkv)$/i;
const AUDIO_RE = /\.(mp3|wav|m4a|aac|ogg|oga|flac)$/i;

export class IO {
  constructor({ media, view, synth, notify, onMedia }) {
    Object.assign(this, { media, view, synth, notify, onMedia });
    this.handle = null;
    this.mediaInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'audio/*,video/*', hidden: true });
    this.projectInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,.mid,.midi,application/json,audio/midi', hidden: true });
    document.body.append(this.mediaInput, this.projectInput);
    this.mediaInput.onchange = () => this.mediaInput.files[0] && this.openMedia(this.mediaInput.files[0]);
    this.projectInput.onchange = () => { const f = this.projectInput.files[0]; this.projectInput.value = ''; f && this.openFile(f); };
    let t = 0;
    store.on(kind => { if (kind === 'select') return; clearTimeout(t); t = setTimeout(() => this.autosave(), 400); });
  }

  pickMedia() { this.mediaInput.click(); }
  pickProject() { this.projectInput.click(); }

  // 파일(Blob) 또는 URL. wave: 파형을 따로 뽑을 음원(예: 리드 기타만 분리한 파일)
  async openMedia(src, { wave } = {}) {
    const isFile = src instanceof Blob, name = isFile ? src.name : decodeURIComponent(String(src).split('/').pop());
    this.media.src = isFile ? URL.createObjectURL(src) : src;
    const audioOnly = isFile ? src.type.startsWith('audio') : AUDIO_RE.test(name);
    this.media.classList.toggle('audio-only', audioOnly);
    store.P.media = { name };
    this.onMedia?.(name, audioOnly);
    this.view.wave = null;
    try { this.view.wave = await loadPeaks(wave || src, this.synth.ctx); this.view.draw(); }
    catch { this.notify('파형을 만들지 못했습니다 (재생은 됩니다)'); }
  }

  async openFile(f) {
    if (/^(audio|video)\//.test(f.type) || MEDIA_RE.test(f.name)) return this.openMedia(f);
    if (/\.midi?$/i.test(f.name)) {
      const { notes, bpm } = readMidi(await f.arrayBuffer());
      if (store.notes.length && !confirm(`MIDI 음 ${notes.length}개로 지금 음을 바꿀까요?`)) return;
      store.load({ ...store.P, bpm: store.notes.length ? store.P.bpm : bpm, notes: notes.map(n => ({ ...n, src: 'midi' })) });
      this.view.fitAll(); this.notify(`MIDI ${notes.length}음 불러옴`);
      return;
    }
    let obj;
    try { obj = JSON.parse(await f.text()); } catch { return this.notify('읽을 수 없는 파일입니다: ' + f.name); }
    if (store.dirty && store.notes.length && !confirm('저장 안 된 변경이 있습니다. 불러올까요?')) return;
    store.load(obj); this.handle = null; this.view.fitAll();
    this.notify(`불러옴: ${f.name}`);
  }

  async openUrlProject(url) {
    store.load({ ...(await (await fetch(url)).json()), _source: url });
    this.view.fitAll();
  }

  autosave() { try { localStorage.setItem(AUTOSAVE, JSON.stringify(store.toJSON())); } catch { /* 용량 초과 등은 무시 */ } }
  restore() { try { return JSON.parse(localStorage.getItem(AUTOSAVE) || 'null'); } catch { return null; } }

  get baseName() { return (store.P.title || 'tabroll').replace(/[\\/:*?"<>|]/g, '_'); }
  download(name, data, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async save(saveAs = false) {
    const data = JSON.stringify(store.toJSON(), null, 1);
    try {
      if (window.showSaveFilePicker) {
        if (!this.handle || saveAs) this.handle = await showSaveFilePicker({ suggestedName: `${this.baseName}.tabroll.json`, types: [{ description: 'TabRoll 프로젝트', accept: { 'application/json': ['.json'] } }] });
        const w = await this.handle.createWritable(); await w.write(data); await w.close();
      } else this.download(`${this.baseName}.tabroll.json`, data, 'application/json');
      store.dirty = false; store.emit('saved');
      this.notify('저장했습니다');
    } catch (e) { if (e.name !== 'AbortError') this.notify('저장 실패: ' + e.message); }
  }
  exportAscii() {
    const text = asciiTab([...store.tab.values()], { ...store.P, grid: store.snap >= 32 ? 32 : 16, title: `${store.P.title}  (♩=${store.P.bpm})` });
    this.download(`${this.baseName}_TAB.txt`, text, 'text/plain');
  }
  exportMidi() { this.download(`${this.baseName}.mid`, writeMidi(store.byTime(), store.P.bpm), 'audio/midi'); }
  print() {
    const w = window.open('', '_blank');
    if (!w) return this.notify('팝업이 막혔습니다. 이 사이트의 팝업을 허용해 주십시오.');
    w.document.write(printHtml(store.P, [...store.tab.values()])); w.document.close();
  }
}
