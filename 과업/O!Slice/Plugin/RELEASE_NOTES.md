# O!Slice Release Notes

---

## v0.3.0 — 2026-05-04

### 🎯 한 줄 요약
**컴포넌트 MD 기반 HTML 자동 변환 시스템 도입.** 디자이너가 컴포넌트 MD에 HTML Template을 한 번 정의해두면, 플러그인이 자동으로 매칭해서 정확하게 변환합니다. MD 수정은 GitHub push만으로 즉시 반영됩니다.

### ✨ 신규 기능

#### 1. MD → `COMPONENT_REGISTRY` 자동 주입 빌드 시스템
- `scripts/build-registry.js` 추가
- `[SpaceAI] 디자인 컴포넌트 md/` 폴더의 모든 MD 파일을 스캔해서 `code.ts`의 마커 사이(`<REGISTRY:BEGIN>` ~ `<REGISTRY:END>`)에 자동 주입
- `npm run build` 한 번으로 MD → code.ts → code.js 전체 흐름 처리

#### 2. GitHub Raw URL 런타임 Fetch
- 플러그인 실행 시 `GinaBaek/oslice` repo에서 컴포넌트 MD를 자동 fetch
- MD 수정 → push만 하면 모든 사용자에게 즉시 반영 (재빌드 불필요)
- `manifest.json` `networkAccess`에 `raw.githubusercontent.com`, `api.github.com` 추가
- 빌드 타임 주입은 오프라인 fallback으로 유지

#### 3. SpaceAI Top Bar 컴포넌트 등록 (첫 번째 컴포넌트)
- Node ID `75:411`
- 3개 Variants 모두 정의 (`Color=White,Type=Home` / `Color=White,Type=General` / `Color=Black,Type=General`)
- Default 템플릿 + variant별 인라인 SVG (arrow_left / cube / camera / list_bullet / line_3_horizontal)

### 🐛 버그 수정 / 개선

#### Variant 매칭 로직 정상화
- 기존 `pickTemplateBody()` 가 variant 키를 `split('=')` 한 번만 해서 매칭 실패 → fallback으로 default가 선택되던 문제 수정
- variant 키에 명시된 props만 검사하도록 변경 (다른 props가 있어도 무시)
- 매칭 시도 로그 추가 (`Variant matched: ...`)

#### Placeholder 치환 호환성 추가
- `{titleText}` 와 `{Title Text}` 둘 다 같은 `"Title Text"` Figma prop에 매칭되도록 `lookupProp()` 추가 (camelCase ↔ Spaced 자동 변환)
- 정규식도 공백 허용으로 확장 (`{Title Text}` 가능)

### 🎨 ICONS 라이브러리 보강
- `cube` 아이콘 추가 (기존 `cube_badge_sparkle`는 별이 추가된 큐브라 다름)
- 모든 다른 아이콘 (`arrow_left`, `camera`, `list_bullet`, `line_3_horizontal`)은 인라인 SVG로 templates에 직접 박아 색상 정확도 개선

### 📦 디버그 로그 강화
`findTemplate()` 호출 시 다음 로그가 콘솔에 출력됨:
- `Registry size: N entries`
- `Template lookup candidates: [...]`
- `Trying: id = "75:411" → MATCH / no match`
- `Matched template: Top Bar via id = 75:411`
- `Render Top Bar | props={...} | body.len=... | rendered.len=...`

### ⚠ 알려진 한계
- 디자인 팀 GitHub repo (`Ohouse-product-design/Gina`) 가 organization private이라 외부 anonymous fetch 차단됨 → **임시로 개인 public repo (`GinaBaek/oslice`)에서 fetch** 중
- 디자인 팀이 직접 컴포넌트 MD를 추가하려면 위 repo의 public 전환 또는 별도 public mirror가 필요

### 📂 변경된 파일
- `scripts/build-registry.js` — 신규
- `code.ts` — REGISTRY 마커 + 런타임 fetch 함수 + 매칭 로직 개선
- `manifest.json` — networkAccess 도메인 추가
- `ui.html` — `cube` 아이콘 추가
- `package.json` — `build:registry` 스크립트 추가

### 🚀 빌드 / 사용 방법
```bash
npm install
npm run build           # MD 자동 주입 + tsc
# Figma → Plugins → Development → Import → manifest.json
```

---

## v0.2.0 — 2026-05-02 (`c48c995`)
- HTML 변환 기능 추가 및 Validate UI 대규모 개선
- 스텔라님 `icons.js` 통합 (ODS 아이콘 1300+개 inline SVG)
- 컴포넌트 템플릿 레지스트리 기반 마련 (수동 등록)
- 자체 알고리즘 변환 (외부 API/비용 0원)
- HTML URL 복사 / HTML 코드 복사
- 원본 PNG 자동 캡처

---

## v0.1.x 이전 (4/26 ~ 4/27)
- Validate 기능 (구조/네이밍 검증)
- Validate UI 개선, Auto Layout 감지 룰
- Hidden layer 삭제, select 오작동 수정
- Figma spec 매칭 UI 레이아웃
