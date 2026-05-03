# [SpaceAI] Top Bar

상단 내비게이션 바 컴포넌트. 화면 최상단에 위치하며 페이지의 진입점, 타이틀, 보조 액션을 제공합니다.

- **Figma**: [Space AI Component Library — Top Bar](https://www.figma.com/design/wTKVQLp8fZ8Or8378mVcBJ/Space-AI-Component-Library?node-id=75-411)
- **Node ID**: `75:411`

---

## 1. 개요

| 항목 | 값 |
| --- | --- |
| 컴포넌트명 | `[SpaceAI] Top Bar` |
| Width | `375px` |
| Height | `44px` |
| Padding | `16px` (좌우) |
| Layout | Flex / 가로 정렬 |

---

## 2. Variants (3종)

| # | Type | Color | 사용처 |
| --- | --- | --- | --- |
| 1 | `Home` | `White` | 홈 화면 — 좌측 뒤로가기 + 우측 4개 액션 아이콘(텍스트 포함) |
| 2 | `General` | `White` | 일반 페이지 (다크/이미지 배경) — 좌측 뒤로가기 + 중앙 타이틀(흰색) + 우측 닫기 |
| 3 | `General` | `Black` | 일반 페이지 (라이트 배경) — 좌측 뒤로가기 + 중앙 타이틀(검정) + 우측 닫기 |

---

## 3. Props

```ts
type SpaceAiTopBarProps = {
  type?: "Home" | "General";          // 기본값: "Home"
  color?: "White" | "Black"; // 기본값: "White"
  left?: boolean;                      // 좌측 아이콘 버튼 노출 여부 (기본값: true)
  right?: boolean;                     // 우측 아이콘/액션 노출 여부 (기본값: true)
  title?: boolean;                     // 중앙 타이틀 노출 여부 (기본값: true) — General 타입 한정
  titleText?: string;                  // 타이틀 텍스트 (기본값: "페이지 타이틀")
  className?: string;
};
```

---

## 4. Variant별 구성

### 4-1. Type=Home, Color=White

홈 화면 전용. 우측에 4개 액션 버튼이 노출됨.

| 위치 | 요소 | 비고 |
| --- | --- | --- |
| Left | `Icon Button` (Arrow Left) | 뒤로가기 |
| Right | `Icon Button w.Text` × 4 | `뷰 변경`, `캡처`, `방 목록`, `메뉴` |

- 각 우측 버튼 너비: `40px`
- 아이콘 + 라벨(`Detail12/Medium`, `foregroundWeak #8C8C8C`) 세로 정렬
- 라벨 색상은 디폴트로 weak — 다크 배경 위에 사용 시 inverse 처리 필요

### 4-2. Type=General, Color=White

다크 배경/이미지 위에서 사용. 텍스트와 아이콘이 모두 흰색.

| 위치 | 요소 | 비고 |
| --- | --- | --- |
| Left | `Icon Button` (Arrow Left, 흰색) | 뒤로가기 |
| Center | `Title` (`Body16/Medium`, `foregroundInverse #FFFFFF`) | `titleText` |
| Right | `Icon Button` (X, 흰색) | 닫기 |

### 4-3. Type=General, Color=Black

라이트 배경 위에서 사용. 텍스트와 아이콘이 모두 검정.

| 위치 | 요소 | 비고 |
| --- | --- | --- |
| Left | `Icon Button` (Arrow Left, 검정) | 뒤로가기 |
| Center | `Title` (`Body16/Medium`, `foreground #141414`) | `titleText` |
| Right | `Icon Button` (X, 검정) | 닫기 |

---

## 5. 디자인 토큰

### Color

| Token | Hex | 사용처 |
| --- | --- | --- |
| `foreground` | `#141414` | General/Black 타이틀·아이콘 |
| `foregroundInverse` | `#FFFFFF` | General/White 타이틀·아이콘 |
| `foregroundWeak` | `#8C8C8C` | Home 우측 버튼 라벨 |

### Typography

| Token | Family | Weight | Size / Line | Letter Spacing | 사용처 |
| --- | --- | --- | --- | --- | --- |
| `Body16/Body16L20_Medium` | Pretendard | Medium (500) | 16 / 20 | -0.3 | 중앙 타이틀 |
| `Detail12/Detail12L16_Medium` | Pretendard | Medium (500) | 12 / 16 | -0.3 | Home 우측 버튼 라벨 |

---

## 6. 사용된 하위 컴포넌트 / 아이콘

| 종류 | 이름 | 태그 |
| --- | --- | --- |
| Component | `🌀 Icon Button` | Android/iOS/Web 사용 가능 |
| Icon | `[Icon] Arrow Left` | #화살표 #왼쪽 #뒤로가기 |
| Icon | `[Icon] Cube` | #3d #큐브 #공간 #space (뷰 변경) |
| Icon | `[Icon] Line 3 Horizontal` | #menu #메뉴 |
| Icon | `[Icon] X` | #close #닫기 #dismiss |

---

## 7. 사용 가이드

- **Home 변형**은 홈 화면에서만 사용. 4개 액션은 Space AI 핵심 기능(뷰 변경 / 캡처 / 방 목록 / 메뉴) 진입 지점.
- **General 변형**은 일반 페이지에서 사용. 배경 명도에 따라 `White` / `Black`을 선택.
  - 어두운 배경·이미지 위 → `Color=White`
  - 밝은 배경 위 → `Color=Black`
- `title=false`로 두면 중앙 타이틀이 숨겨짐 (General 한정).
- `left` / `right`를 `false`로 두면 해당 슬롯이 비어 정렬이 그에 맞춰 변경됨.
- 모든 변형 공통으로 높이는 `44px` 고정.

---

## 8. HTML Template

> 이 섹션은 빌드 스크립트(`scripts/build-registry.js`)가 자동으로 읽어서 플러그인 `COMPONENT_REGISTRY`에 주입합니다.
> 수정 후 `npm run build` 실행 시 자동 반영됩니다.

### Default

```html
<div style="display:flex;justify-content:space-between;align-items:center;width:100%;height:44px;padding:0 16px;box-sizing:border-box;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><mask id="mask1_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="4" width="18" height="16"><path d="M10.1328 4.49834C10.4443 4.18509 10.9509 4.18371 11.2642 4.49526C11.5774 4.80683 11.5788 5.31339 11.2672 5.62666L5.72397 11.2H20.2C20.6418 11.2 21 11.5582 21 12C21 12.4418 20.6418 12.8 20.2 12.8H5.72397L11.2672 18.3733C11.5788 18.6866 11.5774 19.1932 11.2642 19.5047C10.9509 19.8163 10.4443 19.8149 10.1328 19.5017L3.23276 12.5642C2.92725 12.257 2.92249 11.7636 3.21845 11.4506L3.23276 11.4358L10.1328 4.49834Z" fill="black"/></mask><g mask="url(#mask1_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></mask><g mask="url(#mask0_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></svg><span style="font-size:16px;font-weight:500;line-height:20px;letter-spacing:-0.3px;color:#141414;">{titleText}</span><svg-placeholder data-candidates="x" data-w="24" data-h="24" style="width:24px;height:24px;flex-shrink:0;"></svg-placeholder></div>
```

### Variant: Color=White, Type=Home

```html
<div style="display:flex;justify-content:space-between;align-items:center;width:100%;height:44px;padding:0 16px;box-sizing:border-box;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><mask id="mask1_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="4" width="18" height="16"><path d="M10.1328 4.49834C10.4443 4.18509 10.9509 4.18371 11.2642 4.49526C11.5774 4.80683 11.5788 5.31339 11.2672 5.62666L5.72397 11.2H20.2C20.6418 11.2 21 11.5582 21 12C21 12.4418 20.6418 12.8 20.2 12.8H5.72397L11.2672 18.3733C11.5788 18.6866 11.5774 19.1932 11.2642 19.5047C10.9509 19.8163 10.4443 19.8149 10.1328 19.5017L3.23276 12.5642C2.92725 12.257 2.92249 11.7636 3.21845 11.4506L3.23276 11.4358L10.1328 4.49834Z" fill="black"/></mask><g mask="url(#mask1_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></mask><g mask="url(#mask0_1163_1017)"><rect width="24" height="24" fill="white"/></g></svg><div style="display:flex;align-items:center;gap:0;"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:40px;height:44px;"><svg-placeholder data-candidates="cube|cube_badge_sparkle" data-w="20" data-h="20" style="width:20px;height:20px;filter:brightness(0) invert(1);"></svg-placeholder><span style="font-size:12px;font-weight:500;line-height:16px;letter-spacing:-0.3px;color:#8C8C8C;">뷰 변경</span></div><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:40px;height:44px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1078" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="3" width="18" height="18"><path d="M3.99995 13.2C4.44178 13.2 4.79995 13.5582 4.79995 14V19.2H9.99995C10.4418 19.2 10.8 19.5582 10.8 20C10.8 20.4418 10.4418 20.8 9.99995 20.8H3.99995C3.55812 20.8 3.19995 20.4418 3.19995 20V14C3.19995 13.5582 3.55812 13.2 3.99995 13.2Z" fill="black"/><path d="M20 3.2C20.4418 3.2 20.8 3.55817 20.8 4V10C20.8 10.4418 20.4418 10.8 20 10.8C19.5581 10.8 19.2 10.4418 19.2 10V4.8H14C13.5581 4.8 13.2 4.44182 13.2 4C13.2 3.55817 13.5581 3.2 14 3.2H20Z" fill="black"/></mask><g mask="url(#mask0_1163_1078)"><rect width="24" height="24" fill="white"/></g></svg><span style="font-size:12px;font-weight:500;line-height:16px;letter-spacing:-0.3px;color:#8C8C8C;">캡처</span></div><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:40px;height:44px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><g clip-path="url(#clip0_1163_1093)"><mask id="mask0_1163_1093" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="2" y="2" width="20" height="20"><path d="M7.99995 14.7C8.49701 14.7 8.89995 15.1029 8.89995 15.6C8.89995 16.0971 8.49701 16.5 7.99995 16.5C7.50289 16.5 7.09995 16.0971 7.09995 15.6C7.09995 15.1029 7.50289 14.7 7.99995 14.7Z" fill="black"/><path d="M16.25 14.8C16.6918 14.8 17.05 15.1582 17.05 15.6C17.05 16.0418 16.6918 16.4 16.25 16.4H11.35C10.9081 16.4 10.55 16.0418 10.55 15.6C10.55 15.1582 10.9081 14.8 11.35 14.8H16.25Z" fill="black"/><path d="M7.99995 11.1C8.49701 11.1 8.89995 11.5029 8.89995 12C8.89995 12.4971 8.49701 12.9 7.99995 12.9C7.50289 12.9 7.09995 12.4971 7.09995 12C7.09995 11.5029 7.50289 11.1 7.99995 11.1Z" fill="black"/><path d="M16.25 11.2C16.6918 11.2 17.05 11.5582 17.05 12C17.05 12.4418 16.6918 12.8 16.25 12.8H11.35C10.9081 12.8 10.55 12.4418 10.55 12C10.55 11.5582 10.9081 11.2 11.35 11.2H16.25Z" fill="black"/><path d="M7.99995 7.5C8.49701 7.5 8.89995 7.90294 8.89995 8.4C8.89995 8.89705 8.49701 9.3 7.99995 9.3C7.50289 9.3 7.09995 8.89705 7.09995 8.4C7.09995 7.90294 7.50289 7.5 7.99995 7.5Z" fill="black"/><path d="M16.25 7.6C16.6918 7.6 17.05 7.95817 17.05 8.4C17.05 8.84182 16.6918 9.2 16.25 9.2H11.35C10.9081 9.2 10.55 8.84183 10.55 8.4C10.55 7.95817 10.9081 7.6 11.35 7.6H16.25Z" fill="black"/><path fill-rule="evenodd" clip-rule="evenodd" d="M16.125 2.95C17.645 2.95 18.9248 3.29694 19.8139 4.18603C20.703 5.07513 21.05 6.35487 21.05 7.875V16.125C21.05 17.6451 20.703 18.9249 19.8139 19.814C18.9248 20.7031 17.645 21.05 16.125 21.05H7.87495C6.35489 21.05 5.07515 20.7031 4.18604 19.814C3.29692 18.9249 2.94995 17.6451 2.94995 16.125V7.875C2.94995 6.35487 3.29692 5.07513 4.18604 4.18603C5.07515 3.29694 6.35489 2.95 7.87495 2.95H16.125ZM7.87495 4.55C6.56645 4.55 5.78368 4.8512 5.31743 5.31743C4.85119 5.78366 4.54995 6.56644 4.54995 7.875V16.125C4.54995 17.4336 4.85119 18.2163 5.31743 18.6826C5.78368 19.1488 6.56645 19.45 7.87495 19.45H16.125C17.4334 19.45 18.2162 19.1488 18.6825 18.6826C19.1487 18.2163 19.45 17.4336 19.45 16.125V7.875C19.45 6.56644 19.1487 5.78366 18.6825 5.31743C18.2162 4.8512 17.4334 4.55 16.125 4.55H7.87495Z" fill="black"/></mask><g mask="url(#mask0_1163_1093)"><rect width="24" height="24" fill="white"/></g></g><defs><clipPath id="clip0_1163_1093"><rect width="24" height="24" fill="white"/></clipPath></defs></svg><span style="font-size:12px;font-weight:500;line-height:16px;letter-spacing:-0.3px;color:#8C8C8C;">방 목록</span></div><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:40px;height:44px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1110" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="4" width="18" height="16"><path d="M19.55 17.65C19.9918 17.65 20.35 18.0082 20.35 18.45C20.35 18.8918 19.9918 19.25 19.55 19.25H4.39998C3.95815 19.25 3.59998 18.8918 3.59998 18.45C3.59998 18.0082 3.95815 17.65 4.39998 17.65H19.55Z" fill="black"/><path d="M19.55 11.2C19.9918 11.2 20.35 11.5582 20.35 12C20.35 12.4418 19.9918 12.8 19.55 12.8H4.39998C3.95815 12.8 3.59998 12.4418 3.59998 12C3.59998 11.5582 3.95815 11.2 4.39998 11.2H19.55Z" fill="black"/><path d="M19.55 4.75C19.9918 4.75 20.35 5.10817 20.35 5.55C20.35 5.99183 19.9918 6.35 19.55 6.35H4.39998C3.95815 6.35 3.59998 5.99183 3.59998 5.55C3.59998 5.10817 3.95815 4.75 4.39998 4.75H19.55Z" fill="black"/></mask><g mask="url(#mask0_1163_1110)"><rect width="24" height="24" fill="white"/></g></svg><span style="font-size:12px;font-weight:500;line-height:16px;letter-spacing:-0.3px;color:#8C8C8C;">메뉴</span></div></div></div>
```

### Variant: Color=White, Type=General

```html
<div style="display:flex;justify-content:space-between;align-items:center;width:100%;height:44px;padding:0 16px;box-sizing:border-box;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><mask id="mask1_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="4" width="18" height="16"><path d="M10.1328 4.49834C10.4443 4.18509 10.9509 4.18371 11.2642 4.49526C11.5774 4.80683 11.5788 5.31339 11.2672 5.62666L5.72397 11.2H20.2C20.6418 11.2 21 11.5582 21 12C21 12.4418 20.6418 12.8 20.2 12.8H5.72397L11.2672 18.3733C11.5788 18.6866 11.5774 19.1932 11.2642 19.5047C10.9509 19.8163 10.4443 19.8149 10.1328 19.5017L3.23276 12.5642C2.92725 12.257 2.92249 11.7636 3.21845 11.4506L3.23276 11.4358L10.1328 4.49834Z" fill="black"/></mask><g mask="url(#mask1_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></mask><g mask="url(#mask0_1163_1017)"><rect width="24" height="24" fill="white"/></g></svg><span style="font-size:16px;font-weight:500;line-height:20px;letter-spacing:-0.3px;color:#FFFFFF;">{titleText}</span><svg-placeholder data-candidates="x" data-w="24" data-h="24" style="width:24px;height:24px;flex-shrink:0;filter:brightness(0) invert(1);"></svg-placeholder></div>
```

### Variant: Color=Black, Type=General

```html
<div style="display:flex;justify-content:space-between;align-items:center;width:100%;height:44px;padding:0 16px;box-sizing:border-box;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><mask id="mask0_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><mask id="mask1_1163_1017" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="3" y="4" width="18" height="16"><path d="M10.1328 4.49834C10.4443 4.18509 10.9509 4.18371 11.2642 4.49526C11.5774 4.80683 11.5788 5.31339 11.2672 5.62666L5.72397 11.2H20.2C20.6418 11.2 21 11.5582 21 12C21 12.4418 20.6418 12.8 20.2 12.8H5.72397L11.2672 18.3733C11.5788 18.6866 11.5774 19.1932 11.2642 19.5047C10.9509 19.8163 10.4443 19.8149 10.1328 19.5017L3.23276 12.5642C2.92725 12.257 2.92249 11.7636 3.21845 11.4506L3.23276 11.4358L10.1328 4.49834Z" fill="black"/></mask><g mask="url(#mask1_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></mask><g mask="url(#mask0_1163_1017)"><rect width="24" height="24" fill="#141414"/></g></svg><span style="font-size:16px;font-weight:500;line-height:20px;letter-spacing:-0.3px;color:#141414;">{titleText}</span><svg-placeholder data-candidates="x" data-w="24" data-h="24" style="width:24px;height:24px;flex-shrink:0;"></svg-placeholder></div>
```
