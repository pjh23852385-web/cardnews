# swiper — 슬라이더 라이브러리 (기본값, 카드뉴스 1순위 추천)

> **분류**: 기술 라이브러리 (시각 스타일 X). 아트디렉터가 HTML 구현할 때 쓰는 도구.
> **21st.dev 커뮤니티에서 압도적 1위**의 슬라이더 라이브러리.

## 핵심 특징
- **Tree-shakeable**: 필요한 모듈만 번들에 포함 → 번들 경량
- **라이브러리 무관**: jQuery 등 외부 의존성 없음
- **1:1 터치 반응**: 자연스러운 모바일 인터랙션
- **Mutation Observer**: DOM 변경 시 자동 재초기화
- **RTL 완벽 지원**: 우→좌 언어(아랍어 등) 대응

## 설치 (CDN, 카드뉴스에 추천)
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@latest/swiper-bundle.min.css">
<script src="https://cdn.jsdelivr.net/npm/swiper@latest/swiper-bundle.min.js"></script>
```
→ npm 설치도 가능하지만 카드뉴스 같은 단일 페이지엔 CDN이 간단.

## 기본 HTML 구조
```html
<div class="swiper">
  <div class="swiper-wrapper">
    <div class="swiper-slide">슬라이드 1</div>
    <div class="swiper-slide">슬라이드 2</div>
    <div class="swiper-slide">슬라이드 3</div>
  </div>
  <div class="swiper-pagination"></div>
  <button class="swiper-button-prev"></button>
  <button class="swiper-button-next"></button>
</div>
```

## 카드뉴스 전용 추천 설정 (세로 덱)
```javascript
new Swiper('.swiper', {
  direction: 'vertical',              // 세로 슬라이드
  slidesPerView: 1,
  spaceBetween: 0,
  effect: 'fade',                     // 부드러운 페이드 전환
  fadeEffect: { crossFade: true },
  autoplay: {
    delay: 4000,
    disableOnInteraction: false
  },
  pagination: {
    el: '.swiper-pagination',
    type: 'bullets',
    clickable: true
  },
  keyboard: { enabled: true, onlyInViewport: true },
  mousewheel: { invert: false },
  touchRatio: 1,
  grabCursor: true
});
```

## Effect 종류 (카드뉴스용 선택)
| Effect | 용도 | 톤 |
|---|---|---|
| **fade** ⭐ | 카드뉴스 기본. 깔끔한 페이드 | voltagent / wired / stripe 다 OK |
| **slide** | 일반 좌우 전환 | 가로 레이아웃 |
| **cube** | 3D 큐브 회전 | 프리미엄 / 포트폴리오 |
| **coverflow** | 앨범처럼 원근감 | 상품 전시, 갤러리 |
| **flip** | 카드 뒤집기 | 장식 강조 |

## 카드뉴스 적용 포인트
1. **`effect: 'fade'` 가 기본값.** cube는 voltagent 같은 톤엔 과함
2. **`direction: 'vertical'`** 세로 덱 (모바일 친화)
3. **`keyboard: true`** PC에서 화살표키로 넘기기
4. **`mousewheel: true`** PC 휠로 넘기기
5. **`pagination.clickable: true`** 좌측/우측 점 클릭으로 점프
6. **autoplay는 선택** — 카드뉴스는 독자 페이스로 읽게 OFF 추천

## 장점 / 단점
- ✅ 터치/키보드/휠 다 완벽. 모바일 반응형 내장
- ✅ 커뮤니티 1위 → 레퍼런스·예시 풍부
- ✅ 풍부한 effect 선택지
- ⚠️ 파일 크기 ~30KB (Glide 대비 4배). 단 CDN 캐싱으로 큰 이슈 없음

## 우리 카드뉴스 공장 기본값
> **우리 시스템의 기본 슬라이더는 Swiper.**
> 특별한 이유 없으면 아트디렉터는 Swiper로 구현.

## 완전한 HTML 예시
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@latest/swiper-bundle.min.css">
  <style>
    body, html { margin:0; padding:0; }
    .swiper { width: 100vw; height: 100vh; }
    .swiper-slide {
      display: flex; justify-content: center; align-items: center;
      font-size: 32px;
      background: #000; color: #00ff7f;  /* voltagent 톤 예시 */
    }
  </style>
</head>
<body>
  <div class="swiper">
    <div class="swiper-wrapper">
      <div class="swiper-slide">표지 슬라이드</div>
      <div class="swiper-slide">본문 슬라이드</div>
    </div>
    <div class="swiper-pagination"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/swiper@latest/swiper-bundle.min.js"></script>
  <script>
    new Swiper('.swiper', {
      direction: 'vertical', effect: 'fade',
      pagination: { el: '.swiper-pagination', clickable: true },
      keyboard: { enabled: true }, mousewheel: true
    });
  </script>
</body>
</html>
```

## 참고
- 공식 GitHub: [github.com/nolimits4web/swiper](https://github.com/nolimits4web/swiper)
- 공식 문서: [swiperjs.com](https://swiperjs.com)
