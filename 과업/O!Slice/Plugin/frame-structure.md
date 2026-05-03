# Frame Structure

Figma에서 디자인팀과 개발팀이 효율적으로 협업하기 위해, 모든 화면은 아래 기준에 따라 Frame을 설계합니다.
특별한 이유가 없는 한 모든 Frame은 **Auto Layout**으로 처리합니다.

---

## 01. 기본 구조

모든 화면은 아래 4개 단위로 구성됩니다.

```
Screen
├── Status Bar
├── Top Bar        ← Component, 내부 분해 X
├── Body           ← Vertical Auto Layout
└── CTA Bar        ← Component, optional, 내부 분해 X
```

- `Status Bar`, `Top Bar`, `CTA Bar`는 이미 Component로 구성되어 있으므로 내부를 분해하지 않습니다.
- `Body`는 화면의 가변 콘텐츠 영역이며, 내부 Area들을 Vertical Auto Layout으로 감쌉니다.

---

## 02. Body 구성 규칙

Body는 화면을 **가로로 자른 Area들이 위에서 아래로 쌓이는 구조**입니다.

- Body의 직계 자식은 항상 **Area**
- Area는 항상 **전체 너비(Full Width)**를 차지하는 수평 슬라이스
- Area 안에서 요소들이 수평 또는 수직으로 배열됨

```
Body
├── Title + Text Area
├── Search Field Area
├── Text Area
└── Product Card Area
```

---

## 03. Area 내부 구조 규칙

Area 안의 구조는 **Module(Component)의 수와 배열 방향**에 따라 결정됩니다.

| 상황 | 구조 |
|------|------|
| Module 1개 | `Area > Component` |
| Module 2개 이상, 가로 1줄 | `Area > List(Horizontal) > Module` |
| Module 2개 이상, 세로 1열 | `Area > List(Vertical) > Module` |
| Module 2개 이상, 격자(Grid) | `Area > List(Vertical) > Row(Horizontal) > Module` |

```
# Module 1개
Search Field Area
└── Search Field (Component)

# Module 2개 이상, 가로 1줄
Product Card Area
└── List → Module, Module, Module

# Module 2개 이상, 세로 1열
Product Card Area
└── List
    ├── Module
    ├── Module
    └── Module

# Module 2개 이상, 격자(Grid)
Product Card Area
└── List
    ├── Row → Module, Module, Module
    └── Row → Module, Module, Module
```

---

## 04. List / Row 규칙

| 단위 | 등장 조건 | 설명 |
|------|------|------|
| **List** | Module 2개 이상 | Module 또는 Row의 컨테이너 |
| **Row** | Module이 2줄 이상일 때만 | 한 줄의 Module 묶음 |

- Module 1개 → List, Row 없음 (`Area > Component`)
- Module 2개 이상, 1줄 → List만 있고 Row 없음 (`Area > List > Module`)
- Module 2개 이상, 2줄 이상 → List > Row > Module (`Area > List > Row > Module`)

---

## 05. Auto Layout 방향

| 단위 | 방향 | 이유 |
|------|------|------|
| Body | Vertical | Area들이 위→아래로 쌓임 |
| Area | 내용에 따라 Vertical 또는 Horizontal | 내부 요소 배열 방향에 따름 |
| List (가로 1줄) | Horizontal | Module들이 좌→우로 나열됨 |
| List (세로 1열) | Vertical | Module들이 위→아래로 쌓임 |
| List (격자) | Vertical | Row들이 위→아래로 쌓임 |
| Row | Horizontal | Module들이 좌→우로 나열됨 |

---

## 06. Example

```
거실_상품선택_검색결과있음
├── Status Bar
├── Top Bar                          ← Component
├── Body
│   ├── Title + Text Area            ← heading + 설명 텍스트
│   ├── Search Field Area            ← Search Field (Component)
│   │   └── Search Field
│   └── Product Card Area            ← List > Row > Module 구조
│       └── List
│           ├── Row → Module, Module, Module
│           └── Row → Module, Module, Module
└── CTA Bar                          ← Component

거실_상품선택_검색결과없음
├── Status Bar
├── Top Bar
├── Body
│   ├── Title + Text Area
│   ├── Search Field Area
│   │   └── Search Field
│   ├── Text Area                    ← "검색 결과 0개"
│   └── Empty Area                   ← Empty (Component)
└── CTA Bar
```

---

## 07. Comparison

**AS-IS: 기존 컴포넌트 디자인하기**

Frame 구조 없이 컴포넌트를 배치하면 상태 변화 시 각 요소를 개별적으로 찾아 수정해야 하고,
개발 핸드오프 시 구조 파악이 어렵습니다.

**TO-BE: 빠르게 의미있게 설계**

Area 단위로 Frame을 끊으면 상태 변화 시 해당 Area만 교체하면 됩니다.
개발팀이 Frame 이름만으로 화면 구조를 파악할 수 있습니다.
