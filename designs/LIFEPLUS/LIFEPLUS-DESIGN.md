---
omd: 0.1
brand: LIFEPLUS (Hanwha Life)
---

# Design System Inspired by LIFEPLUS

## 1. Visual Theme & Atmosphere

LIFEPLUS is Hanwha Life's lifestyle finance brand — a "Life Solution Curator" that weaves culture and finance into practical, happiness-oriented solutions. The visual language is fresh, clean, and approachable — a deliberate departure from the heavy, trustworthy-but-dull conventions of traditional Korean insurance. Where most financial brands default to navy blue and serif authority, LIFEPLUS leads with a vibrant green (`#1BD97B`) that radiates optimism and growth.

The design system is built on a foundation of generous white space and a custom LIFEPLUS typeface derived from the brand's logo. This proprietary font — available in Light (300), Medium (500), and Bold (700) — gives every headline and UI element a cohesive brand identity that can't be replicated with standard web fonts. The letter-spacing is set to a tight `-0.02em` throughout, producing a polished, modern feel that avoids the "loosely set" look of default Korean typography.

The overall impression is of a premium lifestyle app that happens to be financial — think Starbucks' warmth crossed with Toss's clarity. Cards float on subtle shadows that shift to green-tinted glows on hover, sections alternate between pure white and the faintest off-white (`#F8F9FA`), and the green accent appears sparingly but decisively — on CTAs, active states, and key data highlights.

**Key Characteristics:**
- Vibrant LIFEPLUS Green (`#1BD97B`) — optimistic, growth-oriented, distinctly non-corporate
- Custom LIFEPLUS font family (Light/Medium/Bold) — logo-derived, brand-exclusive
- Tight letter-spacing (`-0.02em`) across all text — polished, modern Korean typography
- Generous white space with minimal decoration — content-first layout
- Green-tinted hover shadows (`rgba(27,217,123,0.15)`) — brand color bleeds into interaction
- Section rhythm: White → Off-white → Green accent band → White → Dark footer
- 16px border-radius on cards — friendly, rounded, approachable

## 2. Color Palette & Roles

### Primary
- **LIFEPLUS Green** (`#1BD97B`): The core brand color — vibrant, confident green used for primary CTAs, active indicators, key accent points, and positive/bull market signals. Not the muted green of finance — a full-saturation statement of optimism.
- **Deep Green** (`#00B85E`): Hover and pressed state for primary elements — a slightly darker, more saturated green that provides clear interactive feedback.
- **Light Green** (`#E6FBF1`): Tinted surface for green-themed sections, badge backgrounds, subtle highlight bands, and positive-signal backgrounds.

### Neutral
- **Pure White** (`#FFFFFF`): Primary page background, card surfaces, button text on green backgrounds.
- **Off White** (`#F8F9FA`): Alternating section backgrounds, card surfaces on white sections, subtle visual separation.
- **Gray 100** (`#F1F3F5`): Light borders, dividers, nav bottom border, input field backgrounds.
- **Gray 500** (`#868E96`): Secondary text, captions, metadata, placeholder text, de-emphasized labels.
- **Dark** (`#1A1A2E`): Primary heading text, body text, footer background — a deep blue-tinted black that's softer than pure black.

### Semantic / Market Signal
- **Positive / Bull** (`#1BD97B`): Upward trends, gains, success states — intentionally the same as brand green (brand = positive).
- **Caution** (`#FFA94D`): Warnings, attention-required states, neutral market indicators — warm amber.
- **Negative / Bear** (`#FF6B6B`): Downward trends, losses, error states, destructive actions — soft coral red.

### Gradient System
- LIFEPLUS's design is **gradient-minimal**. The brand identity relies on the single green accent against clean whites and neutrals. When gradients appear, they are subtle:
  - Hero sections: `linear-gradient(135deg, #1BD97B 0%, #00B85E 100%)` — green-to-deep-green for CTA hero blocks.
  - Dark sections: `linear-gradient(180deg, #1A1A2E 0%, #2D2D42 100%)` — subtle lift in footer/dark areas.

## 3. Typography Rules

