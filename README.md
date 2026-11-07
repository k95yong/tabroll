# 🎸 TabRoll

막대(피아노 롤)로 음을 맞추고, 원음과 같이 들으면서 다듬고, 기타 TAB까지 뽑는 브라우저 채보기입니다.
설치할 것 없이 브라우저에서 돌아가고, 작업한 음원·영상은 내 컴퓨터 밖으로 나가지 않습니다.

**바로 써 보기:** https://k95yong.github.io/tabroll/ (데모: [?project=examples/demo.tabroll.json](https://k95yong.github.io/tabroll/?project=examples/demo.tabroll.json))

## 할 수 있는 것

- **음원·영상 열기**: mp3·wav·m4a·mp4·mov 등을 열거나 창에 끌어다 놓습니다. 영상은 옆에 같이 나옵니다.
- **막대로 편집**: 가운데를 끌면 음 위치·높이가, 양 끝을 끌면 길이가 바뀝니다. 빈 곳을 더블클릭하면 음이 추가됩니다.
- **들으면서 맞추기**: 원음과 악보 소리를 볼륨으로 섞어 듣습니다. 속도를 바꿔도 음높이는 그대로이고, 구간 반복과 메트로놈이 있습니다.
- **MIDI 건반**: 재생하면서 치면 음이 녹음됩니다. 음을 선택한 채 건반을 누르면 그 음의 높이가 바뀝니다.
- **TAB 자동 배치**: 손 위치 이동이 가장 적도록 줄·프렛을 고릅니다. 필요하면 음마다 줄을 고정할 수 있습니다.
- **주법**: 해머링·풀링·벤딩·릴리즈·슬라이드·비브라토·뮤트를 표시합니다. 벤딩과 비브라토는 소리에도 반영됩니다.
- **내보내기**: TAB 인쇄/PDF, TAB 텍스트(.txt), MIDI(.mid), 프로젝트 파일(.tabroll.json)
- **자동 저장**: 브라우저에 계속 저장됩니다. 다른 컴퓨터로 옮길 때는 프로젝트 파일로 저장합니다.

## 시작하기

