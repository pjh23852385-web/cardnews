// 파이프라인 오케스트레이션 — 에이전트 호출 + 상태 전이 + Telegram 메시지
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { bots, paths, models } from './config.js';
import { callAgent } from './claude.js';
import { loadAgentSystem, loadCurrentDesign } from './agents.js';
import { sendMessage, sendTyping } from './telegram.js';
import { STATES, newSession, getSession, updateSession, resetSession } from './state.js';
import * as log from './logger.js';

// 긴급 탈출 키워드 — BUILDING/DEPLOYING 중에도 허용
const ESCAPE_PATTERN = /^\s*(취소|리셋|초기화|처음부터|강제종료|cancel|reset)\s*$/i;

// ──────────────────────────────────────────────
// 공통 유틸: 타이핑 인디케이터 (호출 직전)
// ──────────────────────────────────────────────
async function typing(bot) {
  return sendTyping(bot);
}

// ──────────────────────────────────────────────
// 자연어 파서 — 추출·이해는 Sonnet(main), 단순 분기는 Haiku(light)
// ──────────────────────────────────────────────

/**
 * 오디언스 답변 파싱 (Sonnet) — 오디언스 + 부가 요구사항 + 질문 분리
 * 반환: { audience, notes: [추가 요구], questions: [질문], unrelated: bool }
 */
async function parseAudience(text) {
  const system = `당신은 카드뉴스 작업 파서입니다. 사용자 메시지에서 다음을 분리:
1. audience: 오디언스 (예: "경영진", "HR 임원 중심", "사업부장급". 명시 안 됐으면 빈 문자열)
2. notes: 부가 요구사항 (예: "밝은 스타일로", "시사점에 X 반영", "분량 짧게"). 없으면 빈 배열.
3. questions: 사용자가 묻는 질문 (예: "주제 4개 확인했어?"). 없으면 빈 배열.
4. unrelated: 메시지가 오디언스 답변과 전혀 무관하면 true (예: 잡담만)

JSON으로만 답하세요:
\`\`\`json
{"audience":"...","notes":["..."],"questions":["..."],"unrelated":false}
\`\`\``;
  const prompt = `메시지: "${text}"`;
  try {
    const { json } = await callAgent(system, prompt, { model: models.main, maxTokens: 300, json: true });
    if (json) {
      return {
        audience: (json.audience || '').trim(),
        notes: Array.isArray(json.notes) ? json.notes.filter(Boolean) : [],
        questions: Array.isArray(json.questions) ? json.questions.filter(Boolean) : [],
        unrelated: !!json.unrelated,
      };
    }
  } catch {}
  return { audience: text.trim(), notes: [], questions: [], unrelated: false };
}

/**
 * 옵션 선택 파싱 (Sonnet) — 선택 + 재설계 요청 + 부가 커스터마이징 + 질문 분리
 * 반환: { choice, regenerate, regenerateIds, notes, questions, unrelated }
 */
async function parseOptionChoice(text, session) {
  const optionsText = (session?.options || [])
    .map((o) => `${o.id}: ${o.name || ''} - 색감(${o.colors || ''}), 인터랙션(${o.interaction || ''}), 어울림(${o.fits || ''})`)
    .join('\n');
  const recommended = session?.recommendedOption || '없음';

  const system = `당신은 카드뉴스 작업 파서입니다. 사용자가 3옵션 중 어느 걸 고르는지 + 옵션 재설계를 원하는지 + 추가 커스터마이징을 원하는지 분리.

응답 형식 (JSON만):
\`\`\`json
{
  "choice": "①|②|③|null",
  "regenerate": false,
  "regenerate_ids": ["①","③"],
  "notes": ["추가 요구사항 목록"],
  "questions": ["사용자가 묻는 질문 목록"],
  "unrelated": false
}
\`\`\`

규칙:
- "1번"/"①"/"첫번째" → choice="①"
- "추천대로"/"편집장 대로" → 편집장 추천 옵션 (${recommended})
- "①로 가되 ③의 카운터업 추가" → choice:"①", notes:["③의 카운터업 추가"]
- "1번 좋은데 색을 더 밝게" → choice:"①", notes:["색을 더 밝게"]
- **재설계/재생성 요청**: "①과 ③을 다시 뽑아줘" / "1,3번 리디자인" / "재설계해서 보여줘" / "스타일 비슷해서 새로 만들어줘"
  → regenerate:true, regenerate_ids:["①","③"], choice:null
  → 대상 옵션 명시 없으면 regenerate_ids: [] (= 전체 재설계)
- 재설계 요청이면서 동시에 선택도 하는 건 없음. regenerate=true 일 땐 choice=null
- 옵션 답 전혀 없고 질문/잡담만 → choice:null, unrelated:true 또는 questions에 담기
- choice 모호하면 null`;

  const prompt = `3옵션:
${optionsText || '(옵션 없음)'}

편집장 추천: ${recommended}

사용자 메시지: "${text}"`;

  try {
    const { json } = await callAgent(system, prompt, { model: models.main, maxTokens: 400, json: true });
    if (json) {
      const regenIds = Array.isArray(json.regenerate_ids)
        ? json.regenerate_ids.filter((id) => ['①', '②', '③'].includes(id))
        : [];
      return {
        choice: ['①', '②', '③'].includes(json.choice) ? json.choice : null,
        regenerate: !!json.regenerate,
        regenerateIds: regenIds,
        notes: Array.isArray(json.notes) ? json.notes.filter(Boolean) : [],
        questions: Array.isArray(json.questions) ? json.questions.filter(Boolean) : [],
        unrelated: !!json.unrelated,
      };
    }
  } catch {}
  return { choice: null, regenerate: false, regenerateIds: [], notes: [], questions: [], unrelated: false };
}

/**
 * 세션 없을 때 팀 자연 대화 라우터 (Sonnet)
 * 여러 봇이 팀처럼 서로 끼어들며 반응. 한 번의 Sonnet 호출로 모든 응답 생성.
 * 반환:
 *   {
 *     intent: 'start'|'greeting'|'chat'|'ignore',
 *     replies: [{ bot: 'editor'|'copywriter'|'artDirector', text: string }, ...]
 *   }
 */
