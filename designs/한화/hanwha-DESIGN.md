# Hanwha Design System
> oh-my-design format · Brand Essence: "Energy for Life"

---

## 1. Visual Theme & Atmosphere

**Brand Identity**
㈜한화(Hanwha)는 에너지·방산·화학·금융·레저를 아우르는 글로벌 복합기업이다.
로고 **트라이서클(Tricircle)**은 세 개의 원이 교차하며 고객·사회·인류의 조화로운 발전과 무한성장을 상징한다.

**Visual Personality**
- **Energetic & Warm** — 오렌지 에너지가 화면을 관통한다. 차갑지 않고, 뜨겁지만 믿음직하다.
- **Bold & Trustworthy** — 대기업의 무게감을 지니되, 딱딱하지 않은 따뜻한 권위.
- **Dynamic & Global** — 원의 움직임, 확장, 연결을 모티프로 삼은 레이아웃.
- **Clean & Structured** — 넓은 여백, 명확한 계층 구조. 복잡함을 감추고 본질을 드러낸다.

**Mood Board Keywords**
`Sunrise` · `Precision` · `Flow` · `Scale` · `Humanity` · `Infinite`

**Atmosphere Rule**
- 배경은 항상 크림/화이트 계열로 시작 → 오렌지 강조 밴드 → 다크 풋터로 마무리.
- 오렌지는 포인트로만. 배경 전체를 오렌지로 채우는 것은 금지.
- 텍스처 없음, 노이즈 없음. 오직 색상과 형태와 공간으로만.

---

## 2. Color Palette & Roles

### Primary Palette

| Token | Hex | Role |
|---|---|---|
| `--color-brand` | `#ed7100` | 메인 브랜드, CTA 버튼, 강조 텍스트 |
| `--color-brand-light` | `#f4a051` | 호버 상태, 보조 강조, 아이콘 틴트 |
| `--color-brand-cream` | `#f7bb82` | 트라이서클 하이라이트, 배경 틴트, 배지 |
| `--color-dark` | `#231815` | 워드마크, 헤딩 텍스트, 풋터 배경 |

### Neutral Palette

| Token | Hex | Role |
|---|---|---|
| `--color-white` | `#FFFFFF` | 기본 배경, 카드 배경 |
| `--color-off-white` | `#FFF8F3` | 따뜻한 섹션 배경, 입력 필드 배경 |
| `--color-gray` | `#6B6B6B` | 보조 텍스트, 캡션, 플레이스홀더 |
| `--color-gray-light` | `#E8E0DA` | 구분선, 비활성 상태 |

### Usage Rules
- **CTA 버튼:** `#ed7100` 배경 + `#FFFFFF` 텍스트
- **Secondary 버튼:** `#FFFFFF` 배경 + `#ed7100` 테두리 + `#ed7100` 텍스트
- **링크:** `#ed7100`, 호버 시 `#f4a051`
- **오렌지 + 다크 콤보:** 풋터, 히어로 역배경용으로만
- **절대 금지:** 오렌지 on 오렌지 / 크림 on 화이트 (대비 부족)

### Color Rhythm (페이지 흐름)
```
#FFFFFF (히어로/헤더)
→ #FFF8F3 (콘텐츠 섹션)
→ #ed7100 (강조 밴드/CTA 섹션)
→ #231815 (풋터)
```

---

## 3. Typography

### Font Stack
```css
/* Primary: 한글 */
font-family: 'Pretendard', 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif;

/* Fallback: 영문 */
font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
```

