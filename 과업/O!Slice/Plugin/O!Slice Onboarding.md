# O!Slice 플러그인 사용 가이드

> O!Slice는 Figma 화면을 **개발 친화적 frame 구조로 정리(Slice)**, **로그센터 page_id와 매칭**, **네이밍 규칙 자동 적용**을 한 번에 처리하는 디자이너용 사내 플러그인입니다.

---

## 목차

1. [O!Slice가 해결하는 문제](#1-oslice가-해결하는-문제)
2. [플러그인 열기 (별도 설치 불필요)](#2-플러그인-열기-별도-설치-불필요)
3. [3가지 핵심 기능](#3-3가지-핵심-기능)
   - [① Slice — 개발 친화적 구조로 자동 정리](#-slice--개발-친화적-구조로-자동-정리)
   - [② Page ID 맵핑 — 로그센터 page_id 연결](#-page-id-맵핑--로그센터-page_id-연결)
   - [③ Naming — 화면/내부/데이터 네이밍 규칙 적용](#-naming--화면내부데이터-네이밍-규칙-적용)
4. [전체 사용 흐름 (5분 투어)](#4-전체-사용-흐름-5분-투어)
5. [부가 기능 — HTML 변환](#5-부가-기능--html-변환)
6. [네이밍 규칙 치트시트](#6-네이밍-규칙-치트시트)
7. [자주 묻는 질문 (FAQ)](#7-자주-묻는-질문-faq)
8. [참고 링크](#8-참고-링크)
9. [지속적인 업데이트 & 문의](#9-지속적인-업데이트--문의)

---

## 1. O!Slice가 해결하는 문제

디자인은 끝났는데 핸드오프에서 매번 같은 문제가 반복됩니다:

- 🧩 **Frame 구조가 개발 시점에 다시 풀려야 함** — 평면 정렬, 누락된 Auto Layout, 불명확한 그룹화
- 🧭 **화면이 어디에 속하는지 모름** — 로그센터 페이지 ID와 디자인 frame이 따로 놂
- 🔤 **네이밍이 사람마다 달라짐** — `Frame 42`, `Group 17`, 그때그때 다른 컨벤션
- 📊 **데이터 필드와 텍스트 레이어 불일치** — 개발자가 매번 디자이너에게 물어봐야 함

O!Slice는 이 4가지를 **버튼 클릭으로** 자동 정리해 줍니다.

### 한 줄 가치

> "내가 그린 화면을, **개발자가 그대로 받아쓸 수 있는 구조 + 운영 인프라(로그센터)와 연결된 명확한 네이밍**으로 자동 변환."

---

## 2. 플러그인 열기 (별도 설치 불필요)

> ✅ 디자이너는 **별도 설치 작업이 없습니다**. Figma에서 바로 열면 됩니다.

### Step 1 — Figma에서 플러그인 실행

1. Figma에서 작업 파일 열기
2. 상단 메뉴: **`Plugins → from bucketplace → O!Slice`**
3. 단축키: `Cmd + /` → `O!Slice` 입력 → Enter

### Step 2 — 화면 선택

플러그인 패널(400 × 600)이 우측에 열립니다. 정리하고 싶은 **화면 Frame**(= 최상위 Frame, 화면 한 장)을 캔버스에서 선택하세요.

> 💡 화면 Frame만 선택 대상입니다. Component / Component Set / 내부 Group 등은 대상이 아닙니다.
>
> 여러 화면을 동시에 선택하면 **reading order(위→아래, 좌→우)** 순서로 처리합니다.

### Step 3 — Validate

`Validate` 버튼을 클릭하면 구조/네이밍/page_id 이슈가 한 번에 검출됩니다. 이후 흐름은 [4번 섹션](#4-전체-사용-흐름-5분-투어)에서 자세히 다룹니다.

---

## 3. 3가지 핵심 기능

### ① Slice — 개발 친화적 구조로 자동 정리

**Slice란?** 화면을 시각적 행(row) 단위로 **가로로 자르고**, 같은 컴포넌트가 반복되면 `List > Row`로, 다양한 컴포넌트가 모여 있으면 `Area`로 묶어 개발자가 그대로 마크업할 수 있는 **계층형 frame 구조**를 만드는 작업입니다.

#### Before / After

```
[Before — 디자이너가 그린 평면 구조]
Screen
├── 텍스트 (Frame 42)
├── 텍스트 (Frame 43)
├── 카드 (Group 17)
├── 카드 (Group 18)
├── 카드 (Group 19)
└── 버튼

[After — O!Slice가 정리한 구조]
Screen
└── Body
    ├── Title + Text Area
    │   ├── "어떤 상품을 찾으세요?"     (heading)
    │   └── "최대 3개까지 선택할 수 있어요"  (body)
    ├── Product Card Area
    │   └── List
    │       ├── Row → Card
    │       ├── Row → Card
    │       └── Row → Card
    └── CTA Bar
```

#### 자동 처리 내역

- 🔪 **가로 슬라이스 분할** — 시각적으로 동일한 y축에 있는 요소를 행으로 묶음
- 🔁 **반복 감지 → List/Row** — 같은 컴포넌트가 2개 이상이면 자동으로 List 구조로
- 📦 **혼합 컨텐츠 → Area** — 서로 다른 컴포넌트가 같은 행에 있으면 Area로 그룹화
- 📐 **Auto Layout 자동 적용** — 평면 좌표 기반 배치를 flexbox 친화 구조로
- 🚫 **숨겨진 레이어 정리** — 작업 중 남은 hidden 노드 제거
- ↩️ **개별/일괄 revert 지원** — 마음에 안 들면 원래대로 복구

---

### ② Page ID 맵핑 — 로그센터 page_id 연결

**왜 필요한가?** 모든 화면은 운영 단계에서 **로그센터의 page_id**로 식별됩니다. 디자인 시점부터 이 page_id를 화면 이름에 박아두면, 디자인 → 개발 → 로그 분석이 같은 식별자로 연결됩니다.

#### 기능

- 🗂 **page_id 목록 내장** — 로그센터에서 받은 page_id 목록을 플러그인 번들에 포함해 배포 (별도 MCP 연결 불필요)
- 🔍 **검색해서 매칭** — 화면 의도에 맞는 page_id를 드롭다운 + 검색으로 선택
- ✍️ **자동 부여** — 선택한 page_id가 frame 이름 prefix로 박힘
- ⚠️ **누락 경고** — page_id가 없는 화면은 검증 단계에서 warning으로 노출
- 🔄 **정기 업데이트** — 로그센터에서 신규 page_id가 추가되면 PD가 정기적으로 번들을 갱신해 배포

#### 명명 결과 예시

| 화면 의도 | 부여된 page_id | 최종 frame 이름 |
|-----------|----------------|------------------|
| 장바구니 (기본) | `CART` | `CART` |
| 장바구니 (빈 상태) | `CART` | `CART_비어있을때` |
| 장바구니 (담음 + 쿠폰) | `CART` | `CART_담았을때_쿠폰` |
| 이벤트 인트로 3번째 | `EVENT_DETAIL` | `EVENT_DETAIL_인트로_3` |

→ 같은 page_id에 한글 상태/맥락을 `_`로 이어 붙입니다. 자세한 규칙은 [Rule 1 치트시트](#6-네이밍-규칙-치트시트) 참조.

---

### ③ Naming — 화면/내부/데이터 네이밍 규칙 적용

`naming.md`에 정의된 **4가지 규칙**을 자동 검증·수정합니다.

#### 4가지 규칙 요약

| Rule | 대상 | 형식 | 예시 |
|------|------|------|------|
| **Rule 1** | 화면(최상위 Frame) | `PAGE_ID[_한글맥락[_순번]]` | `CART_담았을때` |
| **Rule 2** | 내부 구조 Frame | Title Case (Bar/Body/Area 구분) | `Title + Text Area`, `CTA Bar` |
| **Rule 3** | 데이터 레이어 (Text/Image) | `snake_case` (API 필드명 그대로) | `first_image_url`, `praise_count` |
| **Rule 4** | State | 화면 이름에만 반영 (내부에는 X) | `CART_비어있을때` ✅ / `Body / Empty` ❌ |

#### 자동 처리 내역

- ✅ 각 Frame에 맞는 이름을 **컴포넌트/콘텐츠 기반으로 자동 추론** (`computeAreaName`, `computeFrameName`)
- ✅ snake_case 위반 자동 감지 + 일괄 수정
- ✅ 의미 없는 자동 이름(`Frame 42`, `Group 17`) 자동 교체
- ✅ Bar / Body / Area 구분 자동 적용

> 📖 네이밍 규칙 정본: `/Users/gina.baek/Desktop/Cursor Project/frame 및 naming 설계하기/naming.md`

---

## 4. 전체 사용 흐름 (5분 투어)

### 화면 ① 시작 — Frame 선택 안내

```
┌────────────────────────────────┐
│  [선택된 프레임명]               │
│                                │
│  Text, Shape... 안내 메시지     │
│                                │
│      [  Validate 버튼  ]        │
└────────────────────────────────┘
```

- **화면 Frame**(최상위 Frame)을 선택하면 활성화
- 여러 화면 선택 시 reading order로 순차 처리

### 화면 ② Validate 결과 — 이슈 리스트

```
┌────────────────────────────────┐
│  디자이너 확인 필요 N건           │
│  [Structure 전체 수정 (3)]       │
│  [Naming 전체 수정 (2)]          │
│  ─────────────────────────      │
│  · Frame 42 → 의미 있는 이름     │
│  · text_default → snake_case    │
│  · page_id 누락                 │
│  ...                           │
│  ─────────────────────────      │
│  [   Page ID 맵핑하기   ]        │
│  [    HTML 만들기 (선택)    ]      │
└────────────────────────────────┘
```

- 상단 카운트와 일괄 버튼은 **고정**, 아래만 스크롤
- 이슈 항목 클릭 → Figma 캔버스에서 해당 노드 자동 선택
- 개별 수정 또는 일괄 수정 자유 선택

### 화면 ③ Page ID 맵핑

```
┌────────────────────────────────┐
│  Page ID 선택                  │
│  ┌──────────────────────────┐   │
│  │ [🔍 검색...]              │   │
│  └──────────────────────────┘   │
│  ─────────────────────────      │
│  · CART                       │
│  · CART_DETAIL                │
│  · EVENT_DETAIL               │
│  · MYPAGE                     │
│  ...                          │
│                                │
│  [  맥락/상태 (옵션)  ]            │
│  └→ "비어있을때" 입력            │
│                                │
│  [    적용    ]                  │
└────────────────────────────────┘
```

- 로그센터 page_id 검색 → 선택 → 한글 맥락/상태(옵션) 입력 → 적용
- frame 이름이 `PAGE_ID_맥락` 형태로 자동 갱신

### 화면 ④ 일괄 수정 / Revert

- Structure 전체 수정 / Naming 전체 수정 클릭 시 모든 이슈 일괄 처리
- 결과가 마음에 안 들면 **Revert 버튼**으로 직전 상태로 복구 (frame snapshot 기반)

---

## 5. 부가 기능 — HTML 변환

검증·정리가 끝난 화면을 **HTML로 export**하는 보조 기능입니다. (메인 기능 아님)

### 언제 쓰나요?

- 🧪 **UT 프로토타입 빠르게 만들기** — Figma frame을 클릭 가능한 HTML로
- 👀 **개발 핸드오프 검수용** — 실제 마크업 단계 전에 구조 확인
- 📤 **결과물 공유** — URL 또는 .html 파일로

### 사용

`Validate` 결과 화면 하단의 `HTML 만들기` 클릭 → 모달에 3개 탭(변환된 HTML / 원본 PNG / HTML 코드) → `URL 복사 / HTML 다운로드 / 코드 복사`

> 자체 알고리즘 기반 변환이라 외부 API 비용 0원, 변환 속도 2~3초. 정확도는 컴포넌트 MD 등록 여부에 따라 약 60~90%.

---

## 6. 네이밍 규칙 치트시트

### Rule 1 — 화면 네이밍 형식

```
PAGE_ID[_한글맥락/상태[_순번]]
```

- `PAGE_ID`: UPPER_SNAKE_CASE, 로그센터 page_id와 동일
- 한글 맥락/상태: 영문 금지, 한글+숫자+`_`만
- 순번: 시퀀스 화면만, `_1`, `_2`, `_3`

| 이름 | page_id | 맥락/상태 | 순번 |
|------|---------|-----------|------|
| `CART` | CART | — | — |
| `CART_담았을때` | CART | 담았을때 | — |
| `CART_담았을때_쿠폰` | CART | 담았을때_쿠폰 | — |
| `EVENT_DETAIL_인트로_1` | EVENT_DETAIL | 인트로 | 1 |

### Rule 2 — 내부 Frame 네이밍 (Bar / Body / Area)

| 구분 | 조건 | 예시 |
|------|------|------|
| **Bar** (suffix 없음) | 여백 없이 영역을 채우는 컴포넌트 | `Status Bar`, `Top Bar`, `CTA Bar` |
| **Body** (suffix 없음) | 내부 Area들을 감싸는 콘텐츠 영역 | `Body` |
| **Area** | 컴포넌트를 감싸는 여백용 래퍼 | `Title Area`, `Search Field Area` |

#### Area 네이밍 패턴 (시각 순서대로 나열)

- **Title Area** — heading 텍스트만
- **Title + Text Area** — heading + body 텍스트
- **Title + Component Name Area** — heading + 컴포넌트
- **Component Name Area** — 단일 컴포넌트 래퍼
- **Component + Component Name Area** — 2개 이상 컴포넌트 (좌→우, 위→아래)
- **Component + Text Area** — 컴포넌트 + body 텍스트
- **Text Area** — heading 아닌 텍스트만
- **Module Name Area** — List/Row/Module 반복 구조 래퍼

> 같은 이름의 Area가 한 화면에 여러 개 있어도 OK (부모 frame이 맥락 제공)

### Rule 3 — 데이터 레이어 네이밍

**Text, Image 등 Frame이 아닌 콘텐츠 레이어**에는 **API 필드명**을 snake_case로:

```
first_image_url     total_praise_count    praise_count    selling_cost
description         total_reply_count     view_count      review_avg
card_count          updated_at_kst        cost            wish_count
```

### Rule 4 — State 네이밍

State는 **화면 이름에만** 반영, 내부 Frame에는 붙이지 않음.

```
✅ CART_비어있을때       ← 화면 이름에 State
❌ Body / Empty          ← 내부 Area에 State 붙이면 안 됨
```

---

## 7. 자주 묻는 질문 (FAQ)

### Q1. 플러그인을 설치해야 하나요?
👉 **아니요.** Figma에서 `Plugins → from bucketplace → O!Slice`만 열면 됩니다. 사내 배포된 플러그인을 그대로 사용합니다.

### Q2. 어떤 노드를 선택해야 하나요?
👉 **화면 Frame(최상위 Frame)만** 선택합니다. Component / Component Set / 내부 Group 등은 대상이 아닙니다.

### Q3. Validate 결과 0건이면 그냥 끝인가요?
👉 정상입니다. 필요하면 `Page ID 맵핑하기`로 page_id 부여, 또는 `HTML 만들기`로 export.

### Q4. Structure 일괄 수정이 마음에 안 들어요.
👉 `Revert` 버튼으로 직전 상태로 복구됩니다. (frame snapshot 기반 — fills, padding, layoutMode, children order 모두 복원)

### Q5. 찾는 page_id가 목록에 없어요.
👉 로그센터에 신규 등록된 page_id는 정기 번들 업데이트 때 반영됩니다. 급하면 [Gina Baek/PD](#9-지속적인-업데이트--문의)에게 슬랙으로 요청 주세요.

### Q6. 다른 프레임을 선택했더니 검증 결과가 사라졌어요.
👉 의도된 동작입니다. 새 frame으로 컨텍스트가 바뀌면 자동 리셋 — `Validate`부터 다시 시작하세요.

---

## 8. 참고 링크

- **네이밍 규칙 정본**: [`naming.md`](../frame%20및%20naming%20설계하기/naming.md) — Rule 1~4 + 체크리스트
- **버전별 변경 이력**: [`RELEASE_NOTES.md`](RELEASE_NOTES.md)
- **HTML 변환 실험 보고서**: [`O!Slice html 변환 실험 보고서.html`](../frame%20및%20naming%20설계하기/보고서/O!Slice%20html%20변환%20실험%20보고서.html)
- **로그센터 page_id 아키텍처 검토**: [`O!Slice 로그센터 지면 맵핑 아키텍처 검토 보고서.html`](../frame%20및%20naming%20설계하기/보고서/O!Slice%20로그센터%20지면%20맵핑%20아키텍처%20검토%20보고서.html)
- **page_id 커버리지 갭 검토**: [`O!Slice 로그센터 지면 ID 커버리지 갭 검토 보고서.html`](../frame%20및%20naming%20설계하기/보고서/O!Slice%20로그센터%20지면%20ID%20커버리지%20갭%20검토%20보고서.html)

---

## 9. 지속적인 업데이트 & 문의

O!Slice는 **지금도 계속 개선되고 있는 살아있는 플러그인**입니다.

### 🔄 정기 업데이트

- 🗂 **로그센터 page_id 정기 동기화** — 로그센터에 새로 등록되는 page_id를 PD가 정기적으로 받아 번들에 반영해 배포합니다. 디자이너는 별도 작업 없이 최신 목록을 사용합니다.
- 🧩 **프레임 구조 변환 로직 개선** — Slice/Area/List/Row 그룹화 규칙은 실제 디자인 사례를 보면서 계속 정교화하고 있습니다.
- 🔤 **네이밍 규칙 진화** — `naming.md`의 Rule 1~4도 팀 피드백을 반영해 계속 업데이트됩니다.
- 🎨 **HTML 변환 정확도 향상** — 컴포넌트 MD 라이브러리도 사례가 늘면서 정확도가 점점 올라갑니다.

### 💬 버그 / 요청 사항

작업 중 **버그 발견** 또는 **개선 요청**(예: "이런 구조도 자동 정리됐으면", "이 네이밍 규칙은 다르게 적용했으면", "이 page_id가 없어요" 등)이 생기면 — **Gina Baek / PD에게 슬랙**으로 알려주세요. 우선순위 매겨서 다음 번들에 반영합니다.

| 카테고리 | 예시 | 연락 |
|----------|------|------|
| 🐛 버그 | 일괄 수정 후 Revert 안 됨, Validate 실패 등 | Gina Baek / PD (Slack) |
| ✨ 기능 요청 | 새 구조 규칙, 추가 자동화 | Gina Baek / PD (Slack) |
| 🗂 page_id 추가 | 로그센터엔 있는데 목록에 없음 | Gina Baek / PD (Slack) |
| 📖 네이밍 규칙 의견 | Rule 1~4 개선 제안 | Gina Baek / PD (Slack) |

> 💡 슬랙 시 **재현 스텝 / 스크린샷 / 대상 frame 이름**을 같이 주시면 훨씬 빠르게 처리됩니다.