async function conversationalRoute(text) {
  // 세 봇 페르소나 모두 로드 (합성 프롬프트)
  const [editorP, copyP, artP] = await Promise.all([
    loadAgentSystem('editor'),
    loadAgentSystem('copywriter'),
    loadAgentSystem('art-director'),
  ]);

  // 호명된 봇이 있으면 primary로
  const addressed = detectTargetBot(text);

  const system = `당신은 카드뉴스 공장 3봇의 발화를 한꺼번에 오케스트레이션하는 감독입니다.
3봇은 각각 다음 페르소나를 가집니다:

<편집장 페르소나>
${editorP}
</편집장 페르소나>

<카피 페르소나>
${copyP}
</카피 페르소나>

<아트디렉터 페르소나>
${artP}
</아트디렉터 페르소나>

주현대리가 그룹방에 짧은 메시지를 보냈습니다. 아직 카드뉴스 작업은 시작 안 한 상태.

할 일:
1. 의도 분류 (intent):
   - "start": 카드뉴스 작업 시작 요청
   - "greeting": 인사 (안녕, 하이, 굿모닝 등)
   - "chat": 일반 대화/잡담/질문
   - "ignore": 혼잣말/의미 없는 짧은 말
2. 봇들의 반응 생성 — 팀 분위기로:

**greeting 이면**: 3봇 모두 각자 캐릭터대로 인사. 순서는 호명된 봇 먼저, 아니면 편집장 먼저. 다른 봇들은 짧게 뒤따라 인사 + 살짝 봇끼리 리액션도.
예:
 편집장: "안녕하세요 @주현대리! 오늘도 좋은 하루예요 😊"
 카피: "안녕하세요. 오늘은 뭐 만드시나요?"
 아트: "하이요 👋 저는 준비됐어요!"

**chat 이면**: 호명된 봇 + 1~2명 추가. 본인 캐릭터로 짧게.

**start 이면**: 편집장만 응답. "좋습니다. 텍스트(md) 주세요..." 식.

**ignore 이면**: 빈 배열.

응답 원칙:
- 주현대리 호칭: 존댓말 + @주현대리 멘션 (첫 봇만)
- 각 봇 캐릭터·MBTI 유지
- 각 메시지 1~2줄. 짧게.
- 이모지 봇당 1개까지
- 봇끼리 서로 한 줄씩 반응 OK (예: 편집장 → 카피 "오늘 컨디션 좋으신가요?", 카피가 "네 준비됐어요")
- 호명된 봇: ${addressed === 'editor' ? '편집장' : addressed === 'copywriter' ? '카피' : '아트'}

출력 (JSON만):
\`\`\`json
{
  "intent": "start|greeting|chat|ignore",
  "replies": [
    {"bot": "editor", "text": "..."},
    {"bot": "copywriter", "text": "..."},
    {"bot": "artDirector", "text": "..."}
  ]
}
\`\`\``;

  const prompt = `주현대리 메시지: "${text}"`;

  try {
    const { json } = await callAgent(system, prompt, {
      model: models.main,
      maxTokens: 800,
      json: true,
    });
    if (json && json.intent) return json;
  } catch (e) {
    console.error('대화 라우터 에러:', e.message);
  }
  return { intent: 'ignore', replies: [] };
}

/**
 * 역할 문자열 → 봇 객체
 */
function botByRole(role) {
  if (role === 'editor') return bots.editor;
  if (role === 'copywriter') return bots.copywriter;
  if (role === 'artDirector' || role === 'art-director' || role === 'art') return bots.artDirector;
  return bots.editor;
}

/**
 * 메시지에서 대상 봇 감지 (멘션/호명)
 * 기본값: editor
 */
function detectTargetBot(text) {
  const lower = text.toLowerCase();
  // 유저네임 멘션 우선
  if (lower.includes('@hl_copywriter_bot') || lower.includes('@hl_copy_bot')) return 'copywriter';
  if (lower.includes('@hl_artdirector_bot') || lower.includes('@hl_designer_bot')) return 'artDirector';
  if (lower.includes('@hanwhafinancenewsbot') || lower.includes('@hanwha_finance_bot')) return 'editor';
  // 한글 호명
  if (/(카피(라이터)?|카피님)/.test(text)) return 'copywriter';
  if (/(아트(디렉터)?|아트님|디자이너)/.test(text)) return 'artDirector';
  if (/(편집장|편집장님)/.test(text)) return 'editor';
  // 기본: 편집장
  return 'editor';
}

/**
 * 최종 컨펌/취소/수정 답변 파싱 (Sonnet — 수정 내용도 같이 추출)
 * 반환: { action: 'confirm'|'cancel'|'revise'|'question'|null, notes: [], questions: [] }
 */
async function parseConfirmChoice(text) {
  const system = `당신은 카드뉴스 최종 확인 단계의 파서입니다. 사용자 메시지에서 액션 + 수정 요구 + 질문을 분리.

action:
- "confirm": 배포 승인 (컨펌/OK/좋아/진행/가자/배포)
- "cancel": 취소
- "revise": 수정 요구 (구체적 내용 있음)
- "question": 질문만 (수정 아님, 단순 확인)

notes: 수정 요구사항 배열 (예: ["스크롤 안 넘어감 고쳐줘", "카피에서 마침표 빼"])
questions: 질문 배열

JSON만 출력:
\`\`\`json
{"action":"confirm|cancel|revise|question","notes":["..."],"questions":["..."]}
\`\`\``;
  const prompt = `메시지: "${text}"`;
  try {
    const { json } = await callAgent(system, prompt, { model: models.main, maxTokens: 300, json: true });
    if (json && json.action) {
      return {
        action: json.action,
        notes: Array.isArray(json.notes) ? json.notes.filter(Boolean) : [],
        questions: Array.isArray(json.questions) ? json.questions.filter(Boolean) : [],
      };
    }
  } catch {}
  return { action: null, notes: [], questions: [] };
}

const execAsync = promisify(exec);