> Brand Identity Guideline v3.0 (2025년 8월) 기준

### 서체 개요
LIFEPLUS 전용 서체는 브랜드 아이덴티티 강화를 위해 개발. 로고타입을 기반으로 알아보기 쉽고 읽기 쉽게 디자인되었으며, 넓게 열린 형태의 글꼴로 친근함과 가독성을 향상. 국문/영문 모두 지원.

### Font Family
- **Headline / UI / Logo**: `LIFEPLUS` (전용 커스텀 서체, 로컬)
- **Body (Korean fallback)**: `'Noto Sans KR'`, with fallback: `sans-serif`

### @font-face (OTF + TTF 이중 소스)

```css
@font-face {
  font-family: 'LIFEPLUS';
  src: url('../LIFEPLUS_assets/LIFEPLUS_1.1.0/LIFEPLUS Light.ttf') format('truetype'),
       url('../LIFEPLUS_assets/LIFEPLUS_1.1.0/LIFEPLUS OTF Light.otf') format('opentype');
  font-weight: 300;
  font-style: normal;
}

@font-face {
  font-family: 'LIFEPLUS';
  src: url('../LIFEPLUS_assets/LIFEPLUS_1.1.0/LIFEPLUS Medium.ttf') format('truetype'),
       url('../LIFEPLUS_assets/LIFEPLUS_1.1.0/LIFEPLUS OTF Medium.otf') format('opentype');
  font-weight: 500;
  font-style: normal;
}

@font-face {
  font-family: 'LIFEPLUS';
  src: url('../LIFEPLUS_assets/LIFEPLUS_1.1.0/LIFEPLUS Bold.ttf') format('truetype'),
       url('../LIFEPLUS_assets/LIFEPLUS_1.1.0/LIFEPLUS OTF Bold.otf') format('opentype');
  font-weight: 700;
  font-style: normal;
}
```

### Weight 별 용도 및 자간

| Weight | 용도 | 자간 (단독 표기 시) | CSS letter-spacing |
|--------|------|-------------------|-------------------|
| **LIFEPLUS Bold (700)** | 로고타입, 제목, 이벤트명 | 150pt | `0.15em` |
| **LIFEPLUS Medium (500)** | 소제목, 강조 텍스트 | 150pt | `0.15em` |
| **LIFEPLUS Light (300)** | 서브텍스트, 본문, 이벤트 설명 | 100pt | `0.10em` |

### 표기 규칙
- **LIFEPLUS 단독 표기 시** → Bold 우선 적용, 자간 `0.15em`
- **본문 내 일부로 사용 시** → 자간 적용 X (`letter-spacing: normal`)
- **이벤트/행사 아이덴티티** → 이벤트명 Bold `0.15em` + 서브 Light `0.10em` 조합

### CSS 유틸리티 클래스

```css
/* 로고타입 / 단독 표기 */
.lifeplus-logo {
  font-family: 'LIFEPLUS', sans-serif;
  font-weight: 700;
  letter-spacing: 0.15em;
}

/* 이벤트명 / 대제목 */
.heading-bold {
  font-family: 'LIFEPLUS', sans-serif;
  font-weight: 700;
  letter-spacing: 0.15em;
}

/* 소제목 */
.heading-medium {
  font-family: 'LIFEPLUS', sans-serif;
  font-weight: 500;
  letter-spacing: 0.15em;
}

/* 서브텍스트 / 이벤트 설명 */
.body-light {
  font-family: 'LIFEPLUS', sans-serif;
  font-weight: 300;
  letter-spacing: 0.10em;
}

/* 본문 (LIFEPLUS가 문장 일부로 사용될 때) */
.body-text {
  font-family: 'LIFEPLUS', 'Noto Sans KR', sans-serif;
  font-weight: 400;
  letter-spacing: normal;
}
```

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Logo / Brand | LIFEPLUS | varies | 700 | 1.10 | 0.15em | 단독 표기, 로고타입 |
| Display / Hero | LIFEPLUS | 48px (3rem) | 700 | 1.20 | 0.15em | 이벤트명, 대제목 |
| Section Heading | LIFEPLUS | 36px (2.25rem) | 700 | 1.25 | 0.15em | 주요 섹션 앵커 |
| Sub-heading | LIFEPLUS | 28px (1.75rem) | 500 | 1.30 | 0.15em | 소제목, 강조 |
| Sub-heading Small | LIFEPLUS | 22px (1.375rem) | 500 | 1.35 | 0.15em | 부섹션 제목 |
| Body Large | LIFEPLUS | 18px (1.125rem) | 300 | 1.60 | 0.10em | 서브텍스트, 리드 |
| Body Standard | Noto Sans KR | 16px (1rem) | 400 | 1.65 | normal | 한국어 본문 |
| Body Small | Noto Sans KR | 14px (0.875rem) | 400 | 1.55 | normal | 설명, 캡션 |
| Caption | Noto Sans KR | 13px (0.8125rem) | 400 | 1.45 | normal | 메타데이터, 타임스탬프 |
| Label | LIFEPLUS | 12px (0.75rem) | 500 | 1.30 | 0.15em | 배지, 태그 |
| Number / Data | LIFEPLUS | varies | 700 | 1.10 | 0.15em | 금융 수치, 퍼센트 |

