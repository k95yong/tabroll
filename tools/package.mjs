#!/usr/bin/env node
// 배포용 zip(dist/tabroll-<버전>.zip)을 만든다. 압축만 풀면 바로 쓸 수 있도록 실행 파일을 같이 넣는다.
import { cp, mkdir, rm, writeFile, readFile, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const name = `tabroll-${version}`;
const out = join(root, 'dist', name);
await rm(join(root, 'dist'), { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const p of ['index.html', 'styles.css', 'src', 'tools/serve.mjs', 'examples', 'README.md', 'LICENSE']) {
  await cp(join(root, p), join(out, p), { recursive: true });
}
const mac = `#!/bin/bash
# 더블클릭하면 TabRoll을 브라우저로 엽니다 (Node.js 18 이상 필요)
cd "$(dirname "$0")"
command -v node >/dev/null || { osascript -e 'display alert "Node.js가 필요합니다" message "https://nodejs.org 에서 설치한 뒤 다시 실행해 주십시오."'; exit 1; }
node tools/serve.mjs --open
`;
const win = `@echo off\r\nrem 더블클릭하면 TabRoll을 브라우저로 엽니다 (Node.js 18 이상 필요)\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul || (echo Node.js가 필요합니다: https://nodejs.org & pause & exit /b 1)\r\nnode tools\\serve.mjs --open\r\n`;
await writeFile(join(out, 'TabRoll 열기.command'), mac); await chmod(join(out, 'TabRoll 열기.command'), 0o755);
await writeFile(join(out, 'TabRoll 열기.bat'), win);
execFileSync('zip', ['-qr', `${name}.zip`, name], { cwd: join(root, 'dist') });
console.log(join(root, 'dist', `${name}.zip`));