// ──────────────────────────────────────────────
// 1) 소스 수신 → 오디언스 질문
// ──────────────────────────────────────────────
export async function handleSourceReceived(sourceText, notionUrl = null) {
  // frontmatter 파싱 (있으면 notion_url 추출)
  if (!notionUrl) {
    const fmMatch = sourceText.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const nm = fmMatch[1].match(/notion_url:\s*(\S+)/);
      if (nm) notionUrl = nm[1];
    }
  }

  // 저장
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const timestamp = Date.now();
  const sourcePath = path.join(paths.sourcesDir, ym, `${timestamp}.md`);
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, sourceText, 'utf-8');

  newSession({
    state: STATES.AWAITING_AUDIENCE,
    sourceText,
    sourcePath,
    notionUrl,
  });

  // 편집장이 소스 분석 + 오디언스 질문 (Sonnet — 전체 본문 투입)
  await typing(bots.editor);
  const system = await loadAgentSystem('editor');
  const userPrompt = `방금 카드뉴스 소스를 받았습니다. **본문 전체**를 읽고 오디언스 확인 메시지를 작성하세요.

중요:
1. 본문에 **'#' 대제목(H1)이 몇 개인지 세어보세요**. 각 대제목이 독립 주제일 수 있습니다.
2. 주제 개수를 구체적으로 명시하고 "주제 N개 맞으시죠?" 확인 질문 포함
3. 오디언스 질문: "경영진(C레벨)? 사업부장급? 일반 직원?" 선택지 제시

포맷:
📨 (주제 개수 + 각 주제 한 줄 요약)
(오디언스 질문)

3~6줄. 편집장 톤(ENFJ, 이미경+강원국).

---
본문 전체:
${sourceText}
---`;

  const { text } = await callAgent(system, userPrompt, { model: models.main, maxTokens: 800 });
  await sendMessage(bots.editor, `${text}\n\n— 편집장 (체크포인트 ①)`);
}