> Pretendard는 CDN 또는 npm 패키지로 로드.  
> Google Fonts에서는 Noto Sans KR을 대체로 사용.

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `--text-display` | 56px / 3.5rem | 700 | 1.15 | 히어로 메인 헤드라인 |
| `--text-h1` | 40px / 2.5rem | 700 | 1.2 | 섹션 타이틀 |
| `--text-h2` | 32px / 2rem | 600 | 1.25 | 서브 섹션 |
| `--text-h3` | 24px / 1.5rem | 600 | 1.35 | 카드 타이틀, 리스트 헤더 |
| `--text-body-lg` | 18px / 1.125rem | 400 | 1.7 | 리드 카피, 중요 설명 |
| `--text-body` | 16px / 1rem | 400 | 1.65 | 본문 텍스트 |
| `--text-body-sm` | 14px / 0.875rem | 400 | 1.6 | 캡션, 메타 정보 |
| `--text-label` | 12px / 0.75rem | 600 | 1.4 | 배지, 태그, 버튼 레이블 (대문자) |

### Type Rules
- **한글:** 자간(letter-spacing) `-0.02em` ~ `0` 사용. 음수 자간은 700 이상에서만.
- **영문 헤딩:** letter-spacing `-0.03em` (타이트하게)
- **본문:** `#231815` (다크) 또는 `#6B6B6B` (보조)
- **강조:** `#ed7100` 또는 `font-weight: 700`

---

## 4. Spacing & Layout

### Base Unit
`8px` (0.5rem) — 모든 여백은 8의 배수

### Spacing Scale
```
4px   (0.25rem)  — xs: 아이콘 내부 패딩
8px   (0.5rem)   — sm: 인라인 요소 간격
16px  (1rem)     — md: 컴포넌트 내부 패딩
24px  (1.5rem)   — lg: 카드 패딩
32px  (2rem)     — xl: 섹션 내부 요소 간격
48px  (3rem)     — 2xl: 섹션 간 여백
64px  (4rem)     — 3xl: 히어로 패딩
96px  (6rem)     — 4xl: 대형 섹션 여백
```

### Grid System
- **컨테이너 최대 너비:** 1280px
- **컬럼:** 12-column grid
- **거터:** 24px (모바일 16px)
- **사이드 패딩:** 24px ~ 80px (뷰포트에 따라 clamp)

### Breakpoints
```
mobile:  < 768px
tablet:  768px ~ 1024px
desktop: > 1024px
wide:    > 1440px
```

### Layout Principles
- **히어로:** 전체 너비, 최소 높이 600px. 로고/타이틀 수직 중앙 정렬.
- **섹션 패딩:** `padding: 96px 0` (데스크탑), `64px 0` (태블릿), `48px 0` (모바일)
- **카드 그리드:** 3-column (데스크탑) → 2-column (태블릿) → 1-column (모바일)
- **네비게이션 높이:** 72px (스크롤 후 64px로 축소)

---

## 5. Component Patterns

### Button

**Primary Button**
```
배경: #ed7100
텍스트: #FFFFFF, font-weight: 600, 14px
패딩: 12px 28px
border-radius: 4px
호버: #f4a051 배경, transform: translateY(-1px)
액티브: #c95f00 배경
```

**Secondary Button (Outline)**
```
배경: transparent
테두리: 2px solid #ed7100
텍스트: #ed7100, font-weight: 600
패딩: 10px 26px
border-radius: 4px
호버: #ed7100 배경, #FFFFFF 텍스트
```

**Ghost Button (Dark)**
```
배경: transparent
테두리: 2px solid #231815
텍스트: #231815
호버: #231815 배경, #FFFFFF 텍스트
```

### Card
```
배경: #FFFFFF
border-radius: 8px
shadow: 0 2px 12px rgba(35, 24, 21, 0.08)
패딩: 24px
호버 shadow: 0 8px 32px rgba(237, 113, 0, 0.15)
호버 transform: translateY(-4px)
transition: 0.3s ease
상단 액센트: 4px solid #ed7100 (top border)
```

### Navigation
```
배경: #FFFFFF (스크롤 전) → rgba(255,255,255,0.95) + blur(12px) (스크롤 후)
높이: 72px
로고 영역: 왼쪽 정렬
링크: #231815, 호버 #ed7100, 언더라인 없음
CTA 버튼: Primary 스타일
border-bottom: 1px solid #E8E0DA
position: sticky, top: 0, z-index: 100
```

