# Naming

Figma 레이아웃의 이름은 두 가지 목적을 위해 존재합니다: **설계 의도를 전달**하고, **개발 핸드오프를 돕는 것**.
CleanCode와 동일한 방법론으로 접근하며, Figma MCP를 통해 Claude가 레이아웃 명을 이용해 구조를 분석할 수 있어
스크린샷 없이도 각 레이아웃의 역할을 바르게 이해할 수 있습니다.

---

## 01. Benefits

**1. 구조가 이름으로 전달된다**
Frame 이름만으로 List > Row > Module 구조를 예측할 수 있어 디자이너와 개발자가 동일한 구조를 공유합니다.

**2. 설계 속도가 올라간다**
동일한 Frame 계층을 복사하고 내용만 교체하면 되므로, 같은 구조의 화면을 빠르게 설계할 수 있습니다.

**3. AI 기반 자동화가 가능하다**
Frame 이름이 의미 있을 때 Claude가 이를 기반으로 구조를 해석하고 Auto Layout 설정을 자동화할 수 있습니다.

---

## 02. Rules

### Rule 1. 화면(지면) 네이밍

최상위 Frame은 **한글**로 화면의 기능과 상태를 서술합니다.

- 언더바(`_`)로 계층을 구분합니다
- 기능이 깊어질수록 언더바를 추가합니다
- 상태(스켈레톤, 데이터 없음, 삭제 완료 등)는 **마지막**에 붙입니다
- 같은 기능의 다른 상태끼리 정렬했을 때 그룹이 되도록 **앞부분을 통일**합니다

**형식: `기능영역_세부기능_상태`**

```
바텀시트_상품_카테고리_테이블
바텀시트_상품_카테고리_테이블_검색_결과 없음
바텀시트_상품_색상 필터 선택
3D 모델 완성_이름 입력
카메라_영역 지정
AI 렌더링 중_렌더링 실패
```

---

### Rule 2. 내부 구조 Frame 네이밍

가로로 자른 각 Frame에는 **영문 Title Case**로 역할 이름을 붙입니다.

- 가로로 자른 각 Frame에는 영문으로 역할 이름을 붙입니다
- Title Case with spaces(대문자로 띄어쓰기)으로 영문 단어로 네이밍합니다
- 컴포넌트가 곧 여백 없는 영역이면 그대로 쓰고(Top Bar, Status Bar, CTA Bar 등), 컴포넌트를 감싸는 여백용 래퍼에는 Area를 붙입니다(Title Area, Search Field Area 등). 내부 Area들을 감싸는 콘텐츠 영역은 Body로 명명합니다

**핵심 구분: Bar / Body / Area**

| 구분 | 조건 | 예시 |
|------|------|------|
| **Bar** (suffix 없음) | Component 자체가 여백 없이 영역을 채울 때 | `Status Bar`, `Top Bar`, `CTA Bar` |
| **Body** (suffix 없음) | 내부 Area들을 감싸는 콘텐츠 영역 | `Body` |
| **Area** | Component를 감싸는 여백용 래퍼일 때 | `Title Area`, `Search Field Area` |

---

**Area 네이밍 패턴**

**① Title Area**

Heading 텍스트만 포함하는 영역입니다. 자식 레이어의 typography variable에 `heading`이 포함된 텍스트 레이어만 있을 때 사용합니다.

```
Title Area
└── "어떤 상품으로 거실을 꾸며볼까요?"  (heading variable)
```

---

**② Title + Text Area**

Heading 텍스트와 일반 텍스트(설명, 부제목 등)가 함께 있는 영역입니다. 제목 아래 부연 설명이 세로로 배치될 때 사용합니다.

```
Title + Text Area
├── "어떤 상품으로 거실을 꾸며볼까요?"  (heading)
└── "최대 3개까지 선택할 수 있어요."    (body text)
```

---

**② Title + Component Name Area**

Heading 텍스트와 Component가 함께 있는 영역입니다. 주로 제목 옆에 버튼, 뱃지 등이 가로로 배치될 때 사용하며, 시각적 순서(좌→우)대로 이름을 나열합니다.

