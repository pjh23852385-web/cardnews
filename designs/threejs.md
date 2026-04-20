# Three.js 카드뉴스 활용 레퍼런스

> Three.js examples (https://threejs.org/examples/) 중 **카드뉴스 단일 HTML** 에서 활용 가능한 효과들.
> CDN: `https://cdn.jsdelivr.net/npm/three@latest/build/three.min.js`
> 모두 **file:// 에서도 작동** (외부 모델 파일 필요한 것은 별도 표시).

---

## A. 배경 효과 (Background)

Swiper 슬라이드 뒤에 `<canvas>` 로 깔아서 분위기 연출. 콘텐츠는 CSS z-index 로 위에 겹침.

### A-1. 파티클 (Particles)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_points_waves` | 파티클이 파도처럼 물결침 | 커버 배경 — 데이터 흐름·혁신 주제에 적합 |
| `webgl_points_sprites` | 작은 이미지 스프라이트가 떠다님 | 아이콘·로고가 배경에 떠다니는 효과 |
| `webgl_buffergeometry_points` | 수천 개 점이 3D 공간에 분포 | 빅데이터·AI 주제의 우주적 배경 |
| `webgl_buffergeometry_points_interleaved` | 색상별 점 구름 | 카테고리별 데이터 시각화 배경 |
| `webgl_custom_attributes_points` | 파티클 크기·색상이 동적 변화 | 슬라이드 전환마다 파티클 변형 |
| `webgl_points_billboards` | 카메라 방향 항상 바라보는 파티클 | 별·반짝이 효과 — 금융·테크 주제 |

**구현 핵심**:
```js
// 기본 파티클 시스템
const geometry = new THREE.BufferGeometry();
const vertices = new Float32Array(count * 3);
for (let i = 0; i < count * 3; i++) vertices[i] = (Math.random() - 0.5) * 10;
geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
const material = new THREE.PointsMaterial({ size: 0.02, color: 0x00ff7f });
const points = new THREE.Points(geometry, material);
scene.add(points);
```

### A-2. 웨이브 / 플로우 (Waves & Flow)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_points_waves` | 그리드 포인트가 사인파로 출렁임 | 시장 트렌드·변화 주제 배경 |
| `webgl_geometry_terrain` | 지형 생성 (노이즈 기반) | 산맥 같은 데이터 landscape |
| `webgl_water` | 물 표면 반사·굴절 | 고급 비주얼 (성능 주의) |
| `webgl_gpgpu_water` | GPU 기반 물결 시뮬레이션 | 터치하면 물결 퍼지는 효과 |
| `webgl_modifier_simplifier` | 메시 변형 | 데이터 변환·전환 메타포 |

**구현 핵심**:
```js
// 사인파 웨이브
function animate() {
  const positions = geometry.attributes.position.array;
  const time = Date.now() * 0.001;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] = Math.sin(positions[i] * 2 + time) * 0.3;
  }
  geometry.attributes.position.needsUpdate = true;
  requestAnimationFrame(animate);
}
```

### A-3. 기하학 배경 (Geometric Background)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_geometry_shapes` | 다양한 2D/3D 도형 | 추상적 배경 패턴 |
| `webgl_buffergeometry` | 커스텀 기하 (삼각형 메시) | 다이나믹 패턴 배경 |
| `webgl_instancing_performance` | 수천 개 동일 오브젝트 인스턴싱 | 반복 패턴 (주가·데이터 포인트) |
| `webgl_geometry_convex` | 볼록 다면체 | 크리스탈·보석 느낌 |
| `webgl_geometry_dynamic` | 실시간 변형 기하 | 호흡하듯 움직이는 배경 |

### A-4. 쉐이더 배경 (Shader / Gradient)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_shader` | 커스텀 fragment shader | 유기적 그라디언트 흐름 |
| `webgl_shader2` | 시간 기반 색상 전환 | 슬라이드마다 톤 변화 |
| `webgl_shaders_ocean` | 바다 쉐이더 | 깊이감 있는 움직이는 배경 |
| `webgl_shaders_sky` | 하늘 + 태양 | 시간대별 분위기 (새벽→저녁) |
| `webgl_postprocessing_unreal_bloom` | 블룸(발광) 후처리 | 네온·사이버펑크 글로우 |
| `webgl_postprocessing_afterimage` | 잔상 효과 | 움직임 강조 — 속도감 |

**구현 핵심 (커스텀 쉐이더)**:
```js
const material = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, color1: { value: new THREE.Color(0x0a0a0a) }, color2: { value: new THREE.Color(0x00ff7f) } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float time; uniform vec3 color1; uniform vec3 color2; varying vec2 vUv;
    void main() { float t = sin(vUv.x * 3.0 + time) * 0.5 + 0.5; gl_FragColor = vec4(mix(color1, color2, t), 1.0); }`,
});
```

### A-5. 네트워크 / 연결선 (Network)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_buffergeometry_drawrange` | 점 + 연결선 동적 생성 | 네트워크 그래프 — AI 에이전트 연결 시각화 |
| `webgl_lines_fat` | 두꺼운 라인 렌더링 | 데이터 흐름 경로 표현 |
| `webgl_lines_dashed` | 점선 | 예상 경로·계획 시각화 |
| `css3d_molecules` | 분자 구조 (공+막대) | 조직·시스템 구조 시각화 |

