# bot-runtime — 텔레그램 그룹방 완전 자동화 런타임

> Phase 2. Node.js 롱 폴링으로 3봇 (편집장/카피/아트디렉터)이 그룹방에서 양방향 대화하며 카드뉴스 작업 완결.

## 설치

```bash
cd bot-runtime
npm install
```

## 스모크 테스트 (연결 확인)

```bash
npm run test-connect
```

체크 항목:
- `.env` API 키 모두 존재
- Telegram 봇 3개 `getMe` 성공
- Claude API 호출 성공
- CLAUDE.md / design.md / agents/ 파일 로드 성공

## 시작

```bash
npm start
```

→ 롱 폴링 시작. 그룹방에 `🤖 편집장 봇 대기 시작` 메시지 전송.

종료: Ctrl+C (편집장 봇이 `🛑 편집장 봇 종료됩니다` 메시지 전송 후 종료)

## 사용 방법 (그룹방에서)

### 방식 A: .md 파일 첨부
1. 그룹방에 `.md` 또는 `.txt` 파일 첨부
2. 편집장이 분석 후 오디언스 질문
3. 오디언스 답변 (예: "경영진")
4. 편집장 톤 브리핑 + 아트 3옵션 제시
5. 옵션 선택 (예: "①" 또는 "1번")
6. 카피·아트 작업 (30~60초)
7. 편집장 최종 컨펌 요청
8. "컨펌" 답변 → Vercel 배포 → URL 그룹방에 공유

### 방식 B: 텍스트 직접 붙여넣기
1. 그룹방에 500자 이상 텍스트 입력
2. 이후 동일 흐름

### 방식 C: 대화형 시작
1. "카드뉴스 만들자" 같은 짧은 메시지
2. 편집장이 "텍스트 주세요" 응답
3. 이어서 파일/텍스트 제공

## 상태 머신

```
IDLE
  ↓ 소스 수신
AWAITING_AUDIENCE (체크포인트 ①)
  ↓ 오디언스 답변
AWAITING_OPTION (체크포인트 ②)
  ↓ 옵션 선택 (①/②/③)
BUILDING (카피+HTML 자동 생성)
  ↓
AWAITING_CONFIRM (체크포인트 ③)
  ↓ "컨펌"
DEPLOYING
  ↓
IDLE (다음 편 대기)
```

- 세션 타임아웃: 2시간 무응답 → 자동 리셋
- 동시 세션 1개 (한 번에 1편만)

## 트러블슈팅

### 봇이 메시지를 못 읽음
BotFather에서 각 봇에 `/setprivacy` → `Disable` 설정

### Telegram "parse_mode" 에러
자동으로 plain text로 재시도됨 (Markdown 실패 시 fallback)

### Vercel 배포 실패
- `vercel whoami` 로 로그인 상태 확인
- `vercel deploy --prod --yes` 직접 실행해서 문제 파악

### Claude API 에러
- 토큰 한도 초과면 `config.js`에서 모델을 `main` → `light` 로 교체
- 응답 잘림이면 `maxTokens` 증량

## 아키텍처

```
src/
├── index.js       # 엔트리 (폴링 루프)
├── config.js      # 환경변수 + 봇 설정 + 모델 매핑
├── telegram.js    # Telegram API (fetch 기반)
├── claude.js      # Anthropic SDK 래퍼
├── agents.js      # 에이전트 system prompt 로더
├── state.js       # 대화 상태 머신 (메모리)
└── pipeline.js    # 워크플로우 오케스트레이션
```

## Phase 2 v1 현재 한계

- [ ] 콘텐츠 보충 흐름 (카피가 "추가 내용 있으세요?" 묻는 로직)
- [ ] 수정 요청 처리 (체크포인트 ③에서 "수정 [내용]" → 재작업)
- [ ] 봇 간 대화 톤 구분 (현재 LLM 호출 시 톤 많이 섞임)
- [ ] 이미지 생성 (OpenAI API 활용)
- [ ] 여러 그룹 지원 (현재 단일 그룹만)
- [ ] SQLite 등 영속 상태 (현재 메모리 — 재시작 시 진행 중 세션 잃음)
