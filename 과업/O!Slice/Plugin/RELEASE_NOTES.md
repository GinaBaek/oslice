# O!Slice Release Notes

> Figma 플러그인 manager 표기 방식에 따라 정수 버전 사용 (Version 7, 8, 9 ...)

---

## Version 8 — 2026-05-04

### ✨ 새 기능

**1. MD → `COMPONENT_REGISTRY` 자동 주입 빌드 시스템**
- `scripts/build-registry.js` 추가
- `[SpaceAI] 디자인 컴포넌트 md/` 폴더의 모든 MD 파일을 스캔해서 `code.ts`의 마커 사이(`<REGISTRY:BEGIN>` ~ `<REGISTRY:END>`)에 자동 주입
- `npm run build` 한 번으로 MD → code.ts → code.js 전체 흐름 처리

**2. GitHub Raw URL 런타임 Fetch**
- 플러그인 실행 시 `GinaBaek/oslice` repo에서 컴포넌트 MD를 자동 fetch
- MD 수정 → push만 하면 모든 사용자에게 즉시 반영 (재빌드 불필요)
- `manifest.json` `networkAccess`에 `raw.githubusercontent.com`, `api.github.com` 추가
- 빌드 타임 주입은 오프라인 fallback으로 유지

### 📦 디버그 로그 강화
`findTemplate()` 호출 시 다음 로그가 콘솔에 출력됨:
- `Registry size: N entries`
- `Template lookup candidates: [...]`
- `Trying: id = "75:411" → MATCH / no match`
- `Matched template: Top Bar via id = 75:411`
- `Render Top Bar | props={...} | body.len=... | rendered.len=...`

---

## Version 7 — 2026-05-02

### ✨ 새 기능

**1. HTML 변환 기능 추가**
- Validate 후 "HTML 만들기" 버튼으로 선택한 프레임을 HTML로 변환
- 자체 알고리즘 기반 변환 (외부 API/비용 0원)
- Figma 원본 PNG 자동 캡처 → HTML과 비교 가능
- 모달 내 3개 탭: 변환된 HTML / 원본 PNG / HTML 코드
- HTML URL 복사 (브라우저 주소창 붙여넣기) / HTML 코드 복사

**2. ODS 아이콘 자동 매칭**
- 스텔라님 `icons.js` 통합 (ODS 아이콘 1300+개 inline SVG)
- Figma 인스턴스 → 정확한 ODS 아이콘 SVG로 자동 변환
- 매칭 실패 시 PNG 폴백 자동 처리

**3. 컴포넌트 템플릿 레지스트리 (확장 기반)**
- Track/ODS 컴포넌트 HTML 템플릿 등록 시스템 구축
- Variant + base 이름 조합 매칭 (예: `bookmark_filled`)
- Track 추가 후 나중에 ODS 추가해도 자동 통합

### 🎨 변환 정확도 개선
1. **Layout**: `layoutMode` → flexbox, `padding` / `itemSpacing` / `sizing(FILL/HUG/FIXED)` 부모 방향 따라 분기
2. **Style**: `fills` (SOLID/GRADIENT), `strokes` (alignment 별), `borderRadius` (4면 분리), `opacity`, `effects` (drop shadow, blur)
3. **Text**: 폰트 패밀리/굵기 / `lineHeight` / `letterSpacing` / 색상 / `textAlign` / `textCase` / `textDecoration` / `textTruncation` NONE 레이아웃
4. **ABSOLUTE 포지셔닝**: 좌표 기반 absolute 처리 (이전: 부정확하게 배치되던 문제 해결)
5. **이미지/벡터**: PNG export, `[Asset]` 태그도 단일 이미지로 처리

### 🛠 UI/UX 개선

**1. Validate 결과 화면**
- O!Slice 로고 자동 숨김
- info-box ("Text, Shape..." 안내) 자동 숨김
- "디자이너 확인 필요 N건" 텍스트 + bulk 버튼 상단 고정 → 그 아래만 스크롤
- 스크롤 시 상단/하단(HTML 만들기 버튼 위)에 옅은 그림자 표시
- bulk 버튼에 카운트 표시: `Structure 전체 수정 (3)` / `Naming 전체 수정 (2)`
- 버튼 높이 통일 (28px)
- "네이밍" → "Naming"

**2. HTML 만들기 화면**
- 3개 탭 (변환된 HTML / 원본 PNG / HTML 코드) + 뒤로가기 버튼
- 활성 탭 검정 underline 슬라이드 애니메이션
- 탭/뒤로가기/복사 버튼 hover 효과 (검정 4%)
- 스크롤 시 상단 헤더 그림자
- Snackbar 알림: 복사 완료 시 하단 토스트로 안내

### 🐛 버그 수정
1. 다른 화면 선택 시 플러그인 자동 리셋 (`lastValidatedId` 자동 클리어, HTML 모달 자동 닫힘)
2. `[Asset]` 컴포넌트가 4개 이미지로 분리되던 버그 (스파클 등) → 단일 PNG로 통합
3. 변환 결과의 양옆 padding 너비 → wrapper 음수 margin으로 전체 너비 확장
4. 활성 탭 검정 바와 divider 정렬 → pseudo-element 절대 위치로 픽셀 단위 정확도

### 📝 기타
1. manifest에 Pretendard CDN 추가 (`cdn.jsdelivr.net`) → 미리보기에서 정확한 폰트 렌더링
2. PNG export scale 2x → 1x (URL 길이 약 1/4로 축소)
3. 알고리즘 자체 한계로 정확도 약 60~70% (컴포넌트 템플릿 추가 시 90%+ 도달 가능)

---

## 이전 (2026-04-26 ~ 2026-04-27)
- Validate 기능 (구조/네이밍 검증)
- Validate UI 개선, Auto Layout 감지 룰
- Hidden layer 삭제, select 오작동 수정
- Figma spec 매칭 UI 레이아웃