---

## B. 오브젝트 효과 (Objects)

슬라이드 안에 배치하는 3D 오브젝트. 자동 회전 or 마우스 인터랙티브.

### B-1. 3D 텍스트 (Text)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_geometry_text` | 3D 돌출 텍스트 | 헤드라인이 입체로 — 커버 임팩트 |
| `webgl_geometry_text_shapes` | 텍스트 윤곽선 3D | 와이어프레임 헤드라인 |
| `webgl_geometry_text_stroke` | 텍스트 스트로크 3D | 네온 사인 효과 |
| `css3d_periodictable` | CSS 3D 로 주기율표 배치 | 데이터 카드를 3D 공간에 배치 |

**주의**: Three.js TextGeometry 는 **폰트 JSON 파일** 필요 → CDN 에서 로드 가능:
```
https://cdn.jsdelivr.net/npm/three@latest/examples/fonts/helvetiker_regular.typeface.json
```

### B-2. 기하 오브젝트 (Geometry)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_geometry_cube` | 회전하는 큐브 | 기본 3D 데코 |
| `webgl_geometries` | 다양한 기하 (구·원뿔·도넛) | 챕터 디바이더 배경 오브젝트 |
| `webgl_geometry_teapot` | 유타 찻주전자 (3D 클래식) | 부활절 달걀·위트 |
| `webgl_materials_variations_standard` | PBR 재질 오브젝트들 | 메탈·유리·나무 등 현실감 |
| `webgl_materials_normalmap` | 노말맵 적용 구체 | 행성·지구본 느낌 |
| `webgl_geometry_spline_editor` | 곡선 경로 | 데이터 흐름·타임라인 |

### B-3. 크리스탈 / 반사 (Crystal & Reflection)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_materials_cubemap` | 환경 반사 (큐브맵) | 크리스탈·보석·메탈 구체 |
| `webgl_materials_envmaps` | 환경맵 다양한 재질 | 프리미엄·럭셔리 느낌 |
| `webgl_refraction` | 굴절 효과 | 유리·다이아몬드 |
| `webgl_tonemapping` | HDR 톤매핑 | 사진 같은 리얼리즘 |
| `webgl_materials_physical_clearcoat` | 클리어코트 (차 도장 같은) | 광택 표면 — 테크 프리미엄 |

### B-4. 데이터 시각화 (Data Viz)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `css3d_periodictable` | 주기율표 3D 배치 | 데이터 테이블 → 3D 카드 배열 |
| `webgl_buffergeometry_instancing` | 인스턴스 막대 | 3D 바 차트 |
| `webgl_geometry_minecraft` | 복셀 블록 | 간단한 3D 인포그래픽 |
| `webgl_interactive_cubes` | 클릭 가능한 큐브 그리드 | 인터랙티브 데이터 탐색 |
| `misc_controls_orbit` | OrbitControls (회전·줌) | 어떤 3D 오브젝트든 사용자가 돌려봄 |
| `webgl_interactive_raycasting_points` | 마우스 호버로 포인트 선택 | 데이터 포인트 탐색 |

### B-5. 지구본 / 글로브 (Globe)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_geometry_shapes` + sphere | 구체 + 점 | 글로벌 시장 시각화 |
| `css3d_sprites` | CSS 레이블 + 3D 위치 | 지구본 위 도시·데이터 포인트 |
| `webgl_materials_normalmap` | 텍스처 구체 | 지구 텍스처 입혀서 글로브 |

---

## C. 전환 효과 (Transitions)

슬라이드 전환 시 또는 슬라이드 내에서 발생하는 동적 효과.

### C-1. 카메라 이동 (Camera Movement)

