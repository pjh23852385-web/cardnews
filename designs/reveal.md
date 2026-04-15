# reveal — 프레젠테이션 프레임워크 (발표형 카드뉴스에 적합)

> **분류**: 기술 라이브러리 (시각 스타일 X). Swiper가 일반 슬라이더면, reveal.js는 **프레젠테이션 특화**.
> **대안 슬라이더** 역할. 발표 톤 강한 카드뉴스면 고려.

## 핵심 특징
- **프레젠테이션 프레임워크**: 웹브라우저에서 PPT 대체
- **중첩 슬라이드**: 세로 방향으로 깊이 있는 구성 가능 (주제 안의 하위 슬라이드)
- **마크다운 지원**: HTML 몰라도 `.md` 로 슬라이드 작성 가능
- **자동 애니메이션 (Auto-Animate)**: 요소 간 부드러운 전환
- **Fragments**: 한 슬라이드 내에서 단계별로 요소 나타내기
- **Speaker Notes**: 발표자 전용 메모 (프레젠테이션 모드)
- **PDF 내보내기**: 슬라이드 덱을 PDF로
- **LaTeX 수식**: 복잡한 수학 표기
- **코드 하이라이팅**: 개발자 콘텐츠 친화

## 설치 (CDN)
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@latest/dist/reveal.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@latest/dist/theme/black.css">
<script src="https://cdn.jsdelivr.net/npm/reveal.js@latest/dist/reveal.js"></script>
```

## 기본 HTML
```html
<div class="reveal">
  <div class="slides">
    <section>슬라이드 1</section>
    <section>슬라이드 2
      <section>중첩 슬라이드 (세로 방향)</section>
    </section>
  </div>
</div>
<script>
  Reveal.initialize({
    hash: true,              // URL에 슬라이드 번호 저장
    transition: 'slide',     // 'none' | 'fade' | 'slide' | 'convex' | 'concave' | 'zoom'
    controls: true,
    progress: true,
    keyboard: true
  });
</script>
```

## Swiper vs reveal — 비교 (카드뉴스 관점)
| 항목 | reveal.js | Swiper.js |
|---|---|---|
| **주 용도** | 프레젠테이션 | 일반 슬라이더 |
| **발표 기능** | ✅ 풍부 (Notes, Fragments, Auto-Animate) | ❌ 없음 |
| **중첩 슬라이드** | ✅ (주제 > 하위 주제) | ❌ |
| **마크다운 슬라이드** | ✅ 지원 | ❌ |
| **터치 반응성** | 🟡 보통 | ✅ 최상 |
| **카드뉴스 적합성** | 발표 톤일 때 ⭐ | 일반 카드뉴스 ⭐ |
| **파일 크기** | ~60KB | ~30KB |
| **학습곡선** | 초보 친화 | 초보 친화 |
| **커스터마이징** | 테마 기반 | 설정 기반 |

## 카드뉴스에서 reveal가 빛나는 순간
1. **발표용 카드뉴스** — 회의/세미나에서 슬라이드 덱처럼 쓸 때
2. **중첩 구조 필요** — "대 주제 → 하위 3개 포인트" 계층 표현
3. **Fragments로 단계 공개** — 한 장에서 차례로 요소 등장 (시선 유도)
4. **Speaker Notes** — 발표자가 PC 옆에 스크립트 보면서 발표
5. **PDF 공유** — 카드뉴스를 PDF로도 배포하고 싶을 때

## 카드뉴스에 적용 시 주의
- **모바일 터치 반응성은 Swiper보다 떨어짐** (프레젠테이션 목적이라 원래 PC/빔프로젝터 기준 설계)
- **주로 가로 방향 덱** (세로 덱도 가능하지만 Swiper만큼 자연스럽진 않음)
- **발표 요소 쓰지 않을 거면 Swiper가 더 가볍고 깔끔**

## 우리 공장에서의 포지션
- **기본값은 Swiper**. reveal는 **특수 용도 옵션**.
- 카드뉴스 톤이 "격식 있는 발표" 일 때 아트디렉터가 3옵션 중 하나로 제안 가능
- 예: "③ 격식 발표 덱 × reveal.js Auto-Animate — 경영진 워크숍용"

## 참고
- 공식 GitHub: [github.com/hakimel/reveal.js](https://github.com/hakimel/reveal.js)
- 공식 문서: [revealjs.com](https://revealjs.com)
- 시각 편집기: [slides.com](https://slides.com) (reveal.js 기반)