### Input Field
```
배경: #FFF8F3
테두리: 1px solid #E8E0DA
border-radius: 4px
패딩: 12px 16px
포커스: border-color: #ed7100, outline: 3px solid rgba(237,113,0,0.15)
```

### Badge / Tag
```
배경: #f7bb82 (크림)
텍스트: #231815, 12px, font-weight: 600
패딩: 4px 10px
border-radius: 2px
또는 배경: #ed7100, 텍스트: #FFFFFF (강조 배지)
```

### Divider / Accent Line
```
오렌지 구분선: 2px solid #ed7100, width: 48px (섹션 타이틀 하단 장식)
수평 구분선: 1px solid #E8E0DA
```

---

## 6. Motion & Interaction

### Easing Functions
```css
--ease-standard:  cubic-bezier(0.4, 0, 0.2, 1);   /* 기본 전환 */
--ease-enter:     cubic-bezier(0, 0, 0.2, 1);       /* 요소 등장 */
--ease-exit:      cubic-bezier(0.4, 0, 1, 1);       /* 요소 퇴장 */
--ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1); /* 스프링감 (버튼 호버) */
```

### Duration Scale
```
fast:    150ms  — 색상 전환, 포커스 링
normal:  250ms  — 호버, 페이드
medium:  350ms  — 카드 상승, 드롭다운
slow:    500ms  — 섹션 페이드인
xslow:   800ms  — 히어로 등장, 페이지 전환
```

### Interaction Patterns

**Button Hover**
```css
transform: translateY(-1px);
box-shadow: 0 4px 16px rgba(237, 113, 0, 0.3);
transition: all 150ms var(--ease-spring);
```

**Card Hover**
```css
transform: translateY(-4px);
box-shadow: 0 8px 32px rgba(237, 113, 0, 0.15);
transition: all 250ms var(--ease-standard);
```

**Scroll-triggered Fade-in**
```css
/* 초기 상태 */
opacity: 0;
transform: translateY(24px);
/* 뷰포트 진입 후 */
opacity: 1;
transform: translateY(0);
transition: opacity 500ms ease, transform 500ms ease;
```

**Navigation Shrink on Scroll**
```css
/* 스크롤 후 */
height: 64px;  /* 72px → 64px */
backdrop-filter: blur(12px);
transition: height 250ms ease;
```

### Principles
- **에너지감:** 오렌지 계열 요소는 약간의 스케일/이동 효과로 "살아있음"을 표현.
- **과하지 않게:** 애니메이션은 보조 역할. 콘텐츠를 방해하지 않는다.
- **`prefers-reduced-motion`:** 모든 트랜지션을 즉각 처리(duration: 0.01ms).

---

## 7. Iconography & Imagery

### Icon Style
- **스타일:** Outlined / Rounded (stroke-based)
- **선 굵기:** 1.5px ~ 2px
- **크기:** 16 / 20 / 24 / 32 / 48px 그리드 기반
- **색상:** `#231815` (기본) / `#ed7100` (강조) / `#6B6B6B` (보조)
- **추천 라이브러리:** Lucide Icons, Phosphor Icons (rounded variant)