// ──────────────────────────────────────────────
// 2) 오디언스 답변 받음 → 톤 브리핑 + 3옵션 요청
// ──────────────────────────────────────────────
export async function handleAudienceAnswer(rawAnswer) {
  const s = getSession();
  if (!s) return;

  // 자연어 오디언스 파싱 (Sonnet — 오디언스 + 부가 요구 + 질문 분리)
  const parsed = await parseAudience(rawAnswer);

  // 무관한 메시지면 다시 묻기
  if (parsed.unrelated && !parsed.audience) {
    await sendMessage(
      bots.editor,
      `@주현대리 죄송한데 오디언스부터 잡고 가야 해요. 경영진? 사업부장급? 일반 직원? 구체적으로 (예: "HR 임원 중심 경영진") 말씀 주세요.\n\n— 편집장`,
    );
    return;
  }

  // 부가 요구는 session에 저장
  const allNotes = [...(s.userNotes || []), ...parsed.notes];
  const audience = parsed.audience || rawAnswer;  // 아래 프롬프트들에서 사용
  updateSession({ audience, userNotes: allNotes });

  // 편집장 즉답 (사람처럼) — 부가 요구 ack 포함
  let ack = `알겠어요 @주현대리. **${parsed.audience || rawAnswer}** 로 확정할게요.`;
  if (parsed.notes.length > 0) {
    ack += `\n\n📝 추가 메모로 받았어요:\n${parsed.notes.map((n) => `  • ${n}`).join('\n')}\n작업에 반영할게요.`;
  }
  if (parsed.questions.length > 0) {
    ack += `\n\n질문 주신 건 작업하면서 답변 드릴게요: ${parsed.questions.join(' / ')}`;
  }
  ack += `\n\n바로 톤 잡을게요.\n\n— 편집장`;
  await sendMessage(bots.editor, ack);

  // 편집장 톤 브리핑 (Sonnet — 편집장 발화)
  await typing(bots.editor);
  const editorSystem = await loadAgentSystem('editor');
  const briefingPrompt = `오디언스 확정: **${audience}**

톤 브리핑을 Telegram 메시지로 작성. 포맷 고정:
📌 용도: (오디언스가 뭘 하려고 보는가)
🎯 시사점: (오디언스가 뭘 결정/실행해야 하는가)
💬 톤: (격식체 / 실무체 / 캐주얼)
⏱ 분량: (장 수 범위)

4~5줄. 본문은 안 봐도 됨 — 오디언스만 보고 톤 판단.`;

  const { text: briefing } = await callAgent(editorSystem, briefingPrompt, {
    model: models.main,
    maxTokens: 400,
  });
  await sendMessage(bots.editor, `📋 톤 브리핑\n${briefing}\n\n아트님, 이 톤으로 3옵션 부탁해요.\n\n— 편집장`);

  // 아트디렉터 받았어요 리액션
  await sendMessage(bots.artDirector, `받았어요, 편집장. 최소 3가지 가져옵니다. 잠깐만요.\n\n— 아트`);

  // 아트디렉터 3옵션 생성 (Sonnet — 본문 전체 읽고 콘텐츠 맞춤 제안)
  await typing(bots.artDirector);
  const design = await loadCurrentDesign();
  const artSystem = await loadAgentSystem('art-director');
  const userNotesText = (s.userNotes && s.userNotes.length > 0)
    ? `\n주현대리 추가 요구:\n${s.userNotes.map((n) => `- ${n}`).join('\n')}\n`
    : '';
  const artPrompt = `본문 분석 + 카드뉴스 디자인×인터랙션 3옵션을 JSON으로만 답하세요. 자연어 설명 일체 금지. JSON 블록 하나만.

오디언스: ${audience}
${userNotesText}
현재 디자인 스타일 라이브러리: ${design.name}
${design.content}

본문 전체:
${s.sourceText}

---

**출력 형식 (이 JSON 블록 하나만. 앞/뒤 아무 설명 없이):**

\`\`\`json
{
  "analysis": "본문 분석 2~3줄만 (150자 내외). 콘텐츠 종류, 주제 개수, 핵심 시각 포인트.",
  "intro_line": "발화 시작 문구 (예: '본문 보니까 이런 특성이 있어서 3가지 방향 가져왔어.')",
  "options": [
    {
      "id": "①",
      "name": "감성적 이름 (예: 암실 호텔 다이닝 × Stripe 대시보드)",
      "colors": "색감",
      "layout": "레이아웃",
      "interaction": "인터랙션",
      "fits": "본문 특성과 매칭 이유"
    },
    {"id": "②", "name": "...", "colors": "...", "layout": "...", "interaction": "...", "fits": "..."},
    {"id": "③", "name": "...", "colors": "...", "layout": "...", "interaction": "...", "fits": "..."}
  ],
  "outro_line": "마무리 한 줄 (예: '어떤 방향으로 갈지 확인해 줘.')"
}
\`\`\`

규칙:
- JSON 블록 하나만. 앞뒤 아무 설명 없이.
- options 정확히 3개. id는 ①/②/③ 유니코드.
- 아트 톤(ENTP, 조수용+배민 디자인팀)으로 자연스럽게 (JSON 필드 텍스트 안에서).`;

  let artJson;
  // 아트 호출 — 최대 2회 시도 (JSON 파싱 실패 시 재질문)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await callAgent(artSystem, artPrompt, {
        model: models.main,
        maxTokens: 4500,
        json: true,
      });
      artJson = r.json;
      if (artJson && Array.isArray(artJson.options) && artJson.options.length === 3) {
        break; // 성공
      }
      if (attempt < 2) {
        console.warn('⚠️ 아트 JSON 파싱 실패, 재질문 중...');
        await typing(bots.artDirector);
      }
    } catch (e) {
      if (attempt === 2) {
        await sendMessage(
          bots.editor,
          `⚠️ @주현대리 아트 쪽 네트워크 에러로 3옵션 생성 실패했어요. 소스 다시 한 번 던져주시겠어요?\n\n— 편집장`,
        );
        resetSession();
        return;
      }
    }
  }

  // 최종 검증
  if (!artJson || !Array.isArray(artJson.options) || artJson.options.length < 2) {
    await sendMessage(
      bots.editor,
      `⚠️ 아트 3옵션 파싱이 두 번 다 실패했어요. 소스 다시 던져주시면 바로 재시도할게요.\n\n— 편집장`,
    );
    resetSession();
    return;
  }

  // JSON에서 Telegram 메시지 조립
  const parts = [];
  if (artJson.intro_line) parts.push(artJson.intro_line);
  parts.push(''); // blank line
  parts.push('📊 본문 분석');
  parts.push(artJson.analysis);
  parts.push(''); // blank line
  for (const opt of artJson.options) {
    parts.push(`${opt.id} **${opt.name}**`);
    parts.push(`   🎨 ${opt.colors}`);
    parts.push(`   📐 ${opt.layout}`);
    parts.push(`   ✨ ${opt.interaction}`);
    parts.push(`   🎯 ${opt.fits}`);
    parts.push('');
  }
  if (artJson.outro_line) parts.push(artJson.outro_line);
  parts.push('— 아트');
  const talkMsg = parts.join('\n');
  await sendMessage(bots.artDirector, `🎨 ${talkMsg}`);

  // 편집장 리액션 (아트 보고 칭찬 + 정리 준비)
  await sendMessage(
    bots.editor,
    `👍 아트, 좋네요. 제가 오디언스 기준으로 정리해서 주현대리께 여쭤볼게요.\n\n— 편집장`,
  );

  // 미니 미리보기 3개 병렬 생성 + 배포 (선택 도와주기)
  await sendMessage(
    bots.editor,
    `📐 아트가 옵션마다 미리보기(3슬라이드씩) 만드는 중이에요. 60~90초 걸려요. 잠깐만요.\n\n— 편집장`,
  );

  let previews = [];
  try {
    previews = await generateOptionPreviews(s, artJson.options, audience);
    if (previews.length === artJson.options.length) {
      const lines = ['🎨 미리보기 나왔어요. 클릭해서 열어봐:'];
      previews.forEach((p) => {
        lines.push(`${p.id} ${p.name}\n   👉 ${p.url}`);
      });
      await sendMessage(bots.artDirector, lines.join('\n\n'));
    }
  } catch (e) {
    console.error('미리보기 생성/배포 실패:', e);
    await sendMessage(
      bots.editor,
      `⚠️ 미리보기 생성 일부 실패 (${String(e.message || e).slice(0, 150)}). 글 옵션 보고 선택해도 OK.\n\n— 편집장`,
    );
  }

  // 편집장 정리 + 추천 (Haiku — 그냥 포맷팅)
  await typing(bots.editor);
  const options = artJson?.options || [];
  const editorSummaryPrompt = `아트가 3옵션 제안. 주현대리께 추천 메시지 작성.

옵션:
${JSON.stringify(options, null, 2)}

오디언스: ${audience}

요구사항:
- 오디언스 기준으로 **딱 하나** 추천 + 한 줄 이유
- 추천을 "추천: ①" 같이 명시
- "①/②/③ 중 어떤 걸로?" 질문
- 3~5줄
- 끝에 "— 편집장 (체크포인트 ②)"`;

  const { text: summaryMsg } = await callAgent(editorSystem, editorSummaryPrompt, {
    model: models.main,
    maxTokens: 400,
  });

  // 편집장 추천 옵션 추출 ("추천: ②" 또는 "추천 ②" 패턴)
  const recMatch = summaryMsg.match(/추천[\s:]*([①②③])/);
  const recommendedOption = recMatch ? recMatch[1] : null;

  await sendMessage(bots.editor, summaryMsg);

  updateSession({
    state: STATES.AWAITING_OPTION,
    options,
    recommendedOption,
  });
}

// ──────────────────────────────────────────────
// 3) 옵션 선택 → 카피·HTML 생성 → 컨펌 요청
// ──────────────────────────────────────────────
export async function handleOptionChoice(choice) {
  const s = getSession();
  if (!s) return;

  const prevState = s.state;
  updateSession({ state: STATES.BUILDING, optionChoice: choice });
  log.state(prevState, STATES.BUILDING, `choice=${choice}`);

  await sendMessage(
    bots.editor,
    `좋아요 @주현대리, **${choice}** 로 가겠습니다. 카피·아트 작업 들어가요. HTML 30~60초 걸려요. 잠깐만 기다려주세요.\n\n— 편집장`,
  );

  // 아트디렉터 착수 리액션
  await sendMessage(
    bots.artDirector,
    `받았어요, ${choice} 들어갑니다. 카피 필요한 만큼 담고 디자인 구현 시작.\n\n— 아트`,
  );

  // 긴 작업이라 주기적으로 타이핑 인디케이터
  const typingInterval = setInterval(() => {
    typing(bots.artDirector).catch(() => {});
  }, 4000);

  // 실제 HTML 생성 로직은 아래 _runBuilding 으로 이동 — BUILDING 에러 시 세션 복구
  try {
    await _runBuilding(choice, typingInterval);
  } catch (e) {
    clearInterval(typingInterval);
    log.error('BUILDING', `handleOptionChoice 실패 choice=${choice}`, e);
    // 상태 복구: AWAITING_OPTION 으로 되돌려서 주현대리가 재선택 or 재시도 가능
    const cur = getSession();
    if (cur) {
      updateSession({ state: STATES.AWAITING_OPTION });
      log.state(STATES.BUILDING, STATES.AWAITING_OPTION, 'error recovery');
    }
    const msg = String(e.message || e).slice(0, 160);
    await sendMessage(
      bots.editor,
      `⚠️ @주현대리 작업 중 에러가 났어요.\n\n에러: ${msg}\n\n다시 옵션 선택(①/②/③) 하면 재시도합니다. "취소" 로 세션 종료도 가능해요.\n\n— 편집장`,
    ).catch(() => {});
  }
}