| 기법 | 효과 | 카드뉴스 적용 |
|---|---|---|
| `camera.position.lerp(target, 0.05)` | 부드러운 카메라 이동 | 슬라이드마다 시점 변화 — 공간 탐험 느낌 |
| `camera.lookAt(target)` | 특정 오브젝트 포커스 | 챕터 전환 시 3D 씬의 다른 부분 조명 |
| `camera.zoom` + `updateProjectionMatrix()` | 줌 인/아웃 | 데이터 강조 시 줌 인 |
| Swiper + Three.js 연동 | `swiper.on('slideChange')` → 카메라 이동 | **핵심 패턴** — 슬라이드마다 3D 씬이 반응 |

**구현 핵심 (Swiper + 카메라)**:
```js
const cameraPositions = [
  { x:0, y:0, z:5 },   // 슬라이드 1: 정면
  { x:3, y:1, z:4 },   // 슬라이드 2: 우측 위
  { x:-2, y:-1, z:6 }, // 슬라이드 3: 좌측 줌아웃
];
swiper.on('slideChange', () => {
  const pos = cameraPositions[swiper.activeIndex] || cameraPositions[0];
  gsap.to(camera.position, { ...pos, duration: 1.2, ease: 'power2.inOut' });
});
```

### C-2. 오브젝트 전환 (Object Transition)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_morphtargets` | 형태 모핑 (A→B) | 챕터 전환 시 배경 오브젝트가 다른 형태로 변신 |
| `webgl_morphtargets_face` | 얼굴 표정 모핑 | 캐릭터 기반 스토리텔링 |
| `webgl_animation_skinning_blending` | 스켈레톤 애니메이션 블렌딩 | 움직이는 캐릭터 (모델 필요) |
| `webgl_buffergeometry_morphtargets` | 기하 모핑 | 추상 형태가 슬라이드마다 변형 |

### C-3. 줌 / 스케일 (Zoom & Scale)

| 기법 | 효과 | 카드뉴스 적용 |
|---|---|---|
| `gsap.to(mesh.scale, {x:2, y:2, z:2})` | 오브젝트 확대 | 숫자 강조 시 3D 텍스트 확대 |
| `camera.fov` 변경 | 시야각 변화 (돌리 줌) | 극적 전환 — 넓게→좁게 |
| `fog.near / fog.far` 변경 | 안개 밀도 | 분위기 전환 (선명↔몽환) |

### C-4. 색상 / 분위기 전환 (Color & Mood)

| 기법 | 효과 | 카드뉴스 적용 |
|---|---|---|
| `material.color.lerp(newColor, 0.02)` | 부드러운 색상 전환 | 챕터마다 톤 변화 |
| `scene.background.lerp(newColor, 0.02)` | 배경색 전환 | 다크→라이트 슬라이드 전환 |
| `light.intensity` 변경 | 조명 밝기 | 드라마틱 조명 연출 |
| `renderer.toneMappingExposure` | 전체 노출 변경 | 새벽→한낮 시간 흐름 |

### C-5. 후처리 전환 (Post-Processing)

| 예제 ID | 효과 | 카드뉴스 적용 |
|---|---|---|
| `webgl_postprocessing_unreal_bloom` | 블룸 (발광) | 네온·사이버펑크 |
| `webgl_postprocessing_glitch` | 글리치 (깨짐) | 디지털 disruption 주제 |
| `webgl_postprocessing_pixel` | 픽셀화 | 레트로·게임 느낌 |
| `webgl_postprocessing_afterimage` | 잔상 | 속도감·움직임 강조 |
| `webgl_postprocessing_rgb_shift` | RGB 분리 | 크로매틱 aberration — 긴장감 |
| `webgl_postprocessing_film` | 필름 그레인 + 스캔라인 | 빈티지·다큐 느낌 |

---

## D. Swiper + Three.js 통합 아키텍처

### 기본 구조
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css"/>
  <style>
    html, body { margin:0; height:100%; overflow:hidden; }

    /* Three.js 배경 캔버스 — 맨 뒤 */
    #bg3d {
      position: fixed; top:0; left:0; width:100%; height:100%;
      z-index: 0; pointer-events: none;
    }

    /* Swiper 콘텐츠 — 위에 겹침 */
    .swiper { position: relative; z-index: 1; width:100%; height:100%; }
    .swiper-slide {
      display: flex; align-items: center; justify-content: center;
      /* Glassmorphism 카드 (Three.js 배경 위에 반투명) */
    }
    .glass-card {
      background: rgba(255,255,255,0.12);
      backdrop-filter: blur(16px);
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.18);
      padding: 40px;
      max-width: 720px;
    }
  </style>