### Principles
- **3단계 Weight 체계**: Bold(700) = 제목·로고, Medium(500) = 소제목·강조, Light(300) = 서브텍스트·본문. 공식 가이드라인 v3.0 준수.
- **자간은 맥락에 따라 분기**: 단독 표기(로고, 제목) 시 `0.15em` 넓게, 본문 내 사용 시 `normal`. 이 구분이 브랜드 아이덴티티의 핵심.
- **보조 폰트 Noto Sans KR**: LIFEPLUS 서체 미지원 영역(긴 한국어 본문) fallback. 읽기 쉬움 우선.
- **Generous body line-height**: 한국어 본문 1.60–1.65. 금융 콘텐츠의 가독성을 위해 일반 웹보다 넉넉하게.
- **이벤트 조합 패턴**: 이벤트명(Bold 0.15em) + 설명(Light 0.10em) 조합이 공식 아이덴티티 규칙.

## 4. Component Stylings

### Buttons

**Primary (Green)**
- Background: LIFEPLUS Green (`#1BD97B`)
- Text: Pure White (`#FFFFFF`)
- Padding: 12px 24px
- Radius: 8px
- Font: LIFEPLUS Medium (500), 16px
- Hover: Deep Green (`#00B85E`) + `transform: scale(1.02)` + `box-shadow: 0 4px 16px rgba(27,217,123,0.3)`
- Active: `transform: scale(0.98)`
- The hero CTA — unmistakable brand green, inviting click

**Secondary (Outlined)**
- Background: White (`#FFFFFF`)
- Border: 1.5px solid LIFEPLUS Green (`#1BD97B`)
- Text: LIFEPLUS Green (`#1BD97B`)
- Padding: 12px 24px
- Radius: 8px
- Font: LIFEPLUS Medium (500), 16px
- Hover: Light Green background (`#E6FBF1`) + `transform: scale(1.02)`
- Active: `transform: scale(0.98)`
- Secondary actions — clearly related to primary without competing

**Ghost (Text)**
- Background: transparent
- Text: Gray 500 (`#868E96`)
- Padding: 8px 16px
- Radius: 8px
- Hover: Off White (`#F8F9FA`) background
- Tertiary actions, nav links, less important controls

### Cards
- Background: White (`#FFFFFF`)
- Radius: 16px
- Shadow (rest): `0 2px 12px rgba(0,0,0,0.08)`
- Shadow (hover): `0 8px 24px rgba(27,217,123,0.15)` — green-tinted elevation
- Hover transform: `translateY(-4px)`
- Padding: 24px
- Transition: `all 0.2s ease`
- Border: none (shadow defines boundary)

### Input Fields
- Background: Gray 100 (`#F1F3F5`)
- Border: 1.5px solid transparent
- Focus border: LIFEPLUS Green (`#1BD97B`)
- Radius: 8px
- Padding: 12px 16px
- Font: Noto Sans KR, 16px
- Placeholder: Gray 500 (`#868E96`)