async function _runBuilding(choice, typingInterval) {
  const s = getSession();
  if (!s) throw new Error('세션이 사라짐');

  // HTML 바로 생성 (카피와 디자인 통합 — 아트디렉터가 통째로)
  const design = await loadCurrentDesign();
  const artSystem = await loadAgentSystem('art-director');

  const htmlPrompt = `카드뉴스 HTML을 생성하세요. 통째로 한 파일 완성본.

## 컨텍스트
- **오디언스**: ${s.audience}
- **선택된 옵션**: ${choice} (${JSON.stringify(s.options)})
- **디자인 스타일**: ${design.name}
${design.content}
- **노션 URL**: ${s.notionUrl || '없음'}
${(s.userNotes && s.userNotes.length > 0) ? `\n## 🌟 사용자 추가 요구사항 (반드시 반영)\n${s.userNotes.map((n) => `- ${n}`).join('\n')}\n` : ''}

## 핵심 철학 (CLAUDE.md)
오디언스와 시사점은 항상 한 세트. 오디언스 없이 카피 안 쓴다. 시사점 없는 카피는 요약이지 카피 아님.

## 요구사항
1. **Swiper.js 11 사용** (vertical + fade, 키보드/휠/터치 지원, 페이지네이션)
2. **Pretendard Variable** (본문) + **JetBrains Mono** (숫자/코드)
3. **모바일 반응형** (clamp() 폰트 크기, 카드 그리드 자동 배치)
4. **숫자 카운터업 애니메이션** (data-count 속성 이용, IntersectionObserver 또는 slideChange 이벤트)
5. **오디언스 기반 카피**: "${s.audience}" 이 지금 당장 뭘 해야 하는가 관점
6. **본문 주제 모두 커버** (여러 주제면 챕터로 나눠서)
7. **12~18장 사이** (오디언스가 격식 있는 경영진/임원급이면 더 압축)
8. **마지막 슬라이드**: CTA 버튼 "원문 상세 보기" → ${s.notionUrl || '생략'}
9. **진행바**(progress-bar) + **슬라이드 카운터** (01 / 15 형태) 상단 고정
10. **시맨틱 HTML** + **alt 속성** 필수

## 본문
${s.sourceText}

## 출력 형식
오로지 완성된 HTML 한 파일. \`<!DOCTYPE html>\` 부터 \`</html>\` 까지. 설명 문구 X.
Markdown 코드 블록(\`\`\`html)도 X. 순수 HTML만.`;

  let htmlText;
  try {
    const result = await callAgent(artSystem, htmlPrompt, {
      model: models.heavy,
      maxTokens: 16000,
    });
    htmlText = result.text;
  } finally {
    clearInterval(typingInterval);
  }

  // HTML 추출 (혹시 코드블록으로 감쌌으면 벗기기)
  let html = htmlText.trim();
  const codeBlockMatch = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) html = codeBlockMatch[1].trim();
  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<!doctype')) {
    // 첫 <!DOCTYPE 찾아서 자르기
    const idx = html.toLowerCase().indexOf('<!doctype');
    if (idx > 0) html = html.slice(idx);
  }

  // 저장 slug 생성
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : 'cardnews';
  const slug = title
    .replace(/[·\s]+/g, '-')
    .replace(/[^a-zA-Z0-9가-힣\-]/g, '')
    .toLowerCase()
    .slice(0, 50) || `cardnews-${Date.now()}`;

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const outDir = path.join(paths.outputDir, ym, slug);
  await fs.mkdir(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'index.html');
  await fs.writeFile(htmlPath, html, 'utf-8');

  updateSession({
    state: STATES.AWAITING_CONFIRM,
    html,
    slug,
    htmlPath,
  });

  // 아트 완성 보고
  await sendMessage(
    bots.artDirector,
    `🎨 완성이요. 편집장, 확인 넘깁니다. placeholder 그라디언트 마감 + 노션 CTA 박았어요.\n\n— 아트`,
  );

  // 자동 임시 Vercel preview 배포 (매 revision마다 새 URL)
  const revN = (s.revisionCount || 0) + 1;
  updateSession({ revisionCount: revN });
  const previewProjectName = `cardnews-${slug}-r${revN}`.slice(0, 50);
  let previewUrl = null;
  try {
    await sendMessage(bots.editor, `🚀 임시 미리보기 배포 중 (revision ${revN})...\n\n— 편집장`);
    await execAsync(
      `vercel deploy --prod --yes --name ${previewProjectName}`,
      { cwd: outDir, maxBuffer: 10 * 1024 * 1024 },
    );
    previewUrl = `https://${previewProjectName}.vercel.app`;
  } catch (e) {
    console.warn('preview 배포 실패:', e.message);
  }

  // 편집장 체크리스트 (+ 미리보기 URL 포함)
  const urlLine = previewUrl ? `\n👉 미리보기: ${previewUrl}\n` : '';
  const userNotesLine = (s.userNotes && s.userNotes.length > 0)
    ? `📝 반영 사항:\n${s.userNotes.map((n) => `  • ${n}`).join('\n')}\n\n`
    : '';
  await sendMessage(
    bots.editor,
    `@주현대리 ${revN > 1 ? `수정본(${revN}회차)` : '다 됐어요'}. 최종 확인 부탁드립니다.\n${urlLine}\n${userNotesLine}✅ 카피 **${s.audience}** 오디언스/시사점 반영\n✅ 디자인 ${choice} (${design.name})\n\n"컨펌" 해주시면 정식 배포, "수정 [내용]" / "취소" 도 OK.\n\n— 편집장 (체크포인트 ③)`,
  );
}