```
Title + Button Area
├── "추천 상품"  (heading)
└── Button
```

---

**② Component Name Area**

단일 Component를 여백과 함께 감싸는 래퍼 영역입니다. Component 이름을 그대로 가져와 `Area`를 붙입니다.

```
Search Field Area
└── Search Field (Component)
```

---

**② Component Name + Component Name Area**

두 개 이상의 Component가 함께 배치되는 영역입니다. 시각적 순서(좌→우, 위→아래)대로 모든 Component 이름을 나열합니다.

```
# 2개
Search Field + Filter Area
├── Search Field (Component)
└── Filter (Component)

# 3개 이상
Icon + Label + Button Area
├── Icon (Component)
├── Label (Component)
└── Button (Component)
```

---

**② Component + Text Area**

Component와 일반 텍스트(비제목)가 함께 있는 영역입니다. 시각적 순서대로 이름을 나열하며, `Text`는 heading이 아닌 body/label 텍스트를 가리킵니다.

```
Icon + Text Area
├── Icon (Component)
└── "검색 결과 없음"  (body text)
```

---

**② Text Area**

제목(heading)이 아닌 텍스트만 포함하는 영역입니다. 설명, 라벨, 카운트 등 body 텍스트 레이어만 있을 때 사용합니다.

```
Text Area
└── "검색 결과 0개"
```

---

**② Module Name Area**

List / Row / Module 반복 구조를 감싸는 영역입니다. 안에 담기는 Module의 이름을 따서 `Area`를 붙입니다.

```
Product Card Area
└── List
    ├── Row → Module, Module, Module
    └── Row → Module, Module, Module
```

---

**중복 이름 허용**

같은 이름의 Area가 한 화면에 여러 개 있어도 허용합니다. 부모 Frame이 맥락을 제공하므로 구분이 가능합니다.

```
Body
├── Title + Text Area    ← 첫 번째 섹션
├── Product Card Area
├── Title + Text Area    ← 두 번째 섹션
└── Banner Area
```

---

### Rule 3. 데이터 레이어 네이밍

Text, Image 등 **Frame이 아닌 콘텐츠 레이어**에는 회사 데이터 필드명을 붙입니다.
Claude가 레이어 이름만으로 어떤 데이터인지 파악할 수 있도록, **API 응답 필드와 매칭되는 이름**을 사용합니다.

**형식: `snake_case` (API 필드명 그대로)**

```
first_image_url     total_praise_count    praise_count    selling_cost
description         total_reply_count     view_count      review_avg
card_count          updated_at_kst        cost            wish_count
```

---

### Rule 4. State 네이밍

State는 **Screen 이름(Rule 1)**에 반영하며, 내부 Frame 이름에는 붙이지 않습니다.

```
# 올바른 예
거실_상품선택_검색결과없음    ← State가 Screen 이름에 포함
거실_상품선택_검색결과있음
거실_상품선택_로딩

# 잘못된 예
Body / Loading              ← Area에 State 붙이지 않음
List / Empty
```

---

## 03. 체크리스트

**화면 네이밍**
- [ ] Screen 이름은 한글로, 큰 단위부터 `_`로 구분했는가?
- [ ] 상태(State)는 Screen 이름 마지막에 붙였는가?
- [ ] 같은 기능의 화면끼리 앞부분이 통일되어 있는가?

**내부 구조 네이밍**
- [ ] 내부 Frame은 Title Case로 작성했는가?
- [ ] 여백 없이 영역을 채우는 Component는 Bar, 래퍼는 Area를 사용했는가?
- [ ] Area 이름은 시각적 순서대로 요소를 나열했는가?
- [ ] Heading 텍스트 영역은 Title Area 또는 Title + Text Area인가?

**데이터 레이어**
- [ ] 콘텐츠 레이어(Text, Image)에 API 필드명을 붙였는가?
- [ ] 데이터 레이어 이름은 snake_case인가?
