# glide — 초경량 슬라이더 (심플한 카드뉴스에 적합)

> **분류**: 기술 라이브러리 (시각 스타일 X). Swiper의 **경량 대안**.
> Swiper가 풍부한 기능이면, Glide는 **미니멀 + 빠른 로딩**.

## 핵심 특징
- **초경량**: ~23KB (gzip 시 **7KB**) ← Swiper의 1/4
- **의존성 없음**: 순수 ES6 JavaScript
- **모듈식 구조**: 불필요한 기능 제거 가능
- **확장성**: 플러그인으로 커스텀 기능 추가
- **번들러 친화**: Webpack, Rollup 호환

## 설치
```bash
npm install @glidejs/glide
```

```html
<!-- CSS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@glidejs/glide/dist/css/glide.core.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@glidejs/glide/dist/css/glide.theme.min.css">

<!-- JS -->
<script src="https://cdn.jsdelivr.net/npm/@glidejs/glide"></script>
```

## 기본 HTML 구조
```html
<div class="glide">
  <div data-glide-el="track" class="glide__track">
    <ul class="glide__slides">
      <li class="glide__slide">슬라이드 1</li>
      <li class="glide__slide">슬라이드 2</li>
      <li class="glide__slide">슬라이드 3</li>
    </ul>
  </div>
</div>
```

## 초기화
```javascript
new Glide('.glide', {
  type: 'carousel',          // 'slider' | 'carousel' | 'slideshow'
  startAt: 0,
  perView: 1,
  gap: 0,
  autoplay: 4000,
  hoverpause: true,
  keyboard: true
}).mount()
```

## Swiper vs Glide — 비교
| 항목 | Glide.js | Swiper.js |
|---|---|---|
| **파일 크기** | 7KB (gzip) | 30KB+ |
| **학습곡선** | 매우 낮음 | 중간 |
| **기능 범위** | 기본 슬라이더 | 매우 풍부 (effect 5종+) |
| **터치 반응** | 충분함 | 최상 |
| **커스터마이징** | 모듈 선택식 | 설정 기반 |
| **Effect 종류** | slide (기본 전환) | fade/cube/coverflow 등 다양 |
| **공식 문서 접근성** | 매우 친절 | 방대함 |

## 카드뉴스 적용 시 고려
1. **모바일 로딩 속도 우수** — 7KB라 저사양 기기·저속 회선에 유리
2. **반응형 `breakpoints` 모듈** 로 다양한 화면 크기 대응
3. **심플한 페이드/슬라이드만 필요하면 충분**
4. **cube·coverflow 같은 화려한 effect 필요 없으면** Glide가 더 가벼움

## 언제 Glide를 선택할까
- **카드뉴스 내용이 심플·미니멀** (텍스트 위주, 이미지 적음)
- **모바일 최우선** — 느린 네트워크 환경
- **effect는 slide/fade 만** 쓸 계획
- **번들 크기 민감한** 페이지에 임베드

## 언제 Swiper가 나은가
- cube, coverflow, flip 같은 **풍부한 effect** 필요
- **복잡한 인터랙션** (multiple swipers, sync, thumbs gallery 등)
- 커뮤니티 예시가 **더 많아** 레퍼런스 검색 쉬움

## 우리 공장에서의 포지션
- **기본값은 Swiper**. Glide는 **경량 대안**.
- 아트디렉터가 "이번 편은 극단 미니멀 + 빠른 로딩 우선" 판단 시 제안
- 예: "② 신제품 발표장 화이트 × Glide.js — 최소 효과, 빠른 모바일 로딩, 순수 메시지 승부"

## 기본 카드뉴스 예시 (Glide 버전)
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@glidejs/glide/dist/css/glide.core.min.css">
  <style>
    body,html{margin:0;padding:0}
    .glide{width:100vw;height:100vh}
    .glide__slide{display:flex;justify-content:center;align-items:center;font-size:32px}
  </style>
</head>
<body>
  <div class="glide">
    <div data-glide-el="track" class="glide__track">
      <ul class="glide__slides">
        <li class="glide__slide">표지</li>
        <li class="glide__slide">본문 1</li>
        <li class="glide__slide">본문 2</li>
      </ul>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/@glidejs/glide"></script>
  <script>
    new Glide('.glide', { type: 'carousel', perView: 1, keyboard: true }).mount()
  </script>
</body>
</html>
```

## 참고
- 공식 GitHub: [github.com/glidejs/glide](https://github.com/glidejs/glide)
- 공식 문서: [glidejs.com/docs](https://glidejs.com/docs)