// ──────────────────────────────────────────────
// 4) 최종 컨펌 → Vercel 배포 → 링크 공유
// ──────────────────────────────────────────────
export async function handleFinalConfirm() {
  const s = getSession();
  if (!s) return;
  updateSession({ state: STATES.DEPLOYING });

  await sendMessage(bots.editor, `네, 바로 올릴게요 @주현대리. Vercel 푸시 중...\n\n— 편집장`);
  await typing(bots.editor);

  try {
    // vercel deploy
    const projectName = `cardnews-${s.slug}`.slice(0, 50);
    const outDir = path.dirname(s.htmlPath);
    const { stdout } = await execAsync(
      `vercel deploy --prod --yes --name ${projectName}`,
      { cwd: outDir, maxBuffer: 10 * 1024 * 1024 },
    );

    // URL 추출 (마지막 줄에 URL 있음)
    const urlMatch = stdout.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/);
    const url = urlMatch ? urlMatch[0] : null;

    if (url) {
      // canonical URL 추정 (프로젝트명.vercel.app)
      const canonical = `https://${projectName}.vercel.app`;
      updateSession({ deployUrl: canonical });

      await sendMessage(
        bots.editor,
        `@주현대리 다 됐어요. 🎉\n\n${canonical}\n\n이번 편 진짜 잘 나왔어요. PC + 모바일 모두 열어보세요. 다음 편 때 뵐게요.\n\n— 편집장`,
      );
    } else {
      await sendMessage(bots.editor, `❌ 배포는 됐는데 URL 파싱 실패. 로그 확인 필요.\n\n— 편집장`);
    }
  } catch (e) {
    await sendMessage(bots.editor, `❌ 배포 실패: ${String(e).slice(0, 300)}\n\n— 편집장`);
  }

  resetSession();
}

// ──────────────────────────────────────────────
// 5) 사용자 답변 라우팅 (현재 상태에 따라 처리)
// ──────────────────────────────────────────────
export async function handleUserText(text) {
  const s = getSession();

  if (!s) {
    // 세션 없음
    // 긴 본문이면 바로 소스로 (500자 이상)
    if (text.length > 500) {
      await handleSourceReceived(text);
      return;
    }
    // 그 외 모든 메시지 → LLM 자연 대화 라우터 (여러 봇 팀 응답)
    const primaryTarget = detectTargetBot(text);
    const primaryBotObj = botByRole(primaryTarget);
    await typing(primaryBotObj);
    const { intent, replies } = await conversationalRoute(text);
    if (intent === 'ignore' || !replies || replies.length === 0) return;
    // 봇들이 순차 발화 (팀 회의 느낌, 1.2~1.8초 간격)
    for (let i = 0; i < replies.length; i++) {
      const r = replies[i];
      const botObj = botByRole(r.bot);
      if (!botObj || !r.text) continue;
      if (i > 0) {
        await typing(botObj);
        await new Promise((res) => setTimeout(res, 1400 + Math.random() * 600));
      }
      await sendMessage(botObj, r.text);
    }
    return;
  }

  // 상태에 따라 라우팅
  switch (s.state) {
    case STATES.AWAITING_AUDIENCE:
      await handleAudienceAnswer(text);
      break;

    case STATES.AWAITING_OPTION: {
      const parsed = await parseOptionChoice(text, s);

      // 부가 요구는 session.userNotes 에 저장
      if (parsed.notes.length > 0) {
        const allNotes = [...(s.userNotes || []), ...parsed.notes];
        updateSession({ userNotes: allNotes });
      }

      // 재설계 요청이 먼저 (선택과 동시 발생 안 함)
      if (parsed.regenerate) {
        await handleOptionRegenerate(parsed.regenerateIds, parsed.notes);
        break;
      }

      // 옵션 선택 있으면 진행 (ack + 작업 시작)
      if (parsed.choice) {
        if (parsed.notes.length > 0) {
          await sendMessage(
            bots.editor,
            `📝 추가 요구 받았어요:\n${parsed.notes.map((n) => `  • ${n}`).join('\n')}\n작업에 반영합니다.\n\n— 편집장`,
          );
        }
        if (parsed.questions.length > 0) {
          await sendMessage(
            bots.editor,
            `질문 주신 건 작업하면서 답변 드릴게요: ${parsed.questions.join(' / ')}\n\n— 편집장`,
          );
        }
        await handleOptionChoice(parsed.choice);
      } else if (parsed.notes.length > 0) {
        // 옵션은 안 정했지만 추가 요구는 있음 → ack + 옵션 재요청
        await sendMessage(
          bots.editor,
          `📝 받았어요 @주현대리:\n${parsed.notes.map((n) => `  • ${n}`).join('\n')}\n메모해뒀다가 작업에 반영할게요.\n\n그래서 ①/②/③ 중 어느 옵션으로 가실까요?\n\n— 편집장`,
        );
        if (parsed.questions.length > 0) {
          await answerQuestionsAndReprompt(parsed.questions, s, 'option');
        }
      } else if (parsed.questions.length > 0) {
        // 질문만 있고 선택 없음 → 편집장이 답하고 다시 물음
        await answerQuestionsAndReprompt(parsed.questions, s, 'option');
      } else {
        await sendMessage(
          bots.editor,
          `@주현대리 ①/②/③ 중에서 선택해 주시거나 "편집장 추천대로" 같이 답해주세요. 추가 요구사항이 있으시면 같이 적어주셔도 돼요 (예: "①로 가되 색을 더 밝게").\n\n— 편집장`,
        );
      }
      break;
    }

    case STATES.AWAITING_CONFIRM: {
      const { action, notes, questions } = await parseConfirmChoice(text);

      if (action === 'confirm') {
        await handleFinalConfirm();
      } else if (action === 'cancel') {
        await sendMessage(bots.editor, `작업 취소. 다음 편 때 뵐게요.\n\n— 편집장`);
        resetSession();
      } else if (action === 'revise' && notes.length > 0) {
        // 진짜 수정 — userNotes에 반영하고 HTML 재생성
        const allNotes = [...(s.userNotes || []), ...notes];
        updateSession({ userNotes: allNotes });
        await sendMessage(
          bots.editor,
          `알겠어요 @주현대리. 받은 요구 반영해서 다시 만들게요:\n${notes.map((n) => `  • ${n}`).join('\n')}\n\n1~2분 걸려요, 잠깐만요.\n\n— 편집장`,
        );
        // 기존 옵션 선택 유지 → handleOptionChoice 재호출로 HTML 재생성
        await handleOptionChoice(s.optionChoice);
      } else if (action === 'question' || questions.length > 0) {
        // 질문만 → 편집장이 답하고 다시 컨펌 요청
        await answerQuestionsAndReprompt(questions.length > 0 ? questions : [text], s, 'confirm');
      } else {
        await sendMessage(
          bots.editor,
          `@주현대리 "컨펌" / "취소" / "수정 [구체적 내용]" 중 하나로 답해주시거나, 궁금한 거 있으시면 편하게 질문 주세요.\n\n— 편집장`,
        );
      }
      break;
    }

    default: {
      // 작업 중(BUILDING/DEPLOYING) — 기본은 무시해서 이중 요청 방지,
      // 단 긴급 탈출 키워드는 받아서 세션 리셋 (BUILDING 고착 탈출용)
      if (ESCAPE_PATTERN.test(text)) {
        log.warn('EMERGENCY_RESET', `state=${s.state} text="${text.slice(0,40)}"`);
        await sendMessage(
          bots.editor,
          `🛑 강제 리셋 받았어요. 진행 중이던 작업 중단하고 세션 초기화합니다. 처음부터 다시 하시려면 소스 던져주세요.\n\n— 편집장`,
        ).catch(() => {});
        resetSession();
      }
      break;
    }
  }
}