### Navigation
- Position: sticky top
- Background: White (`#FFFFFF`)
- Border-bottom: 1px solid Gray 100 (`#F1F3F5`)
- On scroll: `box-shadow: 0 2px 8px rgba(0,0,0,0.06)`
- Height: 64px
- Logo: LIFEPLUS Green icon + LIFEPLUS Bold text

### Tags / Badges
- Background: Light Green (`#E6FBF1`)
- Text: Deep Green (`#00B85E`)
- Radius: 6px
- Padding: 4px 10px
- Font: LIFEPLUS Medium (500), 12px
- Caution variant: `#FFF4E6` bg, `#FFA94D` text
- Negative variant: `#FFF0F0` bg, `#FF6B6B` text

## 5. Spacing & Layout

### Spacing Scale
| Token | Value | Usage |
|-------|-------|-------|
| --space-xs | 4px | Inline gaps, icon padding |
| --space-sm | 8px | Tight element gaps |
| --space-md | 16px | Standard element spacing |
| --space-lg | 24px | Card padding, section inner gaps |
| --space-xl | 32px | Between card groups |
| --space-2xl | 48px | Section padding (mobile) |
| --space-3xl | 80px | Section padding (desktop) |

### Layout
- Max-width: 1200px, centered
- Page padding: 24px (mobile) / 48px (tablet) / 80px (desktop)
- Grid: 12-column, 24px gap
- Card grid: 3-col (desktop) → 2-col (tablet) → 1-col (mobile)

## 6. Borders & Dividers

- **Card borders**: None (shadow-defined boundaries)
- **Section dividers**: 1px solid Gray 100 (`#F1F3F5`)
- **Input borders**: 1.5px solid transparent → LIFEPLUS Green on focus
- **Nav border**: 1px solid Gray 100 (`#F1F3F5`)
- **Button borders**: Primary = none, Secondary = 1.5px solid LIFEPLUS Green
- **Standard radius**: 8px (buttons, inputs) / 16px (cards, modals) / 24px (hero containers)

## 7. Shadows & Elevation

| Level | Shadow | Usage |
|-------|--------|-------|
| Level 0 | none | Flat elements, text |
| Level 1 | `0 2px 12px rgba(0,0,0,0.08)` | Cards at rest, dropdowns |
| Level 2 | `0 8px 24px rgba(27,217,123,0.15)` | Cards on hover (green-tinted) |
| Level 3 | `0 4px 16px rgba(27,217,123,0.3)` | Primary button hover |
| Level 4 | `0 16px 48px rgba(0,0,0,0.12)` | Modals, overlays |
| Nav scroll | `0 2px 8px rgba(0,0,0,0.06)` | Sticky nav on scroll |

## 8. Iconography & Imagery

- **Icon style**: Outlined, 1.5px stroke, rounded caps — clean and friendly
- **Icon size**: 20px (inline), 24px (nav/UI), 32px (feature), 48px (hero feature)
- **Icon color**: Inherits text color; LIFEPLUS Green for active/accent states
- **Illustration style**: Flat vector with green accent, minimal detail, lifestyle-focused
- **Photography**: Warm, natural lighting, lifestyle moments (not corporate portraits)
- **Data visualization**: LIFEPLUS Green for primary series, Gray 500 for secondary, Caution/Negative for alerts

## 9. Accessibility

- **Contrast ratios**: Dark (`#1A1A2E`) on White = 16.5:1 (AAA). LIFEPLUS Green (`#1BD97B`) on White = 2.3:1 (decorative only, not for text). Deep Green (`#00B85E`) on White = 3.2:1 (large text OK). Green on Dark = 8.5:1 (AAA).
- **Focus indicators**: 2px solid LIFEPLUS Green (`#1BD97B`) outline with 2px offset
- **Touch targets**: Minimum 44x44px
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` — disable translateY hover, fade-in animations
- **Font sizing**: rem-based, minimum 13px
- **Color-blind safe**: Green + amber + coral triad. Never use green alone for semantic meaning — always pair with icon or text label.
