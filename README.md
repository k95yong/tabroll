# 🎸 TabRoll

막대(피아노 롤)로 음을 맞추고, 원음과 같이 들으면서 다듬고, 기타 TAB까지 뽑는 브라우저 채보기입니다.
설치할 것 없이 브라우저에서 돌아가고, 작업한 음원·영상은 내 컴퓨터 밖으로 나가지 않습니다.

**바로 써 보기:** https://k95yong.github.io/tabroll/ (데모: [?project=examples/demo.tabroll.json](https://k95yong.github.io/tabroll/?project=examples/demo.tabroll.json))

## 할 수 있는 것

- **음원·영상 열기**: mp3·wav·m4a·mp4·mov 등을 열거나 창에 끌어다 놓습니다. 영상은 옆에 같이 나옵니다.
- **막대로 편집**: 가운데를 끌면 음 위치·높이가, 양 끝을 끌면 길이가 바뀝니다. 빈 곳을 더블클릭하면 음이 추가됩니다.
- **여러 음 한꺼번에**: 빈 곳을 끌어 박스로 고르거나 ⇧클릭으로 더합니다. 고른 음은 같이 옮기고, 조옮김하고, 복사·붙여넣기합니다.
- **음 정보 패널**: 오른쪽 패널에서 음높이·줄·주법·벤딩 크기·시작·길이를 숫자로 고칩니다.
- **파형**: 음원의 파형이 눈금자 아래에 나와서 음이 시작되는 자리를 눈으로 맞출 수 있습니다. 반주가 섞여 있으면 `&wave=`로 리드만 분리한 파일의 파형을 따로 쓸 수 있습니다.
- **들으면서 맞추기**: 원음과 악보 소리를 볼륨으로 섞어 듣습니다. 속도를 바꿔도 음높이는 그대로입니다. 눈금자를 끌어 반복 구간을 정하고, 메트로놈을 켤 수 있습니다.
- **MIDI 건반**: 재생하면서 치면 음이 녹음됩니다. 음을 선택한 채 건반을 누르면 그 음의 높이가 바뀝니다.
- **TAB 자동 배치**: 손 위치 이동이 가장 적도록 줄·프렛을 고릅니다. TAB 숫자를 위아래로 끌거나 ⌥1~6으로 줄을 고정합니다.
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

앱에서 <kbd>?</kbd>를 누르면 전체 표가 나옵니다(`src/keymap.js` 한 곳에서 키 처리와 안내를 같이 만듭니다). 자주 쓰는 것만 추리면:

| 키 | 동작 |
|---|---|
| <kbd>Space</kbd> / <kbd>⇧Space</kbd> | 재생·정지 / 보이는 구간(반복 구간) 처음부터 |
| <kbd>L</kbd> · <kbd>M</kbd> · <kbd>K</kbd> · <kbd>F</kbd> | 반복 · 메트로놈 · 건반 녹음 · 재생 위치 따라가기 |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> · <kbd>-</kbd> <kbd>=</kbd> | 원음만·악보만·둘 다 · 속도 |
| <kbd>↑</kbd> <kbd>↓</kbd> · <kbd>←</kbd> <kbd>→</kbd> | 반음(⇧ 옥타브) · 한 칸 이동(⇧ 길이) |
| <kbd>Tab</kbd> · <kbd>⌘A</kbd> · <kbd>Esc</kbd> | 다음 음 · 보이는 음 모두 · 선택 해제 |
| <kbd>⌘C</kbd> <kbd>⌘V</kbd> · <kbd>⌘D</kbd> · <kbd>Delete</kbd> | 복사·붙여넣기 · 복제 · 삭제 |
| <kbd>Q</kbd> / <kbd>⇧Q</kbd> | 칸에 맞추기 (선택 / 보이는 음 전부) |
| <kbd>H</kbd> <kbd>P</kbd> <kbd>B</kbd> <kbd>R</kbd> <kbd>S</kbd> <kbd>V</kbd> <kbd>X</kbd> · <kbd>⇧B</kbd> | 주법 · 벤딩 크기 |
| <kbd>⌥1</kbd>~<kbd>⌥6</kbd> · <kbd>⌥0</kbd> | 줄 고정 · 자동 |
| <kbd>[</kbd> <kbd>]</kbd> · <kbd>Z</kbd> <kbd>⇧Z</kbd> | 앞·뒤 마디 · 확대·축소 |
| <kbd>O</kbd> | 지금 위치를 1마디 시작으로 |
| <kbd>⌘Z</kbd> <kbd>⇧⌘Z</kbd> · <kbd>⌘S</kbd> · <kbd>⌘P</kbd> | 되돌리기·다시하기 · 저장 · 인쇄 |

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

주소에 `?project=<프로젝트 URL>&media=<음원 URL>&wave=<파형용 음원 URL>`을 붙이면 시작할 때 바로 엽니다. 같은 프로젝트를 다시 열면 브라우저에 자동 저장된 작업을 이어서 엽니다.

## 개발

```bash
npm install          # 브라우저 테스트용 playwright만 설치됩니다
npm test             # 운지 배치·TAB 텍스트·MIDI 단위 테스트
npm run test:ui      # 헤드리스 브라우저로 편집 기능 확인
npm run package      # dist/tabroll-<버전>.zip
```

빌드 단계는 없습니다. 모듈 구성:

| 파일 | 맡은 일 |
|---|---|
| `src/state.js` | 프로젝트 데이터, 선택, 되돌리기, 박자·칸 계산 |
| `src/tab.js` | 줄·프렛 배치(손 위치를 상태로 둔 동적 계획법), TAB 텍스트 |
| `src/transport.js` | 재생 시계, 원음 동기, 악보 음 예약, 메트로놈, 반복 |
| `src/view.js` | 피아노 롤·파형·TAB·개요 그리기, 좌표 변환, 적중 판정 |
| `src/editor.js` | 편집 명령과 마우스 조작 |
| `src/keymap.js` | 단축키 표와 안내 화면 |
| `src/inspector.js` | 오른쪽 음 정보 패널 |
| `src/io.js` | 열기·저장·내보내기, 자동 저장 |
| `src/midiin.js` · `src/midifile.js` | MIDI 건반 입력 · MIDI 파일 |
| `src/synth.js` · `src/waveform.js` · `src/print.js` | 확인용 소리 · 파형 요약 · 인쇄용 TAB |

## 라이선스

MIT. 저작권이 있는 음원·영상·악보는 저장소에 넣지 마십시오.