// (구) detectStartIntent 제거 — conversationalRoute 로 대체

/**
 * 옵션별 미리보기 HTML 생성 + Vercel 배포 (병렬)
 * @returns {Promise<Array<{id, name, url}>>}
 */
async function generateOptionPreviews(s, options, audience) {
  const design = await loadCurrentDesign();
  const artSystem = await loadAgentSystem('art-director');

  // 본문 첫 부분만 미리보기용으로
  const sourceExcerpt = s.sourceText.slice(0, 2500);

  const tasks = options.map(async (opt) => {
    const prompt = `미니 카드뉴스 미리보기(3슬라이드만)를 HTML 한 파일로 작성. 사용자가 이 스타일이 마음에 드는지 보고 결정할 수 있게.

## 스타일 (이 옵션의 정체성)
- 이름: ${opt.name}
- 색감: ${opt.colors}
- 레이아웃: ${opt.layout}
- 인터랙션: ${opt.interaction}
- 어울림: ${opt.fits}

## 컨텍스트
- 오디언스: ${audience}
- 디자인 라이브러리 참고: ${design.name}
${design.content.slice(0, 800)}

## 본문 발췌 (앞부분 — 미리보기용)
${sourceExcerpt}

## 요구사항
- Swiper.js 11 vertical fade
- Pretendard Variable + JetBrains Mono
- 정확히 3슬라이드: 표지 + 본문 핵심 1 + 본문 핵심 2
- 위 스타일을 정확히 적용
- 인터랙션 1~2개 동작 (설정한 인터랙션)
- 모바일 반응형 (clamp() 폰트)
- 슬라이드 카운터 (1/3) + 진행바
- HTML 한 파일. 코드 블록(\`\`\`) 금지. <!DOCTYPE 부터 </html> 까지만.`;

    const r = await callAgent(artSystem, prompt, {
      model: models.main,
      maxTokens: 8000,
    });

    let html = r.text.trim();
    const cb = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
    if (cb) html = cb[1].trim();
    if (!html.toLowerCase().startsWith('<!doctype')) {
      const idx = html.toLowerCase().indexOf('<!doctype');
      if (idx > 0) html = html.slice(idx);
    }

    // 저장 + 배포
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const safeId = opt.id === '①' ? '1' : opt.id === '②' ? '2' : '3';
    const slug = `preview-${Date.now()}-${safeId}`;
    const outDir = path.join(paths.outputDir, ym, slug);
    await fs.mkdir(outDir, { recursive: true });
    const htmlPath = path.join(outDir, 'index.html');
    await fs.writeFile(htmlPath, html, 'utf-8');

    const projectName = `prev-${slug}`.slice(0, 50);
    const { stdout } = await execAsync(
      `vercel deploy --prod --yes --name ${projectName}`,
      { cwd: outDir, maxBuffer: 10 * 1024 * 1024 },
    );
    const urlMatch = stdout.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/);
    const url = urlMatch ? `https://${projectName}.vercel.app` : null;

    return { id: opt.id, name: opt.name, url };
  });

  return Promise.all(tasks);
}

/**
 * 기존 옵션 중 일부(또는 전체)를 재설계해서 새 미리보기 생성
 * @param {string[]} targetIds - 재설계할 옵션 ID ['①','③']. 빈 배열이면 전체
 * @param {string[]} userNotes - 사용자의 재설계 요구사항 (차별화 방향 등)
 */
