# 3D 및 고급 애니메이션 레퍼런스

> 카드뉴스 HTML에서 활용 가능한 3D·애니메이션 기법.
> 모두 CDN 로드 + 단일 HTML 파일 안에서 자체완결.

---

## 1. Three.js 배경 패턴

> CDN: `https://cdn.jsdelivr.net/npm/three@latest/build/three.min.js`
> 참고: https://threejs.org/examples/

### 1-1. 파티클 필드 (가장 많이 쓰임)
```
- 수백 개의 작은 점이 천천히 떠다님
- 마우스 움직임에 반응 (optional)
- 배경 canvas 뒤에 슬라이드 콘텐츠 위에
- 색감: 단색 파티클 (에메랄드 #00ff7f, 골드 #d4af37 등) + 다크 배경
- 레퍼런스: threejs.org/examples/#webgl_points_waves
```

### 1-2. 와이어프레임 기하 (미래·테크 느낌)
```
- 3D 다면체(icosahedron, torus)가 천천히 회전
- 와이어프레임 렌더링 (면 없이 선만)
- 색감: 반투명 선 + 다크 배경
- 레퍼런스: threejs.org/examples/#webgl_geometry_shapes
```

### 1-3. 그라디언트 쉐이더 (유기적·고급)
```
- fragment shader 로 부드럽게 흐르는 그라디언트
- 시간 기반 색상 전환 (uniform float time)
- 레퍼런스: threejs.org/examples/#webgl_shader
```

### 1-4. 플로팅 메시 (데이터 시각화 느낌)
```
- 네트워크 그래프 — 점들이 선으로 연결
- 가까운 점끼리 자동 연결선
- 레퍼런스: threejs.org/examples/#webgl_points_billboards
```

### Swiper + Three.js 통합 방법
```html
<body>
  <!-- Three.js 배경 레이어 -->
  <canvas id="bg3d" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;"></canvas>

  <!-- Swiper 콘텐츠 레이어 (위에 겹침) -->
  <div class="swiper" style="position:relative;z-index:1;">
    ...슬라이드...
  </div>

  <script src="https://cdn.jsdelivr.net/npm/three@latest/build/three.min.js"></script>
  <script>
    // Three.js scene → canvas#bg3d
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('bg3d'), alpha: true });
    renderer.setSize(innerWidth, innerHeight);
    // ...geometry + material + animate loop
  </script>
</body>
```

### 슬라이드 전환 시 3D 장면 반응
```js
swiper.on('slideChange', () => {
  const idx = swiper.activeIndex;
  // 카메라 각도 변경
  gsap.to(camera.position, { x: idx * 2, duration: 0.8 });
  // 또는 파티클 색상 전환
  particles.material.color.setHex(slideColors[idx]);
});
```

---

## 2. CSS 3D Transform (Three.js 없이)

### 2-1. 3D 카드 틸트 (호버)
```css
.card {
  transition: transform 0.4s;
  transform-style: preserve-3d;
}
.card:hover {
  transform: perspective(800px) rotateX(5deg) rotateY(-10deg) translateZ(20px);
  box-shadow: 10px 20px 40px rgba(0,0,0,0.3);
}
```

### 2-2. 3D 카드 플립 (클릭)
```css
.flip-container { perspective: 1000px; }
.flip-card { transition: transform 0.6s; transform-style: preserve-3d; }
.flip-card.flipped { transform: rotateY(180deg); }
.flip-front, .flip-back { backface-visibility: hidden; position: absolute; }
.flip-back { transform: rotateY(180deg); }
```

### 2-3. Swiper 큐브 효과
```js
const swiper = new Swiper('.swiper', {
  effect: 'cube',
  cubeEffect: {
    shadow: true,
    slideShadows: true,
    shadowOffset: 20,
    shadowScale: 0.94,
  },
});
```

### 2-4. Swiper 카드 효과 (카드 스택)
```js
const swiper = new Swiper('.swiper', {
  effect: 'cards',
  cardsEffect: { slideShadows: true },
});
```

---

## 3. Glassmorphism (유리 효과)

```css
.glass-card {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}
```

Three.js 배경 + Glassmorphism 카드 = 미래·테크 프리미엄 느낌

---

## 4. GSAP ScrollTrigger

> CDN: `https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js`
> CDN: `https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js`

```js
gsap.registerPlugin(ScrollTrigger);

// 숫자 카운터업 (스크롤 기반)
gsap.from('.stat-number', {
  textContent: 0,
  duration: 2,
  snap: { textContent: 1 },
  scrollTrigger: { trigger: '.stat-section', start: 'top 80%' },
});

// 카드 순차 등장
gsap.from('.card', {
  y: 60, opacity: 0, stagger: 0.15, duration: 0.8,
  scrollTrigger: { trigger: '.card-grid', start: 'top 70%' },
});
```

---

## 5. SVG Line Draw

```css
.svg-path {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: draw 2s ease forwards;
}
@keyframes draw {
  to { stroke-dashoffset: 0; }
}
```

차트·아이콘·그래프가 그려지는 효과 → 데이터 슬라이드에 적합

---

## 6. Lottie 벡터 애니메이션

> CDN: `https://cdn.jsdelivr.net/npm/lottie-web@5/build/player/lottie.min.js`
> 무료 에셋: https://lottiefiles.com

```js
lottie.loadAnimation({
  container: document.getElementById('lottie-icon'),
  renderer: 'svg',
  loop: true,
  path: 'https://assets.lottiefiles.com/xxx.json', // LottieFiles URL
});
```

아이콘·일러스트가 매끄럽게 움직임 → CTA·표지에 효과적

---

## 조합 예시 (카드뉴스 옵션 제안용)

| 이름 | 배경 | 카드 | 인터랙션 |
|---|---|---|---|
| **"딥 스페이스 파티클"** | Three.js 파티클 필드 (다크 + 에메랄드) | Glassmorphism 반투명 | 숫자 카운터업 + 파티클 밀도 변화 |
| **"스위스 디자인 모션"** | 순백 배경 + 빨강 악센트 | 그리드 시스템 + Helvetica | SVG line-draw 차트 + GSAP 순차 등장 |
| **"네온 사이버펑크"** | Three.js 와이어프레임 기하 (다크 퍼플) | 네온 보더 + glow | 3D 카드 틸트 호버 + 텍스트 타이핑 |
| **"갤러리 큐브"** | 무인양품 베이지 | Swiper cube effect | 큐브 전환 + 세리프 타이포 reveal |
| **"블룸버그 터미널"** | 검정 + 형광 초록 그리드 | 모노스페이스 + 깜빡이는 커서 | 카운터업 + 터미널 타이핑 |