| 방법 | 설명 |
|---|---|
| 웹에서 | 위 링크를 Chrome이나 Edge로 엽니다. |
| 내 컴퓨터에서 | [Releases](https://github.com/k95yong/tabroll/releases)에서 zip을 받아 풀고, `TabRoll 열기.command`(맥)나 `TabRoll 열기.bat`(윈도우)를 더블클릭합니다. Node.js 18 이상이 필요합니다. |
| 소스에서 | `git clone` 후 `npm start` |

MIDI 건반은 Chrome·Edge에서 `https://` 또는 `http://localhost` 주소로 열었을 때만 동작합니다. 파일을 더블클릭해서 `file://`로 열면 건반이 안 잡힙니다.

### 작업 순서 예시

1. 📂로 음원이나 영상을 엽니다.
2. BPM을 맞추고, 1마디 첫 박에서 멈춘 뒤 <kbd>O</kbd>를 눌러 마디선을 맞춥니다.
3. 칸(16분·6연음·32분)을 고르고 막대로 음을 놓습니다. 건반이 있으면 <kbd>K</kbd>로 녹음해서 초안을 만들어도 됩니다.
4. <kbd>3</kbd>(원음+악보)로 들으면서 막대를 다듬습니다. <kbd>L</kbd>로 보이는 구간을 반복합니다.
5. 아래 TAB 줄에서 운지를 확인하고, 필요하면 <kbd>⌥1</kbd>~<kbd>⌥6</kbd>으로 줄을 고정합니다.
6. ⬇ 내보내기 → TAB 인쇄 / PDF.

## 단축키

| 키 | 동작 |
|---|---|
| <kbd>Space</kbd> / <kbd>⇧Space</kbd> | 재생·정지 / 보이는 구간 처음부터 |
| <kbd>L</kbd> <kbd>M</kbd> <kbd>K</kbd> | 구간 반복 · 메트로놈 · 건반 녹음 |
| <kbd>-</kbd> <kbd>=</kbd> | 속도 내리기·올리기 |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> | 원음만 · 악보만 · 둘 다 |
| <kbd>[</kbd> <kbd>]</kbd> · <kbd>Z</kbd> <kbd>⇧Z</kbd> | 앞·뒤 마디 · 확대·축소 (휠 = 이동, ⌘+휠 = 확대) |
| <kbd>Tab</kbd> / <kbd>⇧Tab</kbd> | 다음·이전 음 선택 |
| <kbd>↑</kbd> <kbd>↓</kbd> (<kbd>⇧</kbd> 옥타브) | 음높이 |
| <kbd>←</kbd> <kbd>→</kbd> (<kbd>⇧</kbd> 길이) | 한 칸 이동 |
| <kbd>N</kbd> · <kbd>⌘D</kbd> · <kbd>Delete</kbd> | 재생 위치에 추가 · 복제 · 삭제 |
| <kbd>Q</kbd> / <kbd>⇧Q</kbd> | 칸에 맞추기 (선택 / 보이는 음 전부) |
| <kbd>H</kbd> <kbd>P</kbd> <kbd>B</kbd> <kbd>R</kbd> <kbd>S</kbd> <kbd>V</kbd> <kbd>X</kbd> <kbd>0</kbd> | 주법 (해머링·풀링·벤딩·릴리즈·슬라이드·비브라토·뮤트·지우기) |
| <kbd>⌥1</kbd>~<kbd>⌥6</kbd> · <kbd>⌥0</kbd> | 줄 고정 · 자동 |
| <kbd>O</kbd> | 지금 위치를 1마디 시작으로 |
| <kbd>⌘Z</kbd> <kbd>⇧⌘Z</kbd> · <kbd>⌘S</kbd> · <kbd>⌘P</kbd> | 되돌리기·다시하기 · 저장 · 인쇄 |
| <kbd>?</kbd> | 단축키 보기 |

막대를 끌 때 <kbd>⇧</kbd>를 누르고 있으면 칸을 무시합니다.

## 파일 형식

프로젝트 파일(`.tabroll.json`)은 사람이 읽을 수 있는 JSON입니다. 다른 채보 도구의 결과를 넣을 때는 `notes` 배열만 맞추면 됩니다.

```json
{
  "app": "tabroll", "version": 1, "title": "곡 제목",
  "bpm": 72, "offset": 5.81, "beatsPerBar": 4,
  "notes": [ { "t": 5.95, "te": 6.96, "midi": 69, "tech": "b", "bend": 2, "lockString": 3 } ]
}
```

`t`·`te`는 시작·끝(초), `midi`는 음 번호(60 = 가운데 도), `tech`는 `h p b r s v x` 중 하나, `lockString`은 1(e)~6(E)입니다.
`[{t, te, midi}]` 형태의 배열만 있는 JSON과 MIDI 파일(.mid)도 불러올 수 있습니다.

주소에 `?project=<프로젝트 URL>&media=<음원 URL>`을 붙이면 시작할 때 바로 엽니다. 같은 프로젝트를 다시 열면 브라우저에 자동 저장된 작업을 이어서 엽니다.

## 개발

```bash
npm install          # 브라우저 테스트용 playwright만 설치됩니다
npm test             # 운지 배치·TAB 텍스트·MIDI 단위 테스트
npm run test:ui      # 헤드리스 브라우저로 편집 기능 확인
npm run package      # dist/tabroll-<버전>.zip
```

`src/tab.js`가 줄·프렛 배치(손 위치를 상태로 둔 동적 계획법)와 TAB 텍스트를, `src/midifile.js`가 MIDI 읽기·쓰기를, `src/app.js`가 화면과 편집을 맡습니다. 빌드 단계는 없습니다.

## 라이선스

MIT. 저작권이 있는 음원·영상·악보는 저장소에 넣지 마십시오.