async function handleOptionRegenerate(targetIds, userNotes) {
  const s = getSession();
  if (!s) return;
  if (!Array.isArray(s.options) || s.options.length === 0) {
    await sendMessage(
      bots.editor,
      `⚠️ 재설계할 기존 옵션이 없어요. 소스부터 다시 받아서 3옵션 제안할까요?\n\n— 편집장`,
    );
    return;
  }

  const ids = targetIds.length > 0 ? targetIds : s.options.map((o) => o.id);
  const targetsLabel = ids.join('·');
  const keepIds = s.options.map((o) => o.id).filter((id) => !ids.includes(id));
  const notesLine = (userNotes && userNotes.length > 0) ? userNotes.join(' / ') : '(차별화 해달라는 요구)';

  log.info('REGENERATE', `targets=${targetsLabel} keep=${keepIds.join(',')||'없음'} notes="${notesLine.slice(0,80)}"`);

  await sendMessage(
    bots.editor,
    `🔄 ${targetsLabel} 재설계 요청 받았어요. 아트한테 넘길게요. 60~90초 걸려요.\n\n— 편집장`,
  );
  await sendMessage(
    bots.artDirector,
    `알겠어요. ${targetsLabel} 확실히 다른 방향으로 뽑아올게요. 기존 ${keepIds.join('·') || '없음'}은 유지.\n\n— 아트`,
  );

  // 아트한테 신규 옵션 정의 요청 (기존과 차별화 명시)
  const artSystem = await loadAgentSystem('art-director');
  const keepOptionsJson = s.options.filter((o) => keepIds.includes(o.id));
  const targetOptionsJson = s.options.filter((o) => ids.includes(o.id));

  const proposalPrompt = `주현대리가 기존 ${targetsLabel} 옵션을 재설계해달라고 했습니다. 이유: "${notesLine}"

## 유지할 옵션 (차별화 기준 — 이것들과 확실히 달라야 함)
${JSON.stringify(keepOptionsJson, null, 2)}

## 재설계 대상 (같은 id, 완전 새 스타일)
${targetOptionsJson.map((o) => `${o.id}: 기존 "${o.name}" — 새로 만드세요`).join('\n')}

## 컨텍스트
- 오디언스: ${s.audience}
- 사용자 메모: ${notesLine}

## 응답 형식 (JSON만)
\`\`\`json
{
  "options": [
    { "id":"①", "name":"<감성 이름>", "colors":"<색감 설명>", "layout":"<레이아웃 설명>", "interaction":"<인터랙션 2~3개>", "fits":"<왜 이 오디언스에 맞는지 1줄>" }
  ]
}
\`\`\`

규칙:
- options 배열에는 재설계 대상 ${targetsLabel} 만 포함 (${ids.length}개)
- id는 원래 그대로 유지 (${targetsLabel})
- 유지할 옵션과 색감·레이아웃·인터랙션 모두 뚜렷이 다르게
- name은 감성 이름 ("암실 호텔 다이닝", "완벽 해킹룸 에메랄드" 스타일)`;

  let newOptions = [];
  try {
    const { json } = await callAgent(artSystem, proposalPrompt, {
      model: models.main,
      maxTokens: 1500,
      json: true,
    });
    if (json && Array.isArray(json.options)) {
      newOptions = json.options.filter((o) => ids.includes(o.id));
    }
  } catch (e) {
    log.error('REGENERATE', 'art 재제안 실패', e);
  }

  if (newOptions.length === 0) {
    await sendMessage(
      bots.editor,
      `⚠️ 아트 재제안 실패했어요. 잠시 후 다시 "재설계" 요청해 주세요. 아니면 기존 옵션 중 선택도 OK.\n\n— 편집장`,
    );
    return;
  }

  // 아트가 새 스타일 요약 발화
  const talkParts = [`🎨 ${targetsLabel} 다시 뽑았어요. 기존이랑 확실히 다릅니다:`, ''];
  for (const opt of newOptions) {
    talkParts.push(`${opt.id} **${opt.name}**`);
    talkParts.push(`   🎨 ${opt.colors}`);
    talkParts.push(`   📐 ${opt.layout}`);
    talkParts.push(`   ✨ ${opt.interaction}`);
    talkParts.push(`   🎯 ${opt.fits}`);
    talkParts.push('');
  }
  talkParts.push('미리보기 만드는 중이에요.');
  talkParts.push('— 아트');
  await sendMessage(bots.artDirector, talkParts.join('\n'));

  // 새 옵션만 미리보기 생성·배포
  let newPreviews = [];
  try {
    newPreviews = await generateOptionPreviews(s, newOptions, s.audience);
  } catch (e) {
    log.error('REGENERATE', '미리보기 생성 실패', e);
    await sendMessage(
      bots.editor,
      `⚠️ 새 미리보기 배포 실패 (${String(e.message || e).slice(0, 120)}). 글 옵션 설명만 보고 선택해도 OK.\n\n— 편집장`,
    );
  }

  // 세션 옵션 업데이트 (targets 교체, keep은 그대로)
  const mergedOptions = s.options.map((orig) => {
    const replaced = newOptions.find((n) => n.id === orig.id);
    return replaced || orig;
  });
  updateSession({ options: mergedOptions });

  if (newPreviews.length > 0) {
    const lines = [`🎨 새 미리보기 나왔어요 (${targetsLabel}):`];
    newPreviews.forEach((p) => {
      lines.push(`${p.id} ${p.name}\n   👉 ${p.url}`);
    });
    if (keepIds.length > 0) {
      lines.push('');
      lines.push(`※ ${keepIds.join('·')} 는 기존 미리보기 그대로입니다.`);
    }
    await sendMessage(bots.artDirector, lines.join('\n\n'));
  }

  await sendMessage(
    bots.editor,
    `@주현대리 ①/②/③ 중 어느 걸로 가실까요? 또 다시 뽑을 거 있으면 말씀 주세요.\n\n— 편집장 (체크포인트 ②)`,
  );
}

/**
 * 작업 진행 중 사용자가 던진 질문에 편집장이 답하고 다시 현재 단계로 되돌리기
 */
async function answerQuestionsAndReprompt(questions, session, currentStep) {
  const editorSystem = await loadAgentSystem('editor');
  const stepHint = currentStep === 'option'
    ? '지금 단계는 3옵션 중 선택 (체크포인트 ②). 답한 뒤 "①/②/③ 중 어느 걸로?" 다시 물어주세요.'
    : '지금 단계의 질문에 답한 뒤 다시 현재 체크포인트 안내해 주세요.';
  const optionsContext = (session?.options || [])
    .map((o) => `${o.id}: ${o.name || ''} - ${o.colors || ''}`)
    .join('\n');

  const prompt = `주현대리가 작업 중 다음 질문을 했어요:
${questions.map((q) => `- ${q}`).join('\n')}

컨텍스트:
- 오디언스: ${session?.audience || '미정'}
- 3옵션: ${optionsContext || '없음'}
- 편집장 추천: ${session?.recommendedOption || '없음'}
- 사용자 메모: ${(session?.userNotes || []).join(' / ') || '없음'}

편집장 톤(ENFJ)으로 자연스럽게 답한 뒤 ${stepHint}
3~6줄. 끝에 "— 편집장"`;

  const { text } = await callAgent(editorSystem, prompt, { model: models.main, maxTokens: 500 });
  await sendMessage(bots.editor, text);
}