</head>
<body>

  <canvas id="bg3d"></canvas>

  <div class="swiper">
    <div class="swiper-wrapper">
      <div class="swiper-slide"><div class="glass-card">슬라이드 1</div></div>
      <div class="swiper-slide"><div class="glass-card">슬라이드 2</div></div>
    </div>
    <div class="swiper-pagination"></div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/three@latest/build/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    // === Three.js 배경 ===
    const canvas = document.getElementById('bg3d');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 100);
    camera.position.z = 5;

    // 여기에 파티클·기하·쉐이더 등 배경 효과 추가
    // ...

    // === Swiper ===
    const swiper = new Swiper('.swiper', {
      direction: 'vertical',
      mousewheel: true,
      keyboard: { enabled: true },
      pagination: { el: '.swiper-pagination', clickable: true },
    });

    // === 슬라이드 ↔ 3D 연동 ===
    const slideColors = [0x00ff7f, 0xd4af37, 0xff6b6b];
    swiper.on('slideChange', () => {
      const idx = swiper.activeIndex;
      // 카메라 이동
      gsap.to(camera.position, { x: idx * 0.5, duration: 1, ease:'power2.inOut' });
      // 배경 오브젝트 색상 변경
      // mainMesh.material.color.setHex(slideColors[idx]);
    });

    // === 리사이즈 대응 ===
    window.addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    // === 렌더 루프 ===
    function animate() {
      requestAnimationFrame(animate);
      // 오브젝트 회전, 파티클 업데이트 등
      renderer.render(scene, camera);
    }
    animate();
  </script>
</body>
</html>
```

### 성능 가이드
| 항목 | 권장 |
|---|---|
| 파티클 수 | 모바일: ~2,000 / PC: ~10,000 |
| 기하 복잡도 | 10K 폴리곤 이하 |
| 텍스처 | 1024x1024 이하, 압축 포맷 |
| 후처리 | 모바일에선 bloom 1개만 (성능) |
| `setPixelRatio` | `Math.min(devicePixelRatio, 2)` (레티나 과부하 방지) |
| 프레임 | `requestAnimationFrame` (배터리 절약) |

### 모바일 주의
- Three.js + Swiper 터치 충돌 → canvas 에 `pointer-events: none` 필수
- 모바일 GPU 약함 → 파티클 수·후처리 줄이기
- `devicePixelRatio` 제한 (2 이하)
- 배터리 소모 → 탭 비활성 시 `cancelAnimationFrame`

---

## E. 조합 프리셋 (카드뉴스 옵션 제안용)

아트디렉터가 옵션 제안 시 아래 조합에서 영감을 얻어 **매번 다르게** 제시.

| 프리셋 이름 | 배경 | 카드 스타일 | 인터랙션 |
|---|---|---|---|
| **딥스페이스 오비탈** | 파티클 웨이브 (에메랄드) | Glassmorphism 반투명 | 카운터업 + 파티클 밀도 변화 |
| **블룸버그 터미널** | 검정 + 형광초록 그리드 라인 | 모노스페이스 카드 | 타이핑 효과 + 깜빡이는 커서 |
| **크리스탈 프리즘** | 회전하는 반사 다면체 | 화이트 + 무지개 악센트 | 3D 카드 틸트 호버 |
| **네온 사이버** | 글리치 후처리 + RGB shift | 네온 보더 카드 | 글리치 전환 + 네온 glow |
| **스위스 모션** | 순백 + 빨강 포인트 | 그리드 시스템 Helvetica | SVG line-draw + GSAP 순차 |
| **오션 디프** | 쉐이더 물결 (딥블루) | 반투명 유리 카드 | 물결 반응 + fade-in |
| **매거진B 갤러리** | 베이지 + 텍스처 (종이결) | 세리프 타이포 + 여백 | 커튼 와이프 전환 |
| **레트로 필름** | 필름 그레인 후처리 | 빈티지 타이포 | 스캔라인 + 타이프라이터 |
| **테크 블루프린트** | SVG 격자선 draw + 다크 | 설계도면 카드 | 라인 드로잉 → 콘텐츠 reveal |
| **선라이즈 그라디언트** | 시간 기반 쉐이더 그라디언트 | 크림 텍스트 | 슬라이드마다 그라디언트 방향 전환 |
| **3D 데이터 스케이프** | 인스턴스 3D 바 차트 | 데이터 하이라이트 카드 | OrbitControls 회전 + 호버 상세 |
| **글로브 커넥션** | 지구본 + 연결선 | 도시·데이터 포인트 레이블 | 지구본 자동 회전 + 포인트 호버 |
