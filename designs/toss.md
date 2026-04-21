# toss — 토스(Toss) 앱 톤

> 어울리는 오디언스: 일반 고객, MZ세대, 핀테크/서비스 기획자, UX 관심 경영진
> 어울리는 주제: 금융, 서비스 소개, 제품 출시, 사용자 가이드, 브랜드 스토리
> **시그니처**: "느끼되 의식하지 않는" 은은한 모션 + 과감한 여백 + 선명한 타이포

## 영감 출처
- **원본 브랜드**: Toss (비바리퍼블리카) — TDS(Toss Design System)
- **참고**: toss.im, toss.feed, Phi Institute of Design 웹사이트

## 핵심 색감
- **배경**: `#ffffff` (순백) 또는 `#f9fafb` (아주 옅은 그레이)
- **주 텍스트**: `#191f28` (딥 그레이, 순검정 X)
- **보조 텍스트**: `#4e5968` (중간 그레이)
- **약한 텍스트**: `#8b95a1` (옅은 그레이)
- **액센트 (토스 블루)**: `#3182f6` (시그니처 파랑)
- **액센트 호버**: `#1b64da`
- **긍정/성공**: `#00c471`
- **경고/주의**: `#ff6b6b`
- **구분선**: `#e5e8eb`
- **카드 배경**: `#ffffff` + `box-shadow: 0 1px 4px rgba(0,0,0,0.04)`

## 폰트
- **전 영역**: `Pretendard Variable` (한글·영문 모두)
- **헤드라인**: weight 700, letter-spacing -0.02em (살짝 조여주기)
- **본문**: weight 400-500, line-height 1.6
- **숫자**: weight 700, `font-variant-numeric: tabular-nums` (폭 고정)
- **크기**: 헤드라인 28-36px / 부제 18-20px / 본문 15-16px / 캡션 13px

## 인터랙션 느낌 — 토스 모션 DNA (⭐ 핵심)

### 공통 규칙
```css
:root {
  --toss-ease: cubic-bezier(0.22, 1, 0.36, 1); /* ease-out-quart */
  --toss-duration: 400ms;
  --toss-duration-slow: 600ms;
  --toss-duration-fast: 200ms;
}
```

| 원칙 | 값 |
|---|---|
| 이징 | `cubic-bezier(0.22, 1, 0.36, 1)` 고정 |
| 지속시간 | 기본 400ms, 강조 600ms, 눌림 200ms |
| 스태거 | 요소마다 60~80ms 순차 지연 |
| 3축 동시 | `opacity` + `translateY(24px)` + `scale(0.96)` |
| 이동거리 | 20~40px 이내 (과하지 않게) |
| 오버슈트 | 끝에서 살짝 `scale(1.02)` 후 1.0 정착 |

### 금지 사항
- `linear` 이징 금지
- 30px 이상 큰 움직임 금지
- `bounce` / `elastic` 같은 과장된 스프링 금지
- 애니메이션 1초 초과 금지

### 시그니처 모션 5종

**① 진입 리빌 (Reveal)**
요소가 뷰포트에 들어올 때 페이드 + 살짝 올라옴 + 스케일 업
```css
.toss-reveal {
  opacity: 0;
  transform: translateY(24px) scale(0.96);
  transition: opacity 400ms var(--toss-ease),
              transform 400ms var(--toss-ease);
}
.toss-reveal.is-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}
```
IntersectionObserver로 `is-visible` 클래스 부여, 자식마다 `transition-delay: calc(60ms * var(--i))`.

**② 숫자 카운트업 (Count-up)** — 토스 시그니처
```js
// easeOutExpo, 1200ms, tabular-nums
const ease = t => 1 - Math.pow(2, -10 * t);
```
뷰포트 진입 시 1회만, 천단위 콤마 자동.

**③ 버튼 눌림 감각 (Tactile)**
```css
.toss-btn { transition: transform 300ms var(--toss-ease); }
.toss-btn:active { transform: scale(0.96); transition-duration: 100ms; }
```
`-webkit-tap-highlight-color: transparent` 필수.

**④ 프로그레스 바 채우기**
`width` 대신 `transform: scaleX` + `transform-origin: left`, 800ms.

**⑤ 슬라이드 전환 (Swiper 연계)**
나가는 슬라이드: `opacity 1→0 + scale 1→0.95` (300ms)
들어오는 슬라이드: `opacity 0→1 + scale 1.05→1` (400ms, 50ms 지연)

## 레이아웃 / 여백
- **여백 크게**: 섹션 간 80-120px, 요소 간 24-32px
- **카드 radius**: `16px` (과하지 않은 둥글기)
- **컨테이너 max-width**: `1080px`, 좌우 패딩 `20px` (모바일) / `40px` (데스크탑)
- **수직 정렬**: 텍스트 블록은 왼쪽 정렬이 기본. 중앙 정렬은 히어로/CTA만.

## 무드 키워드
clean / calm / trustworthy / tactile / premium / confident

## 이 스타일에 어울리는 이미지
- 순백 배경 + 제품 목업 (단독 샷)
- 심플한 일러스트 (3~4색, 선 굵기 통일)
- 한 가지 포인트 컬러 + 중성 그레이 배경
- 인물 사진도 가능 (단, 고해상도 + 따뜻한 톤)

## 이 스타일에 어울리지 않는 것
- 검정 배경 / 네온 글로우
- 화려한 그라디언트 (있어도 아주 은은하게)
- 과장된 애니메이션 (bounce, rotate 360 등)
- 여러 폰트 혼용 (Pretendard 단일 원칙)

## AI 에이전트 프롬프트 힌트 (아트디렉터용)
토스 스타일 구현 시 프롬프트 끝에 반드시 포함:
> *"모든 움직임은 cubic-bezier(0.22, 1, 0.36, 1) 이징, 400ms 기본. 요소 진입은 opacity + translateY(24px) + scale(0.96) 3축 동시. 요소마다 60ms 스태거. 토스 공식 TDS motion 가이드 기준 — 사용자가 '느끼되 의식하지 않는' 수준."*
