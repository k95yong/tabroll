#!/usr/bin/env node
// 의존성 없는 로컬 정적 서버. MIDI 건반은 http://localhost 에서만 켜지므로 file:// 대신 이걸로 연다.
// 사용: node tools/serve.mjs [포트] [--open] [--dir 추가폴더]
import { createServer } from 'node:http';
import { readFile, stat, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const port = +(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 5178);
const extraIdx = args.indexOf('--dir');
const extra = extraIdx >= 0 ? resolve(args[extraIdx + 1]) : null; // /files/ 아래로 공개할 작업 폴더
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mid': 'audio/midi',
};

function safeJoin(base, p) {
  const full = normalize(join(base, decodeURIComponent(p)));
  return full === base || full.startsWith(base + sep) ? full : null;
}

// 작업 폴더(--dir) 안의 .json 프로젝트만 덮어쓸 수 있다. 덮기 전에 .backup/ 에 복사본을 남긴다.
async function saveProject(req, res, file) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  JSON.parse(body); // 망가진 내용으로 덮어쓰지 않도록 먼저 확인
  const bdir = join(dirname(file), '.backup');
  await mkdir(bdir, { recursive: true });
  await copyFile(file, join(bdir, `${basename(file, '.json')}.${new Date().toISOString().replace(/[:.]/g, '-')}.json`)).catch(() => {});
  await writeFile(file, body);
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'PUT') {
    const file = extra && url.pathname.startsWith('/files/') && url.pathname.endsWith('.json') ? safeJoin(extra, url.pathname.slice(7)) : null;
    if (!file) { res.writeHead(403); return res.end('forbidden'); }
    try { return await saveProject(req, res, file); } catch (e) { res.writeHead(400); return res.end(String(e.message)); }
  }
  let file = url.pathname.startsWith('/files/') && extra ? safeJoin(extra, url.pathname.slice(7)) : safeJoin(root, url.pathname);
  try {
    if (!file) throw new Error('forbidden');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const info = await stat(file), type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    const data = await readFile(file);
    if (range) { // 영상 탐색(seek)에 필요
      const start = range[1] ? +range[1] : 0, end = range[2] ? +range[2] : info.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return res.end(data.subarray(start, end + 1));
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found');
  }
}).listen(port, '127.0.0.1', () => {
  const u = `http://localhost:${port}/`;
  console.log(`TabRoll: ${u}${extra ? `  (작업 폴더 ${extra} → ${u}files/)` : ''}`);
  if (args.includes('--open')) exec(`${process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'} "${u}"`);
});