### Logo Usage
- **최소 여백:** 로고 높이의 50% 이상을 모든 방향에 확보
- **최소 크기:** 가로 120px 이하 사용 금지
- **배경 조합:**
  - 화이트/크림 배경 → 기본 컬러 로고 (오렌지 + 다크)
  - 다크 배경 → 화이트 버전 (SVG fill을 #FFFFFF로 교체)
  - 오렌지 배경 → 화이트 버전만 허용
- **왜곡 금지:** 비율 고정, 회전 금지, 투명도 변경 금지

### Photography Style
- **톤:** 따뜻한 자연광, 오렌지/앰버 계열 컬러 그레이딩
- **피사체:** 사람 중심 (인류와의 연결), 에너지 시설, 기술 현장
- **처리:** 오버레이 없이 사진 자체로 메시지 전달. 필요 시 오렌지 그라디언트 오버레이 (opacity 0.2~0.4)
- **금지:** 차갑고 파란 톤 사진, 과도한 보정

### Illustration / Graphic
- **트라이서클 모티프:** 세 원의 교차·확장을 배경 그래픽, 워터마크, 섹션 장식에 활용
- **스타일:** Flat + 약간의 깊이감 (subtle shadow)
- **색상:** 브랜드 팔레트 4색 내에서만 사용

---

## 8. Dark Mode (한화 다크 버전)

### Dark Palette

| Token | Light | Dark |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | `#1A100C` |
| `--bg-secondary` | `#FFF8F3` | `#231815` |
| `--bg-elevated` | `#FFFFFF` | `#2E1F19` |
| `--text-primary` | `#231815` | `#F5EDE6` |
| `--text-secondary` | `#6B6B6B` | `#A89488` |
| `--border` | `#E8E0DA` | `#3D2820` |
| `--brand` | `#ed7100` | `#ed7100` (동일) |
| `--brand-light` | `#f4a051` | `#f4a051` (동일) |

> 오렌지는 다크 모드에서도 그대로 유지. 브랜드 아이덴티티 핵심.

### Dark Mode Rules
- **배경:** 완전한 블랙(`#000`) 대신 다크 브라운(`#1A100C`)으로 오렌지와 조화
- **카드:** `#2E1F19` 배경 + `0 2px 12px rgba(0,0,0,0.4)` 그림자
- **네비게이션:** `#231815` 배경 + `rgba(35,24,21,0.95)` blur
- **풋터:** `#0F0804` (가장 어두운 레이어)
- **오렌지 CTA 버튼:** 다크 모드에서도 동일하게 유지
- **글로우 효과:** 오렌지 요소에 `box-shadow: 0 0 20px rgba(237,113,0,0.3)` 추가 가능

### CSS Implementation
```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary:    #1A100C;
    --bg-secondary:  #231815;
    --bg-elevated:   #2E1F19;
    --text-primary:  #F5EDE6;
    --text-secondary:#A89488;
    --border:        #3D2820;
  }
}
```

---

## 9. Accessibility

### Color Contrast (WCAG 2.1 AA 이상)

| Foreground | Background | Ratio | Grade |
|---|---|---|---|
| `#FFFFFF` | `#ed7100` | 3.1:1 | AA (Large) |
| `#231815` | `#FFFFFF` | 16.1:1 | AAA ✅ |
| `#231815` | `#FFF8F3` | 15.2:1 | AAA ✅ |
| `#231815` | `#f7bb82` | 6.5:1 | AA ✅ |
| `#6B6B6B` | `#FFFFFF` | 5.7:1 | AA ✅ |
| `#FFFFFF` | `#231815` | 16.1:1 | AAA ✅ |

> ⚠️ `#ed7100` 배경에 `#FFFFFF` 소문자 텍스트(14px 이하): 3.1:1 → AA 미달.  
> → CTA 버튼은 `font-weight: 600` 이상 + 14px 초과 유지 필수.

### Keyboard Navigation
- 모든 인터랙티브 요소: `Tab` 키로 접근 가능
- 포커스 링: `outline: 3px solid #ed7100; outline-offset: 2px`
- 포커스 링 숨기기 금지 (`:focus-visible` 사용 권장)

### Screen Reader
- 이미지: 의미 있는 `alt` 텍스트 필수
- 아이콘 전용 버튼: `aria-label` 필수
- 로고 SVG: `role="img"` + `<title>한화 로고</title>` 삽입
- 섹션: `<main>`, `<nav>`, `<header>`, `<footer>` 시맨틱 태그 사용

### Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Touch Targets
- 최소 터치 영역: 44×44px (iOS HIG / WCAG 2.5.5)
- 버튼 간 최소 간격: 8px

### Language & Readability
- `<html lang="ko">` 선언 필수
- 본문 최대 너비: 70ch (한글 기준 약 700px)
- 줄 간격: 최소 1.5 (본문), 1.2 (헤딩)

---

*Hanwha Design System — oh-my-design format*  
*Last updated: 2026-04-20*
