# 카드뉴스 자동화 공장 — 프로젝트 규칙

## 핵심 철학
오디언스와 시사점은 항상 한 세트다.
오디언스 없이 카피를 쓰지 않는다.
시사점 없는 카피는 요약이지 카피가 아니다.
이게 다른 AI 툴과의 차별점이다.

---

## 프로젝트 개요
텔레그램 그룹방에 `.md` 소스(또는 텍스트)를 던지면 → 3개의 AI 봇 팀(편집장/카피/아트디렉터)이 그룹방에서 대화하듯 작업하고 → 편집장이 Vercel에 자동 배포하는 공장.

설계 상세: `C:/Users/박주현/.claude/plans/soft-noodling-sutton.md`

---

## 항상 지켜야 할 공통 규칙

### 1. 작업 시작 전 필수
- 모든 봇/에이전트는 작업 시작 전 이 파일의 **핵심 철학**을 컨텍스트로 로드한다.
- 오디언스와 시사점이 정의되지 않은 상태에선 카피/디자인 작업을 시작하지 않는다.

### 2. 기술 스택 (고정)
- **슬라이더**: Swiper.js (모바일 터치 + PC 키보드/휠 내장, 반응형)
- **스타일**: HTML5 + CSS3 (CSS 변수로 디자인 토큰 관리)
- **폰트**: Pretendard Variable 기본, 디자인별로 다른 폰트 가능 (designs/*.md 참조)
- **배포**: Vercel
- **이미지**: OpenAI API (DALL-E 3 / gpt-image-1, 키 1개로 둘 다)

### 3. 모바일 퍼스트
- 모든 HTML은 모바일 뷰포트 먼저 고려, 데스크탑은 확장.
- 최소 지원: 375px(iPhone SE) ~ 1920px(데스크탑).
- 터치 이벤트 + 키보드 네비게이션 + 휠 모두 작동해야 함.

### 4. 시멘틱 HTML
- `<div>` 남발 금지. `<section>`, `<article>`, `<nav>`, `<button>` 등 의미 있는 태그 사용.
- 접근성: 이미지엔 `alt`, 버튼엔 적절한 `aria-label`.

### 5. API 키 취급
- 모든 API 키/토큰은 `.env` 파일에서만 읽는다.
- 하드코딩 금지. 깃 커밋 금지 (`.gitignore`에 명시됨).
- **절대 채팅/로그에 키 값을 노출하지 않는다.**

### 6. 모델 설정 (bot-runtime LLM 호출)

- **카피 A/B 비교** (AWAITING_COPY_APPROVAL 첫 진입에서만): **Opus + GPT-5 동시 생성**
  - A = `claude-opus-4-6`
  - B = `gpt-5` (OpenAI)
  - 선택 후 v2~ 는 **선택된 한쪽만** 재호출
- **그 외 모든 Claude 작업**: `claude-opus-4-6`
  - 자연 대화, 편집장 발화, 오디언스/시사점 추출, 아트 3옵션, HTML 생성, QA 루프
- **Haiku 슬롯**: `claude-haiku-4-5-20251001` (정의만, 미사용)

### 7. 환경변수 위치
```
OPENAI_API_KEY          # OpenAI (DALL-E 3 + gpt-image-1)
ANTHROPIC_API_KEY       # Phase 2 Node.js 폴링 런타임에서 에이전트 LLM 호출
TELEGRAM_BOT_EDITOR     # @HanwhaFinanceNewsBot
TELEGRAM_BOT_COPY       # @hl_copywriter_bot
TELEGRAM_BOT_ART        # @hl_artdirector_bot
TELEGRAM_GROUP_IDS      # -5041725581 (쉼표 구분 복수 허용 — 팀원 각자 그룹 추가 가능)
                        # 레거시 단수 TELEGRAM_GROUP_ID 도 동작
```

---

## 폴더 구조

```
3일차 실습/
├── CLAUDE.md                  ← 이 파일 (공통 규칙, 거의 안 바뀜)
├── design.md                  ← 이번 편 디자인 스타일 지정 (한 줄)
├── .env                       ← API 키 (깃 제외)
├── designs/                   ← 스타일 라이브러리 (계속 추가 가능)
├── sources/YYYY-MM/           ← 주현대리가 소스 .md 넣는 곳
├── assets/YYYY-MM/<slug>/     ← 생성된 이미지 저장
├── output/YYYY-MM/<slug>/     ← 생성된 HTML 저장
└── .claude/
    ├── agents/                ← 에이전트 3개 (editor/copywriter/art-director)
    ├── commands/              ← /make-cardnews (백업용 슬래시 커맨드)
    └── telegram/              ← router.md + bot-personas.md
```

### 파일 역할 구분

| 파일 | 무엇 | 변경 빈도 |
|---|---|---|
| `CLAUDE.md` | 변하지 않는 공통 규칙 | 거의 안 바꿈 |
| `design.md` | 이번 편 디자인 지정 (`current_style: voltagent` 한 줄) | 편마다 가능 |
| `designs/*.md` | 스타일 라이브러리 (색감/폰트/톤 요약) | 새 스타일 발견 시 추가 |
| `.claude/telegram/bot-personas.md` | 3봇 페르소나 최종본 (MBTI, 말투, 발화 예시) | 봇 톤 튜닝 시 |

---

## 워크플로우 (요약)

```
주현대리 → 텔레그램 그룹방
       ↓
① 편집장: 오디언스 확인          [✋ 체크포인트 ①]
       ↓
② 편집장: 톤 브리핑
       ↓
③ 아트디렉터: 3옵션 제시         [✋ 체크포인트 ②]
       ↓
④ 카피: 카피 작성 (콘텐츠 보충 제안 가능)
⑤ 아트디렉터: 디자인 구현 (병렬, 이미지 필요시 직접 생성)
       ↓
⑥ 편집장: 칭찬/피드백/중재
       ↓
⑦ 편집장: 최종 컨펌 체크리스트    [✋ 체크포인트 ③]
       ↓
⑧ 편집장: Vercel 배포 → 🎉 그룹방에 URL 공유
```

---

## 봇 매핑

| 봇 | 텔레그램 | 역할 | 영감 | MBTI |
|---|---|---|---|---|
| 편집장 | `@HanwhaFinanceNewsBot` | 총괄 + 배포 | 이미경 + 강원국 | ENFJ |
| 카피 | `@hl_copywriter_bot` | 카피 + 콘텐츠 보충 | 박웅현 + 이제석 | INTJ |
| 아트디렉터 | `@hl_artdirector_bot` | 디자인 + 구현 + 이미지 | 조수용 + 배민 디자인팀 | ENTP |

페르소나 상세: `.claude/telegram/bot-personas.md`

---

## 체크포인트 응답 양식

주현대리는 자연어로 답하면 됨. 봇이 알아듣고 진행.
- ① 오디언스: "경영진", "사업부장급", "일반 직원" 등
- ② 옵션: "①로 가자", "두 번째", "3번" 등
- ③ 컨펌: "컨펌", "OK", "좋아"

키워드 명령도 인식: `OK` / `수정 [번호]` / `삭제 [번호]` / `네가 채워줘` / `취소` / `재시작`

모호할 때: 봇이 추측하지 않고 다시 묻는다.

---

## 입력 방식 2가지

**방식 A (빠름)**: .md 파일 + frontmatter `notion_url:` 첨부 → 편집장이 바로 작업 시작

**방식 B (대화형) ⭐**: "카드뉴스 만들자" → 편집장이 본문·URL 순서대로 받음

**필수**: 본문 내용만 / **선택**: 노션 URL, frontmatter 형식

---

## 노션 URL 처리

소스 .md frontmatter에 한 줄:
```markdown
---
notion_url: https://노션-게시-URL
---
```

→ 아트디렉터가 마지막 슬라이드에 "원문 보기" CTA로 박음. 없으면 생략.
→ **Notion API 호출 없음** (단순함 우선).

---

## 중요: 모든 봇/에이전트에게

작업을 시작하기 전에 이 순서로 컨텍스트를 로드하라:

1. **이 파일 (CLAUDE.md)** — 특히 최상단의 **핵심 철학**
2. `design.md` — 이번 편의 디자인 스타일 포인터
3. `designs/<current_style>.md` — 상세 디자인 사양
4. `.claude/agents/<본인 역할>.md` — 본인의 Soul (성격/말투/원칙)
5. `.claude/telegram/bot-personas.md` — 그룹방 발화 스타일

순서대로 읽은 뒤, 본인 역할에 맞는 작업을 수행한다.
