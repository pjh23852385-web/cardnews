// 파이프라인 오케스트레이션 — 에이전트 호출 + 상태 전이 + Telegram 메시지
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { bots, paths, models } from './config.js';
import { callAgent } from './claude.js';
import { loadAgentSystem, loadCurrentDesign, buildBrandCatalog, loadBrandDesign, resolveDesignIntent } from './agents.js';
import * as tg from './telegram.js';
import * as state from './state.js';
import { STATES } from './state.js';
import { callOpenAI } from './openai.js';
import * as log from './logger.js';
import { AsyncLocalStorage } from 'node:async_hooks';

// ──────────────────────────────────────────────
// 그룹 컨텍스트 (다중 그룹 지원) — 파일 하단의 wrapper 가 자동 주입
// ──────────────────────────────────────────────
const groupCtx = new AsyncLocalStorage();

/**
 * 핸들러 호출을 groupId 컨텍스트로 감싸기. index.js 에서 사용.
 *   await runWithGroup(chatId, () => handleUserText(text));
 */
export function runWithGroup(groupId, fn) {
  return groupCtx.run({ groupId }, fn);
}

function _gid() {
  const id = groupCtx.getStore()?.groupId;
  if (id == null) {
    throw new Error('pipeline: groupId 없음 — runWithGroup() 으로 감싸야 함');
  }
  return id;
}

// 편의 래퍼 — pipeline.js 본문이 기존 이름 그대로 쓰게 함
async function sendMessage(bot, text, extra = {}) {
  return tg.sendMessage(bot, text, _gid(), extra);
}
async function sendDocument(bot, filePath, caption = '') {
  return tg.sendDocument(bot, filePath, caption, _gid());
}
async function sendTyping(bot) {
  return tg.sendTyping(bot, _gid());
}
function getSession() { return state.getSession(_gid()); }
function updateSession(patch) { return state.updateSession(_gid(), patch); }
function resetSession() { return state.resetSession(_gid()); }
function newSession(initial) { return state.newSession(_gid(), initial); }

// 그룹별 output 네임스페이스 — 파일·폴더 충돌 방지
function _groupOutputDir() {
  return path.join(paths.outputDir, `g-${_gid()}`);
}

// Vercel 프로젝트명 접두 — 그룹 구분 (50자 제한 고려해 축약)
function _gidSlug() {
  return String(Math.abs(_gid())).slice(-8);
}

// 긴급 탈출 키워드 — BUILDING/DEPLOYING 중에도 허용
const ESCAPE_PATTERN = /^\s*(취소|리셋|초기화|처음부터|강제종료|cancel|reset)\s*$/i;

// 한화 로고 CI — 흰색/밝은 배경 슬라이드에서만 오른쪽 상단에 표시
const HANWHA_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 134.47 87.83" width="100%" height="100%"><path fill="#f7bb82" d="M59.07,29.06c-.81-7.37,6.92-13.28,17.26-13.2,10.34,.08,19.38,6.12,20.19,13.48,.82,7.37-6.9,13.28-17.25,13.2-10.34-.08-19.39-6.11-20.2-13.48m39.37,2.29c-.94-9.14-11.34-16.62-23.24-16.73-11.91-.1-20.79,7.23-19.86,16.37,.93,9.14,11.34,16.63,23.24,16.73,11.9,.1,20.8-7.23,19.86-16.37"/><path fill="#f4a051" d="M80.48,47.9c-5.86,6.13-15.27,6.63-21.01,1.14-5.75-5.5-5.65-14.92,.21-21.05,5.86-6.12,15.27-6.63,21.02-1.13,5.74,5.5,5.64,14.92-.22,21.04m-21.72-20.1c-6.81,7.12-6.92,18.07-.25,24.46,6.68,6.39,17.62,5.8,24.43-1.32,6.82-7.12,6.93-18.07,.25-24.46-6.67-6.39-17.61-5.8-24.43,1.32"/><path fill="#ed7100" d="M59.38,4.88c12.2-4.57,24.25,.05,26.93,10.33,2.69,10.27-5.03,22.3-17.22,26.87-12.2,4.57-24.25-.06-26.93-10.32-2.68-10.27,5.03-22.3,17.22-26.87m-11.32,3.93c-12.65,10.02-15.87,24.53-7.2,32.41,8.68,7.88,25.97,6.16,38.62-3.86,12.65-10.01,15.88-24.53,7.19-32.41-8.68-7.89-25.97-6.16-38.61,3.86"/><path fill="#231815" d="M20.54,65.15v22.67h-3.55v-11.96H3.55v11.96H0v-22.67H3.55v7.61h13.44v-7.61h3.55ZM29.07,87.83c-1.66,0-2.97-.46-3.94-1.39-.99-.93-1.48-2.12-1.48-3.58v-1.21c0-1.48,.49-2.68,1.48-3.61,.97-.95,2.28-1.42,3.94-1.42h9.26v-.09c0-1.82-1-2.72-2.99-2.72h-10.3v-3.02h10.24c2.13,0,3.76,.54,4.88,1.63,1.14,1.05,1.72,2.57,1.72,4.56v6.01c0,1.54-.52,2.75-1.57,3.64-.95,.81-2.28,1.21-4,1.21h-7.25Zm6.48-8.2h-5.62c-1.82,0-2.72,.77-2.72,2.31v.56c0,1.52,.91,2.28,2.72,2.28h5.62c1.85,0,2.78-.76,2.78-2.28v-.56c0-1.54-.93-2.31-2.78-2.31ZM52.27,70.78h3.49c2.21,0,3.95,.64,5.21,1.92,1.26,1.28,1.89,3.07,1.89,5.36v9.77h-3.55v-9.59c0-1.42-.28-2.46-.83-3.11-.69-.85-1.69-1.27-2.99-1.27h-3.02c-1.26,0-2.25,.42-2.96,1.27-.51,.65-.77,1.69-.77,3.11v9.59h-3.55v-9.77c0-2.29,.63-4.07,1.89-5.36,1.26-1.28,2.99-1.92,5.18-1.92ZM79.24,85.55c-1.26,1.52-2.83,2.28-4.71,2.28h-2.19c-1.97,0-3.54-.62-4.71-1.86-1.11-1.16-1.66-2.81-1.66-4.94v-10.24h3.52v10.27c0,1.24,.27,2.15,.8,2.72,.61,.65,1.41,.98,2.4,.98h1.54c1.01,0,1.82-.33,2.43-.98,.55-.57,.83-1.48,.83-2.72v-10.27h3.49v10.27c0,1.24,.27,2.15,.8,2.72,.61,.65,1.41,.98,2.4,.98h1.54c1.01,0,1.82-.33,2.43-.98,.55-.57,.83-1.48,.83-2.72v-10.27h3.52v10.24c0,2.13-.57,3.78-1.72,4.94-1.17,1.24-2.74,1.86-4.74,1.86h-2.16c-1.84,0-3.38-.76-4.65-2.28ZM102.92,73.86c-1.26,0-2.25,.42-2.96,1.27-.51,.65-.77,1.69-.77,3.11v9.59h-3.55v-22.73h3.55v6.72c1.03-.69,2.2-1.04,3.52-1.04h3.49c2.21,0,3.95,.64,5.21,1.92s1.89,3.07,1.89,5.36v9.77h-3.55v-9.59c0-1.42-.28-2.46-.83-3.11-.69-.85-1.69-1.27-2.99-1.27h-3.02ZM121.66,87.83c-1.66,0-2.97-.46-3.94-1.39-.99-.93-1.48-2.12-1.48-3.58v-1.21c0-1.48,.49-2.68,1.48-3.61,.97-.95,2.28-1.42,3.94-1.42h9.26v-.09c0-1.82-1-2.72-2.99-2.72h-10.3v-3.02h10.24c2.13,0,3.76,.54,4.88,1.63,1.14,1.05,1.72,2.57,1.72,4.56v6.01c0,1.54-.52,2.75-1.57,3.64-.95,.81-2.28,1.21-4,1.21h-7.25Zm6.48-8.2h-5.62c-1.82,0-2.72,.77-2.72,2.31v.56c0,1.52,.91,2.28,2.72,2.28h5.62c1.85,0,2.78-.76,2.78-2.28v-.56c0-1.54-.93-2.31-2.78-2.31Z"/></svg>`;

const HANWHA_LOGO_RULE = `
## 🏢 한화 로고 CI (필수)
**흰색/밝은 배경 슬라이드에서만** 오른쪽 상단에 한화 로고를 배치:

\`\`\`html
<div class="hanwha-ci" style="position:absolute;top:16px;right:16px;width:48px;height:32px;opacity:0.85;pointer-events:none;">
  ${HANWHA_LOGO_SVG}
</div>
\`\`\`

**절대 규칙:**
- 슬라이드 배경이 **흰색(#fff, #f8f9fa 등) 또는 밝은 색**일 때만 로고 삽입
- 슬라이드 배경이 **어두운 색, 컬러 배경, 그라디언트, 이미지**이면 **로고 넣지 말 것** (겹쳐서 안 보이거나 지저분해짐)
- position:**absolute** (해당 슬라이드 내부에만, fixed 사용 금지)
- 각 .swiper-slide 안에 개별 배치 (배경이 밝은 슬라이드만)
- 크기: width:48px (모바일), @media(min-width:768px) width:56px`;


// ──────────────────────────────────────────────
// 공통 유틸: 타이핑 인디케이터 (호출 직전)
// ──────────────────────────────────────────────
async function typing(bot) {
  return sendTyping(bot);
}

// LLM 결과물의 모바일 오버플로우·문장 잘림을 결정적으로 막는 safety CSS 주입
// LLM 이 매번 다른 클래스명·구조 써서 프롬프트 지시만으로는 100% 보장 안 됨
// → 후처리로 </head> 직전에 high-specificity 규칙 추가
function injectMobileSafetyCSS(html) {
  if (!html || !/<\/head>/i.test(html)) return html;

  const safetyCSS = `
<style id="__mobile_safety__">
/* bot-runtime 자동 주입 — LLM HTML의 모바일 오버플로우·문장 잘림 방지 */
html, body { -webkit-text-size-adjust: 100%; }

/* 1) Swiper 슬라이드: 모든 뷰포트에서 내부 스크롤 허용. flex-center 가 아니라 flex-start 로 시작 → 위부터 보임 */
.swiper, .swiper-container { width:100%; height:100%; }
.swiper-slide {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  -webkit-overflow-scrolling: touch;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: flex-start !important;
  padding: 72px 24px 48px !important;
  box-sizing: border-box !important;
}
.swiper-slide::-webkit-scrollbar { width: 3px; }
.swiper-slide::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.4); border-radius: 3px; }

/* 2) 슬라이드 직계 자식: 한국어 단어 중간 끊김 방지 + 너비 제한 */
.swiper-slide > * {
  max-width: 100% !important;
  word-break: keep-all;
  overflow-wrap: break-word;
  min-width: 0;
}

/* 3) 긴 텍스트 요소: break-word 안전망 */
.swiper-slide p,
.swiper-slide li,
.swiper-slide h1,
.swiper-slide h2,
.swiper-slide h3 {
  word-break: keep-all;
  overflow-wrap: break-word;
}

/* 4) 모바일 (≤768px): 패딩 축소 + 터치 스크롤 최적화 */
@media (max-width: 768px) {
  .swiper-slide {
    padding: 56px 16px 36px !important;
  }
  .swiper-slide p,
  .swiper-slide li {
    line-height: 1.6;
  }
}

/* 5) 아주 좁은 뷰포트 (≤375px) — 최소 가독성 */
@media (max-width: 375px) {
  .swiper-slide {
    padding: 48px 12px 28px !important;
  }
}
</style>
`;

  // 기존 __mobile_safety__ 블록 있으면 제거(중복 주입 방지)
  const cleaned = html.replace(/<style[^>]*id="__mobile_safety__"[^>]*>[\s\S]*?<\/style>\s*/gi, '');
  return cleaned.replace(/<\/head>/i, `${safetyCSS}\n</head>`);
}

// LLM 응답에서 HTML 부분만 추출 (코드블록 벗기기 + DOCTYPE 잘라내기)
function extractHtml(text) {
  let html = (text || '').trim();
  const cb = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
  if (cb) html = cb[1].trim();
  if (!html.toLowerCase().startsWith('<!doctype')) {
    const idx = html.toLowerCase().indexOf('<!doctype');
    if (idx > 0) html = html.slice(idx);
  }
  return html;
}

// 카피 JSON → 사람 읽기 쉬운 텔레그램 메시지 포맷
function formatCopyForReview(copyJson, versionLabel = 'v1') {
  if (!copyJson || !Array.isArray(copyJson.slides)) return '(카피 없음)';
  const lines = [`📝 **카피 초안 (${versionLabel}, 총 ${copyJson.slides.length}장)**`];
  if (copyJson.title) lines.push(`\n_${copyJson.title}_`);
  copyJson.slides.forEach((sl, i) => {
    const n = String(i + 1).padStart(2, '0');
    lines.push(`\n[${n}] ${sl.kind || ''}`);
    if (sl.headline) lines.push(`  🔹 ${sl.headline}`);
    if (sl.subtitle) lines.push(`  ─ ${sl.subtitle}`);
    if (sl.title) lines.push(`  📖 ${sl.title}`);
    if (sl.body) lines.push(`  ${String(sl.body).slice(0, 160)}${String(sl.body).length > 160 ? '…' : ''}`);
    if (sl.implication) lines.push(`  💡 ${sl.implication}`);
    if (Array.isArray(sl.cards) && sl.cards.length > 0) {
      sl.cards.forEach((c) => lines.push(`    • ${c.label || ''}: ${c.value || ''} — ${c.desc || ''}`));
    }
    if (Array.isArray(sl.topics) && sl.topics.length > 0) {
      lines.push(`  🏷 ${sl.topics.join(' · ')}`);
    }
  });
  return lines.join('\n');
}

// 공용 프롬프트 빌더 — Opus/GPT 공통
// opts.referenceDrafts: { opus, gpt } — A·B 참고본 (v2+ 재생성 시)
// opts.userMergeText: 사용자가 A·B 조합·수정해 던진 자유 텍스트 (최우선)
async function _buildCopyPrompt(session, opts = {}) {
  const system = await loadAgentSystem('copywriter');
  const notesBlock = (session.userNotes && session.userNotes.length > 0)
    ? `\n## 🌟 사용자 요구사항 (반드시 반영)\n${session.userNotes.map((n) => `- ${n}`).join('\n')}\n`
    : '';

  // A/B 참고본 + 사용자 머지 텍스트 블록
  let referenceBlock = '';
  if (opts.referenceDrafts?.opus || opts.referenceDrafts?.gpt) {
    referenceBlock += `\n## 📚 참고본 (지난 카피 버전 — 무엇을 유지·변경할지 판단 근거)\n`;
    if (opts.referenceDrafts.opus) {
      referenceBlock += `\n### 버전 A (Claude Opus)\n${JSON.stringify(opts.referenceDrafts.opus, null, 2)}\n`;
    }
    if (opts.referenceDrafts.gpt) {
      referenceBlock += `\n### 버전 B (GPT-5)\n${JSON.stringify(opts.referenceDrafts.gpt, null, 2)}\n`;
    }
  }
  if (opts.userMergeText) {
    referenceBlock += `\n## 🎯 사용자가 직접 만든 합본·수정 지시 (**최우선 존중 — 글자 그대로 쓸 수 있으면 그대로**)
사용자가 A·B 두 버전을 직접 보고, 본인 판단으로 발췌·조합·수정한 텍스트:

\`\`\`
${opts.userMergeText}
\`\`\`

**처리 원칙**:
1. 사용자가 문장 형태로 써준 부분 → 그 문장을 **그대로** 해당 슬라이드에 배치. 변형·각색 금지.
2. 사용자가 "A꺼 쓰되 시사점만 B 스타일로" 같은 **지시형**으로 쓴 부분 → 그 지시 따라 A·B에서 가져와 조합.
3. 사용자가 "시사점을 다른 방향으로 다시 보완" 같이 **방향 지시만** 한 부분 → 오디언스·핵심철학 기준으로 새로 써서 채움.
4. 빠진 슬라이드(cover/chapter/cta 등) → A·B 참고해서 톤 맞춰 메움.
5. 사용자 의도와 오디언스 맥락이 충돌하면 → 사용자 의도 우선.
`;
  }

  const user = `카드뉴스 카피를 슬라이드별 JSON으로 뽑으세요. 스타일과 무관한 카피 공통본.

## 컨텍스트
- 오디언스: ${session.audience}
- 노션 URL: ${session.notionUrl || '없음'}${notesBlock}${referenceBlock}

## 본문 (원본 소스)
${session.sourceText}

## 핵심 철학 (CLAUDE.md)
오디언스와 시사점은 항상 한 세트. 오디언스 없이 카피 안 쓴다. 시사점 없는 카피는 요약이지 카피 아님.

## 요구사항 (분량 규칙 — 절대 준수)
- **총 슬라이드 최대 12장** (표지 + 챕터 디바이더 + 본문 + 시사점 + CTA 다 포함해서)
- **대주제(H1 챕터)가 N개면 각 주제당 최대 3장** 규칙 적용
  예) 본문에 대주제 4개 → 4 × 3 = 12장, 3개 → 9장, 5개 이상 → 12장으로 압축
- 슬라이드마다: {kind, headline, subtitle, body, implication, data, cta_url}
- headline: 돌직구, 독자를 다음 슬라이드로 당김
- **말줄임표(...) 절대 금지**
- implication: "그래서 ${session.audience} 가 지금 뭘 해야 하는가" — 실행 가능한 구체적 액션
- 숫자·고유명사 살려서 (ARR 2,000억, GitHub 316,000★ 같은)
- 영어 키워드는 한국어 풀이 병기 (예: "Ghost Growth: 이익↑ 소득↓")
- CTA 는 홍보성 문구 금지. 메시지로 마무리

## 출력 형식 (JSON만)
\`\`\`json
{
  "title":"...",
  "slides":[
    {"kind":"cover","headline":"...","subtitle":"...","topics":["..."]},
    {"kind":"chapter","num":"01","title":"...","sub":"..."},
    {"kind":"body","headline":"...","body":"...","implication":"..."},
    {"kind":"data","headline":"...","cards":[{"label":"...","value":"...","desc":"..."}],"implication":"..."},
    {"kind":"cta","headline":"...","url":"${session.notionUrl || ''}"}
  ]
}
\`\`\``;
  return { system, user };
}

// 공용 카피 생성 (Claude Opus) — _runStyleBuild 와 handleAudienceAnswer 양쪽에서 사용
// opts: { referenceDrafts, userMergeText } — v2+ 재생성 시 A/B 참고본 + 사용자 머지 텍스트 주입
async function _generateCopyJson(session, opts = {}) {
  const { system, user } = await _buildCopyPrompt(session, opts);
  const res = await callAgent(system, user, {
    model: models.main,
    maxTokens: 8000,
    json: true,
  });
  if (!res.json || !Array.isArray(res.json.slides)) {
    throw new Error('Opus 카피 JSON 파싱 실패');
  }
  return res.json;
}

// 카피 생성 (OpenAI GPT-5) — A/B 비교용 또는 재생성용
async function _generateCopyJsonOpenAI(session, opts = {}) {
  const { system, user } = await _buildCopyPrompt(session, opts);
  const res = await callOpenAI(system, user, {
    model: models.gpt,
    maxTokens: 8000,
    json: true,
  });
  if (!res.json || !Array.isArray(res.json.slides)) {
    throw new Error('GPT 카피 JSON 파싱 실패');
  }
  return res.json;
}

// 두 버전(Opus/GPT) 동시 제시 — 파일 첨부 2개 + 비교 요약 메시지
async function _presentTwoCopyDrafts(opusJson, gptJson, versionLabel) {
  const session = getSession();
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const baseSlug = session?.slug || `cardnews-${Date.now()}`;
  const copyDir = path.join(_groupOutputDir(), ym, baseSlug, 'copy');
  await fs.mkdir(copyDir, { recursive: true });

  // 각 버전 저장 + 포맷
  const opusFormatted = formatCopyForReview(opusJson, `${versionLabel} · Opus`);
  const gptFormatted = formatCopyForReview(gptJson, `${versionLabel} · GPT`);
  const opusMdPath = path.join(copyDir, `copy-${versionLabel}-opus.md`);
  const gptMdPath = path.join(copyDir, `copy-${versionLabel}-gpt.md`);
  await fs.writeFile(opusMdPath, opusFormatted, 'utf-8');
  await fs.writeFile(gptMdPath, gptFormatted, 'utf-8');
  await fs.writeFile(path.join(copyDir, `copy-${versionLabel}-opus.json`), JSON.stringify(opusJson, null, 2), 'utf-8');
  await fs.writeFile(path.join(copyDir, `copy-${versionLabel}-gpt.json`), JSON.stringify(gptJson, null, 2), 'utf-8');

  // 비교 요약 메시지 (표지 + 첫 챕터 헤드라인 나란히)
  const opusCover = opusJson.slides?.[0] || {};
  const gptCover = gptJson.slides?.[0] || {};
  const opusFirst = opusJson.slides?.find((sl) => sl.kind === 'body' || sl.headline) || {};
  const gptFirst = gptJson.slides?.find((sl) => sl.kind === 'body' || sl.headline) || {};

  const compareMsg = `📝 **카피 두 버전 나왔어요 (${versionLabel})** — 비교해보세요.

━━ **A · Claude Opus** (총 ${opusJson.slides?.length || '?'}장) ━━
표지: ${opusCover.headline || '(없음)'}
첫 본문: ${opusFirst.headline || '(없음)'}

━━ **B · GPT-5** (총 ${gptJson.slides?.length || '?'}장) ━━
표지: ${gptCover.headline || '(없음)'}
첫 본문: ${gptFirst.headline || '(없음)'}

두 파일 첨부 드려요 — 다 열어보시고 어느 쪽으로 갈지 "**A**" 또는 "**B**" 로 답해주세요.

— 카피`;

  await sendMessage(bots.copywriter, compareMsg);
  try { await sendDocument(bots.copywriter, opusMdPath, `A · Claude Opus (${versionLabel})`); }
  catch (e) { log.error('COPY_PRESENT', 'Opus sendDocument 실패', e); }
  try { await sendDocument(bots.copywriter, gptMdPath, `B · GPT-5 (${versionLabel})`); }
  catch (e) { log.error('COPY_PRESENT', 'GPT sendDocument 실패', e); }
}

// 생성된 카피를 주현대리에게 제시 — 길면 파일 첨부, 짧으면 메시지
async function _presentCopyDraft(copyJson, versionLabel) {
  const formatted = formatCopyForReview(copyJson, versionLabel);
  const TELEGRAM_LIMIT = 4000;
  if (formatted.length <= TELEGRAM_LIMIT) {
    await sendMessage(bots.copywriter, formatted);
    return;
  }
  // 길면 파일로
  const session = getSession();
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const baseSlug = session?.slug || `cardnews-${Date.now()}`;
  const copyDir = path.join(_groupOutputDir(), ym, baseSlug, 'copy');
  await fs.mkdir(copyDir, { recursive: true });
  const mdPath = path.join(copyDir, `copy-${versionLabel}.md`);
  await fs.writeFile(mdPath, formatted, 'utf-8');
  const jsonPath = path.join(copyDir, `copy-${versionLabel}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(copyJson, null, 2), 'utf-8');
  await sendMessage(bots.copywriter, `📝 카피 초안 ${versionLabel} — 길어서 파일로 보내드려요.\n\n— 카피`);
  try { await sendDocument(bots.copywriter, mdPath, `카피 ${versionLabel}`); } catch (e) {
    log.error('COPY_PRESENT', 'sendDocument 실패', e);
  }
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
 * 최종 선택 파싱 (Sonnet) — 어느 스타일 어느 버전으로 확정/수정/되돌리기/취소인지
 * 반환: { action, finalId, finalVersion, reviseId, notes, questions, unrelated }
 *   action: 'confirm' | 'revise' | 'rollback' | 'cancel' | 'question' | 'unclear'
 */
async function parseFinalChoice(text, session, phase = 'auto') {
  const idsList = (session?.fullVersions && Object.keys(session.fullVersions)) || [];
  const versionsLine = idsList
    .map((id) => `${id}: v${(session.fullVersions[id] || []).map((x) => x.v).join(',')}`)
    .join(' / ');

  // phase 자동 판정: 세션 상태 기반
  let resolvedPhase = phase;
  if (phase === 'auto') {
    resolvedPhase = session?.state === 'awaiting_copy_approval' ? 'copy' : 'final';
  }

  const confirmRulesCopy = `- "**confirm**" (현 단계 = 카피 승인 → 아트 옵션으로 진행):
  긍정·승인 의사를 표현하는 **모든 자연어** 인식.
  키워드 예: "카피 OK" / "OK" / "ok" / "오케이" / "승인" / "진행" / "좋아" / "좋네" / "좋다" /
  "네" / "예" / "응" / "ㅇㅇ" / "가자" / "넘어가자" / "다음 단계" / "컨펌" / "통과" / "✅"
  → action="confirm"
  ⚠️ 카피 내용에 **구체적 수정 요구**(예: "3번 헤드 바꿔")가 같이 들어있으면 confirm 아님 → note_add.`;

  const confirmRulesFinal = `- "**confirm**" (현 단계 = 최종 배포 → Vercel 푸시, **엄격하게**):
  **명시적 배포 키워드만** 인정. 오직 아래 키워드 포함 시만:
  컨펌 / 확정 / 배포 / 올려 / 올리자 / 푸시 / 공개 / 공유 / publish / deploy / ✅
  예: "①로 컨펌" / "② 배포해" / "1번 확정" / "올려" / "공유해줘" / "② push"
  → final_id + action="confirm"
  ⚠️ "N번으로 하자" / "N번 좋아" / "N 선택" / "OK" 단독 등 모호 표현은 confirm 아님 → unclear (실수 방지).`;

  const system = `당신은 카드뉴스 작업 파서입니다. 완성본 여러 개를 보고 주현대리가 뭘 원하는지 분리.

**현재 단계**: ${resolvedPhase === 'copy' ? '카피 승인 대기 (체크포인트 ①.5b) — 긍정 응답 모두 confirm 으로' : '최종 배포 대기 (체크포인트 ③) — 배포 키워드 엄격'}

응답 형식 (JSON만):
\`\`\`json
{
  "action": "confirm|note_add|apply_notes|rollback|cancel|question|select_variant|unclear",
  "final_id": "①|②|③|null",
  "final_version": 2,
  "revise_id": "①|②|③|null",
  "variant": "opus|gpt|null",
  "notes": ["수정 내용"],
  "questions": ["질문"],
  "unrelated": false
}
\`\`\`

규칙 (엄격하게 적용):

${resolvedPhase === 'copy' ? confirmRulesCopy : confirmRulesFinal}

- "**note_add**" = 수정할 내용을 **메모로 누적만** 해달라 (아직 재생성 X). **기본값** — 수정 관련 메시지는 웬만하면 note_add.
  패턴:
  • "① 1페이지 문장 잘림 고쳐" / "② 3번 슬라이드 카드 간격 넓혀" / "텍스트 더 크게"
  • "**X 페이지 ~ 수정**" / "**Y가 이상함/약함/깨짐**"
  • "**헤드라인 바꿔**" / "**카피 더 강하게**" / "**이미지 빼**"
  • "**수정하고 싶은 게 있어**" — 대상 명시 없어도 note_add (notes 에 원문 담기)
  → revise_id (언급된 것) + notes (수정 내용들 — 한 메시지에 여러 건이면 다 추출)
  예: "① 1페이지 X 고쳐 3페이지 카드 간격" → revise_id="①", notes=["1페이지 X 고쳐","3페이지 카드 간격 넓혀"]

- "**apply_notes**" = 누적된 메모를 **이제 반영해서 새 버전** 만들자. 아래 명시적 트리거 필요:
  반영 / 다시 만들어 / 다시 뽑아 / v2 / 새 버전 / 재생성 / 반영해서 / 이제 적용
  예: "① 반영해" / "② 이제 v2 뽑아" / "다시 만들어줘"
  → revise_id + action="apply_notes"

- "**rollback**" = 예전 버전 재전송. 예: "① v1 다시 봐" → final_id + final_version + action="rollback"

- "**select_variant**" = 카피 A/B(Opus/GPT) 중 선택. 오직 카피 검토 단계에서만 의미 있음.
  • "A" / "Opus" / "A로 가자" / "클로드" / "왼쪽" / "첫번째" → action="select_variant", variant="opus"
  • "B" / "GPT" / "B로" / "챗지피티" / "오른쪽" / "두번째" → action="select_variant", variant="gpt"
  • **합본 지시 (베이스 명시)**: "베이스: Opus", "A 베이스", "Opus 기반으로",
    "A 유지하고 B의 X 추가" 같이 한쪽을 베이스로 명시
    → action="select_variant", variant="opus" or "gpt" (베이스로 명시된 쪽),
       notes=[사용자 메시지 전체를 통째로 넣기] (라우팅이 자동으로 합본 재생성 실행)
  • "A·B 합쳐서", "두 개 섞어서" 만 있고 베이스 명시 없으면
    → action="unclear" (A/B 중 하나 고르라 안내)

- "**cancel**" = "취소" / "리셋" / "처음부터"

- "**question**" = 순수 질문 (수정·배포 의도 없음). "이거 한국어로 나와?" / "폰트 뭐 썼어?"

- **모호하면 unclear** (특히 "N번으로 하자" 같은 애매한 표현)`;

  const prompt = `현재 완성본 (${idsList.length}개 스타일):
${versionsLine || '(없음)'}

사용자 메시지: "${text}"`;

  try {
    const { json } = await callAgent(system, prompt, { model: models.main, maxTokens: 400, json: true });
    if (json) {
      const validIds = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
      return {
        action: ['confirm', 'note_add', 'apply_notes', 'rollback', 'cancel', 'question', 'select_variant', 'unclear'].includes(json.action) ? json.action : 'unclear',
        finalId: validIds.includes(json.final_id) ? json.final_id : null,
        finalVersion: Number.isInteger(json.final_version) ? json.final_version : null,
        reviseId: validIds.includes(json.revise_id) ? json.revise_id : null,
        variant: ['opus', 'gpt'].includes(json.variant) ? json.variant : null,
        notes: Array.isArray(json.notes) ? json.notes.filter(Boolean) : [],
        questions: Array.isArray(json.questions) ? json.questions.filter(Boolean) : [],
        unrelated: !!json.unrelated,
      };
    }
  } catch {}
  return { action: 'unclear', finalId: null, finalVersion: null, reviseId: null, variant: null, notes: [], questions: [], unrelated: false };
}

/**
 * 옵션 선택 파싱 (Sonnet) — 복수 선택 + 재설계 요청 + 부가 커스터마이징 + 질문 분리
 * 반환: { choices, regenerate, regenerateIds, notes, questions, unrelated }
 *   choices: 스타일 선택 ID 배열 ['①'] 또는 ['①','③'] 또는 ['①','②','③'] (복수 허용)
 */
async function parseOptionChoice(text, session) {
  const optionsText = (session?.options || [])
    .map((o) => `${o.id}: ${o.name || ''} - 색감(${o.colors || ''}), 인터랙션(${o.interaction || ''}), 어울림(${o.fits || ''})`)
    .join('\n');
  const recommended = session?.recommendedOption || '없음';

  const system = `당신은 카드뉴스 작업 파서입니다. 사용자가 스타일 옵션 중 어느 것들을 고르는지(복수 허용) + 옵션 재설계를 원하는지 + 추가 커스터마이징을 원하는지 분리.

응답 형식 (JSON만):
\`\`\`json
{
  "choices": ["①","③"],
  "regenerate": false,
  "regenerate_ids": ["①","③"],
  "notes": ["추가 요구사항 목록"],
  "questions": ["사용자가 묻는 질문 목록"],
  "unrelated": false
}
\`\`\`

규칙:
- 선택은 **복수 허용** (주현대리가 여러 스타일 후보로 담을 수 있음)
- "1번"/"①"/"첫번째" → choices=["①"]
- "①③" / "1,3번" / "첫번째랑 세번째" / "1과 3" → choices=["①","③"]
- "셋 다" / "1·2·3 전부" / "다 해" → choices=["①","②","③"]
- "추천대로"/"편집장 대로" → choices=[편집장 추천 "${recommended}"]
- "①로 가되 색을 더 밝게" → choices=["①"], notes=["색을 더 밝게"]
- **재설계/재생성 요청**: "①과 ③을 다시 뽑아줘" / "1,3번 리디자인" / "재설계해서 보여줘" / "스타일 비슷해서 새로 만들어줘"
  → regenerate:true, regenerate_ids:["①","③"], choices:[]
  → 대상 옵션 명시 없으면 regenerate_ids:[] (= 전체 재설계)
- 재설계 요청이면서 동시에 선택도 하는 건 없음. regenerate=true 일 땐 choices=[]
- 옵션 답 전혀 없고 질문/잡담만 → choices=[], unrelated:true 또는 questions에 담기
- choices 모호하면 []`;

  const prompt = `3옵션:
${optionsText || '(옵션 없음)'}

편집장 추천: ${recommended}

사용자 메시지: "${text}"`;

  try {
    const { json } = await callAgent(system, prompt, { model: models.main, maxTokens: 500, json: true });
    if (json) {
      const validIds = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
      const regenIds = Array.isArray(json.regenerate_ids)
        ? json.regenerate_ids.filter((id) => validIds.includes(id))
        : [];
      let choices = Array.isArray(json.choices)
        ? json.choices.filter((id) => validIds.includes(id))
        : [];
      // choice(단수) 호환 — 구버전 응답 대응
      if (choices.length === 0 && validIds.includes(json.choice)) {
        choices = [json.choice];
      }
      return {
        choices,
        regenerate: !!json.regenerate,
        regenerateIds: regenIds,
        notes: Array.isArray(json.notes) ? json.notes.filter(Boolean) : [],
        questions: Array.isArray(json.questions) ? json.questions.filter(Boolean) : [],
        unrelated: !!json.unrelated,
      };
    }
  } catch {}
  return { choices: [], regenerate: false, regenerateIds: [], notes: [], questions: [], unrelated: false };
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
  // frontmatter 파싱 (notion_url 추출) — 3단계 fallback
  if (!notionUrl) {
    // 1) 정식 frontmatter — 파일 맨 앞 ---\n...\n---
    const fmMatch = sourceText.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const nm = fmMatch[1].match(/notion_url:\s*(\S+)/);
      if (nm) notionUrl = nm[1];
    }
  }
  if (!notionUrl) {
    // 2) 본문 어디서든 "notion_url: URL" 패턴 (코드 블록 안에 있어도 OK)
    const anyNotion = sourceText.match(/notion_url:\s*(https?:\/\/\S+)/i);
    if (anyNotion) notionUrl = anyNotion[1];
  }
  if (!notionUrl) {
    // 3) 본문 어디서든 notion.site / notion.so URL (주현대리가 그냥 링크만 던진 경우)
    const notionLink = sourceText.match(/https?:\/\/[^\s)`'"]*notion\.(?:site|so)[^\s)`'"]*/);
    if (notionLink) notionUrl = notionLink[0];
  }
  // URL 끝에 붙어올 수 있는 노이즈 정리 (백틱·따옴표·마크다운 구문 등)
  if (notionUrl) {
    notionUrl = notionUrl.replace(/[`'"\]\)>,.;]+$/, '');
    log.info('SOURCE', `notion_url 추출 성공: ${notionUrl.slice(0, 80)}`);
  } else {
    log.warn('SOURCE', 'notion_url 추출 실패 — CTA 슬라이드에 원문 버튼 생략');
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

  // 디자인 브랜드 선호 파싱 (예: "경영진, 토스 느낌으로" → toss 저장)
  const designPref = resolveDesignIntent(rawAnswer);
  updateSession({ audience, userNotes: allNotes, ...(designPref ? { designPreference: designPref } : {}) });

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
  await sendMessage(bots.editor, `📋 톤 브리핑\n${briefing}\n\n카피 먼저 두 버전 병렬로 뽑고(A·B 비교) 내용 합의한 뒤에 아트 옵션 갈게요.\n\n— 편집장`);

  // 카피라이터 착수 리액션
  await sendMessage(bots.copywriter, `받았어요. **Claude Opus**와 **GPT-5** 두 버전 동시에 뽑습니다 (약 60초).\n\n— 카피`);

  // 병렬 호출 (Opus + GPT) — 한쪽 실패해도 다른 쪽으로 진행
  await typing(bots.copywriter);
  log.info('COPY_DRAFT', 'dual.start — Opus + GPT parallel');
  const [opusR, gptR] = await Promise.allSettled([
    _generateCopyJson(s),
    _generateCopyJsonOpenAI(s),
  ]);
  const opusJson = opusR.status === 'fulfilled' ? opusR.value : null;
  const gptJson = gptR.status === 'fulfilled' ? gptR.value : null;
  log.info('COPY_DRAFT', `dual.done opus=${opusJson ? 'ok' : 'fail'} gpt=${gptJson ? 'ok' : 'fail'}`);

  if (!opusJson && !gptJson) {
    log.error('COPY_DRAFT', '양쪽 LLM 모두 실패', opusR.reason || gptR.reason);
    await sendMessage(
      bots.editor,
      `⚠️ 카피 생성 실패 (양쪽 LLM 모두): ${String((opusR.reason || gptR.reason)?.message || '').slice(0, 150)}. 소스 다시 던져주세요.\n\n— 편집장`,
    );
    resetSession();
    return;
  }

  const baseSlug = s.slug || `cardnews-${Date.now()}`;

  // 둘 다 성공 → A/B 제시
  if (opusJson && gptJson) {
    updateSession({
      state: STATES.AWAITING_COPY_APPROVAL,
      copyDrafts: { opus: opusJson, gpt: gptJson },
      copyDraft: null,
      chosenProvider: null,
      copyRevCount: 1,
      copyApproved: false,
      slug: baseSlug,
    });
    log.state(STATES.AWAITING_AUDIENCE, STATES.AWAITING_COPY_APPROVAL, `copy.v1 A/B opus=${opusJson.slides.length} gpt=${gptJson.slides.length}`);

    await _presentTwoCopyDrafts(opusJson, gptJson, 'v1');

    await sendMessage(
      bots.editor,
      `@주현대리 카피 **두 버전** (A · Opus / B · GPT-5) 받으셨어요.

🔍 **비교 체크**
  ✓ 헤드라인 방향 (돌직구·임팩트)
  ✓ 시사점: "${audience} 이 지금 뭘 해야 하는가" 명확한지
  ✓ 슬라이드 개수와 순서
  ✓ 데이터·숫자 강조

👉 먼저 **A / B 중 하나** 골라주세요: "**A**" / "**B**" / "**Opus**" / "**GPT**"
선택 후 수정 메모 쌓고 → "반영해" (v2) → "카피 OK" (아트 단계로) 순서로 진행.

— 편집장 (체크포인트 ①.5a — 버전 선택)`,
    );
    return;
  }

  // 한쪽만 성공 → 자동 채택
  const chosen = opusJson ? 'opus' : 'gpt';
  const chosenJson = opusJson || gptJson;
  const failedSide = opusJson ? 'GPT-5' : 'Claude Opus';

  updateSession({
    state: STATES.AWAITING_COPY_APPROVAL,
    copyDrafts: { opus: opusJson, gpt: gptJson },  // 하나는 null
    copyDraft: chosenJson,
    chosenProvider: chosen,
    copyRevCount: 1,
    copyApproved: false,
    slug: baseSlug,
  });
  log.state(STATES.AWAITING_AUDIENCE, STATES.AWAITING_COPY_APPROVAL, `copy.v1 single=${chosen} (${failedSide} failed)`);

  // 저장
  const now2 = new Date();
  const ym2 = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}`;
  const copyDir = path.join(_groupOutputDir(), ym2, baseSlug, 'copy');
  await fs.mkdir(copyDir, { recursive: true });
  await fs.writeFile(path.join(copyDir, `copy-v1-${chosen}.json`), JSON.stringify(chosenJson, null, 2), 'utf-8');

  await sendMessage(bots.copywriter, `⚠️ ${failedSide} 버전은 실패해서 ${chosen === 'opus' ? 'Claude Opus' : 'GPT-5'} 버전 하나로 진행해요.\n\n— 카피`);
  await _presentCopyDraft(chosenJson, 'v1');
  await sendMessage(
    bots.editor,
    `@주현대리 카피 초안 (v1, 총 ${chosenJson.slides.length}장).

✏️ 수정 메모 쌓고 "반영해" → v2. 만족이면 "카피 OK" → 아트 단계.

— 편집장 (체크포인트 ①.5)`,
  );
}

// ──────────────────────────────────────────────
// 2b) 아트 3옵션 제안 + 미리보기 생성 (카피 승인 후 호출)
// ──────────────────────────────────────────────
export async function proposeArtOptions() {
  const s = getSession();
  if (!s) return;
  if (!s.copyDraft) {
    await sendMessage(bots.editor, `⚠️ 카피가 없어요. 소스 다시 주세요.\n\n— 편집장`);
    return;
  }

  const audience = s.audience;
  const editorSystem = await loadAgentSystem('editor');

  await sendMessage(bots.artDirector, `받았어요, 편집장. 카피 보고 3가지 가져옵니다. 잠깐만요.\n\n— 아트`);

  // 아트디렉터 3옵션 생성 (카피 기반 + 브랜드 카탈로그 + Three.js 레퍼런스)
  await typing(bots.artDirector);
  const design = await loadCurrentDesign();
  const catalog = await buildBrandCatalog();
  const artSystem = await loadAgentSystem('art-director');
  const userNotesText = (s.userNotes && s.userNotes.length > 0)
    ? `\n주현대리 추가 요구:\n${s.userNotes.map((n) => `- ${n}`).join('\n')}\n`
    : '';

  // 사용자 디자인 선호 (세션에 저장된 것)
  const designPref = s.designPreference;
  let designPrefText = '없음 — 카피 톤/오디언스에 맞게 자유롭게 선택';
  if (designPref && designPref.requestedBrands?.length > 0) {
    designPrefText = `사용자 지정: ${designPref.requestedBrands.join(' + ')}${designPref.mixMode ? ' (믹스)' : ''}`;
  }

  const copySummary = JSON.stringify(s.copyDraft, null, 2).slice(0, 6000);
  const artPrompt = `카드뉴스 카피가 이미 확정됐어. 이 카피의 **톤·구조·강조 포인트**에 최적화된 디자인×인터랙션 3옵션을 JSON으로만. 자연어 설명 일체 금지.

오디언스: ${audience}
${userNotesText}

## 🎨 사용 가능한 디자인 레퍼런스 라이브러리 (${catalog.cards.length}개 브랜드)
아래 카탈로그에서 각 옵션에 어울리는 브랜드를 골라. reference_brands 에 명시하면 HTML 생성 시 해당 브랜드의 **실제 색상·폰트·컴포넌트 규격**이 자동으로 적용됨.

\`\`\`
brand | category | colors | mood
${catalog.summary}
\`\`\`

## 사용자 디자인 선호
${designPrefText}
${designPref?.requestedBrands?.length > 0 ? '→ 최소 1개 옵션에 이 브랜드를 반영할 것.' : ''}

## 기본 스타일 참고: ${design.name}
${design.content.slice(0, 600)}

확정 카피 (스타일은 이 내용을 담는 그릇):
${copySummary}

---

**출력 형식 (이 JSON 블록 하나만. 앞/뒤 아무 설명 없이):**

\`\`\`json
{
  "analysis": "카피 분석 2~3줄 (150자 내외). 카피 톤, 슬라이드 개수, 숫자 강조 여부, 시사점 위치 등.",
  "intro_line": "발화 시작 문구 (예: '카피 보니까 이런 특성이 있어서 10가지 방향 가져왔어.')",
  "options": [
    {
      "id": "①",
      "name": "감성적 이름 (예: 새벽 3시 블룸버그 터미널 × Swiss Grid)",
      "reference_brands": ["stripe", "linear.app"],
      "colors": "색감 (레퍼런스 브랜드의 실제 hex 코드 활용)",
      "layout": "레이아웃",
      "interaction": "인터랙션 (Three.js/GSAP/CSS 3D 등 구체적 기법)",
      "fits": "카피 특성과 매칭 이유"
    },
    {"id": "②", ...}, {"id": "③", ...}, {"id": "④", ...}, {"id": "⑤", ...},
    {"id": "⑥", ...}, {"id": "⑦", ...}, {"id": "⑧", ...}, {"id": "⑨", ...}, {"id": "⑩", ...}
  ],
  "outro_line": "마무리 한 줄"
}
\`\`\`

규칙:
- JSON 블록 하나만. 앞뒤 아무 설명 없이.
- options 정확히 **10개**. id는 ①~⑩ 유니코드.
- **reference_brands**: 위 카탈로그에서 영감 받은 브랜드 1~2개 (영문 소문자, 카탈로그 name 그대로). 3개 옵션이 **서로 다른** 브랜드를 참조해야 함.
- 아트 톤(ENTP, 조수용+배민 디자인팀)으로 자연스럽게 (JSON 필드 텍스트 안에서).

## ⚠️ 다양성 강제 — 매번 새로운 조합 (반복 금지)

**절대 금지**: "Stripe 다크 대시보드 / Apple 화이트 키노트 / WIRED 골드 매거진" 조합을 반복하는 것.
이 3개 조합은 이미 여러 번 나왔음. **완전히 새로운** 색감·레이아웃·레퍼런스로 만들어라.

3개 옵션은 다음 4가지 축이 **모두 서로 달라야** 함:
1. **색감 톤**: 3개가 전부 다른 톤. 다크만 3개 ❌ 화이트만 3개 ❌. 그라디언트, 파스텔, 네온, 레트로, 모노크롬 등 자유롭게. **카탈로그의 실제 hex 코드를 참고**하되, 그대로 쓸 필요 없이 영감으로 활용.
2. **레이아웃**: 카드 그리드 / 전면 타이포 / 매거진 컬럼 / 대시보드 / 신문형 / 카드 스택 / 세로 스크롤 등 **다양한 구조 풀**에서 골라.
3. **인터랙션**: CSS 애니메이션·JS 효과를 **서로 다르게**. 아래 풀에서 골라:
   - 기본: 카운터업 / fade-in 순차 / hover glow / 슬라이드 전환
   - 중급: parallax scroll / reveal on scroll / morph SVG / typed 타이핑 / 카드 flip
   - **고급 3D/애니메이션** (CDN 활용 — https://threejs.org/examples/ 참고):
     · **Three.js 배경**: 파티클 웨이브(webgl_points_waves) / 쉐이더 그라디언트(webgl_shader) / 네트워크 그래프(webgl_buffergeometry_drawrange) / 기하 회전(webgl_geometries) / 블룸 후처리(webgl_postprocessing_unreal_bloom)
     · **Three.js 오브젝트**: 3D 텍스트(webgl_geometry_text) / 반사 구체(webgl_materials_envmaps) / 인터랙티브 큐브(webgl_interactive_cubes) / 지구본(webgl_materials_normalmap + 텍스처)
     · **Three.js 전환**: 슬라이드↔카메라 연동(camera.position.lerp) / 오브젝트 모핑(webgl_morphtargets) / 안개 밀도 변화 / RGB shift 후처리
     · **CSS 3D Transform**: perspective + rotateX/Y/Z 카드 틸트 / 큐브 전환
     · **Glassmorphism + Three.js**: backdrop-filter:blur 반투명 카드 + Three.js 배경 canvas 레이어링
     · **GSAP**: 프로급 타임라인(gsap CDN) + ScrollTrigger + 카운터업
     · **Lottie**: 벡터 아이콘 애니메이션 (lottie-web CDN)
     · **SVG line-draw**: stroke-dashoffset 으로 차트/아이콘 그려지는 효과
   - 한 옵션에 인터랙션 2~3개 조합. **3개 옵션 중 최소 1개는 Three.js 3D 효과 포함 필수**

**이번 시도 시드**: ${Date.now() % 997} (이 숫자에서 영감 — 직접적으로 쓸 필요 없지만 이전 제안과 같아지지 않도록 상상력의 출발점으로 활용)

**자체 검증**: 3개 options 의 colors 를 나란히 읽었을 때 "아 이거 저번이랑 같네" 느낌이면 **실패** → 다시 써라.`;

  let artJson;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await callAgent(artSystem, artPrompt, {
        model: models.main,
        maxTokens: 12000,
        json: true,
      });
      artJson = r.json;
      if (artJson && Array.isArray(artJson.options) && artJson.options.length >= 5) break;
      if (attempt < 2) { await typing(bots.artDirector); }
    } catch (e) {
      if (attempt === 2) {
        await sendMessage(bots.editor, `⚠️ @주현대리 아트 쪽 에러로 3옵션 생성 실패. 카피 단계에서 다시 "승인" 해주세요.\n\n— 편집장`);
        updateSession({ state: STATES.AWAITING_COPY_APPROVAL });
        return;
      }
    }
  }

  if (!artJson || !Array.isArray(artJson.options) || artJson.options.length < 2) {
    await sendMessage(bots.editor, `⚠️ 아트 3옵션 파싱 실패. 다시 "카피 OK" 주시면 재시도할게요.\n\n— 편집장`);
    updateSession({ state: STATES.AWAITING_COPY_APPROVAL });
    return;
  }

  // Telegram 메시지 조립
  const parts = [];
  if (artJson.intro_line) parts.push(artJson.intro_line);
  parts.push('');
  parts.push('📊 카피 분석');
  parts.push(artJson.analysis);
  parts.push('');
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
  await sendMessage(bots.artDirector, `🎨 ${parts.join('\n')}`);

  await sendMessage(bots.editor, `👍 아트, 좋네요. 미리보기 만들게요.\n\n— 편집장`);

  // 미리보기 생성 (카피 사용 — 아래 수정)
  await sendMessage(
    bots.editor,
    `📐 아트가 옵션마다 미리보기(3슬라이드씩) 만드는 중이에요. 30~60초. 실제 카피 헤드라인 그대로 들어갑니다.\n\n— 편집장`,
  );

  let previews = [];
  try {
    previews = await generateOptionPreviews(s, artJson.options, audience);
    if (previews.length > 0) {
      await sendMessage(bots.artDirector, `🎨 미리보기 ${previews.length}개 첨부 + 갤러리에서 비교:\n👉 http://localhost:4000\n\n— 아트`);
      for (const p of previews) {
        try { await sendDocument(bots.artDirector, p.path, `${p.id} ${p.name}`); }
        catch (e) { log.error('PREVIEW_ATTACH', `sendDocument 실패 id=${p.id}`, e); }
      }
      updateSession({ previewAttachments: previews });
    }
  } catch (e) {
    log.error('PREVIEW', '미리보기 생성 실패', e);
    await sendMessage(bots.editor, `⚠️ 미리보기 생성 일부 실패 (${String(e.message || e).slice(0, 150)}). 글 옵션 설명만 보고 선택해도 OK.\n\n— 편집장`);
  }

  // 편집장 추천 정리
  await typing(bots.editor);
  const options = artJson?.options || [];
  const summaryPrompt = `아트가 3옵션 제안. 주현대리께 추천 메시지 작성.

옵션:
${JSON.stringify(options, null, 2)}

오디언스: ${audience}

요구사항:
- 오디언스 기준으로 **딱 하나** 추천 + 한 줄 이유
- 추천을 "추천: ①" 같이 명시
- "①~⑩ 중 어떤 걸로?" 질문 (복수 킵도 OK 한 줄 추가)
- "갤러리(localhost:4000)에서 미리보기 비교 가능" 한 줄 추가
- 3~6줄
- 끝에 "— 편집장 (체크포인트 ②)"`;

  const { text: summaryMsg } = await callAgent(editorSystem, summaryPrompt, {
    model: models.main,
    maxTokens: 400,
  });
  const recMatch = summaryMsg.match(/추천[\s:]*([①②③④⑤⑥⑦⑧⑨⑩])/);
  const recommendedOption = recMatch ? recMatch[1] : null;
  await sendMessage(bots.editor, summaryMsg);

  // 갤러리 URL 안내
  await sendMessage(
    bots.artDirector,
    `🎨 프리뷰 갤러리에서 ${options.length}개 디자인을 비교해보세요:\n👉 http://localhost:4000\n\nDesktop/Mobile 뷰 전환도 가능해요.\n\n— 아트`,
  );

  updateSession({
    state: STATES.AWAITING_OPTION,
    options,
    recommendedOption,
  });
  log.state(STATES.AWAITING_COPY_APPROVAL, STATES.AWAITING_OPTION, `options=${options.length}`);
}

// ──────────────────────────────────────────────
// 3) 스타일 선택(복수) → 카피 1회 + 스타일별 풀 HTML 병렬 생성 → Telegram 첨부
// ──────────────────────────────────────────────
export async function handleStyleChoices(choices) {
  const s = getSession();
  if (!s) return;
  if (!choices || choices.length === 0) return;

  const prevState = s.state;
  updateSession({ state: STATES.BUILDING_FULLS, styleChoices: choices });
  log.state(prevState, STATES.BUILDING_FULLS, `choices=${choices.join('·')}`);

  const label = choices.join('·');
  await sendMessage(
    bots.editor,
    `좋아요 @주현대리, **${label}** 풀 제작 들어갑니다.

순서:
  1️⃣ 카피 작성 (공통)
  2️⃣ 스타일별 HTML 병렬 생성
  3️⃣ **아트 셀프 QA** — 문장 잘림·챕터 인디케이터·타이포 스케일·인터랙션 자체 점검
  4️⃣ **편집장 최종 체크** — 이슈 있으면 아트 재수정 후 첨부

4~6분 걸려요. 다 끝나면 완성본 첨부로 보내드릴게요.

— 편집장`,
  );
  await sendMessage(
    bots.copywriter,
    `카피 먼저 뽑고 아트 ${choices.length}개 스타일에 넘길게요.\n\n— 카피`,
  );

  const typingInterval = setInterval(() => {
    typing(bots.copywriter).catch(() => {});
    typing(bots.artDirector).catch(() => {});
  }, 4000);

  try {
    await _runStyleBuild(choices, typingInterval);
  } catch (e) {
    clearInterval(typingInterval);
    log.error('BUILDING_FULLS', `handleStyleChoices 실패 choices=${label}`, e);
    const cur = getSession();
    if (cur) {
      updateSession({ state: STATES.AWAITING_OPTION });
      log.state(STATES.BUILDING_FULLS, STATES.AWAITING_OPTION, 'error recovery');
    }
    await sendMessage(
      bots.editor,
      `⚠️ @주현대리 풀 제작 중 에러: ${String(e.message || e).slice(0, 160)}\n\n스타일 재선택 또는 "취소" 가능.\n\n— 편집장`,
    ).catch(() => {});
  }
}

async function _runStyleBuild(choices, typingInterval) {
  const s = getSession();
  if (!s) throw new Error('세션 사라짐');

  // 선택된 옵션들만 필터
  const selectedOptions = (s.options || []).filter((o) => choices.includes(o.id));
  if (selectedOptions.length === 0) throw new Error(`선택된 스타일 ${choices.join('·')} 과 매칭되는 옵션 없음`);

  // ── 1) 카피는 AWAITING_COPY_APPROVAL 단계에서 승인됐어야 함 — 재사용 ───
  //     (레거시 세션 호환: copyDraft 없으면 인라인 생성)
  let copyJson;
  if (s.copyDraft && Array.isArray(s.copyDraft.slides)) {
    copyJson = s.copyDraft;
    log.info('BUILDING_FULLS', `copy.reuse v=${s.copyRevCount || 1} slides=${copyJson.slides.length}`);
    await sendMessage(
      bots.copywriter,
      `📝 승인받은 카피 v${s.copyRevCount || 1} (${copyJson.slides.length}장) 그대로 넘깁니다.\n\n— 카피`,
    );
  } else {
    log.warn('BUILDING_FULLS', 'copyDraft 없음 — 레거시 세션으로 인라인 생성');
    await sendMessage(bots.copywriter, `카피 먼저 뽑을게요 (카피 승인 단계 건너뛴 상태 — 다음 편부터는 승인 먼저).\n\n— 카피`);
    copyJson = await _generateCopyJson(s);
    updateSession({ copyDraft: copyJson, copyRevCount: 1, copyApproved: true });
    log.info('BUILDING_FULLS', `copy.inline.ok slides=${copyJson.slides.length}`);
  }

  // ── 2) 스타일별 풀 HTML 병렬 생성 ─────────────────────
  const design = await loadCurrentDesign();
  const artSystem = await loadAgentSystem('art-director');
  // Three.js 레퍼런스 로드 (인터랙션 기법 참고용)
  let threejsRef = '';
  try {
    const tjPath = path.join(paths.designsDir, 'threejs.md');
    const tjContent = await fs.readFile(tjPath, 'utf-8');
    // 조합 프리셋 섹션만 추출 (토큰 절약)
    const presetMatch = tjContent.match(/## E\. 조합 프리셋[\s\S]*/);
    threejsRef = presetMatch ? presetMatch[0].slice(0, 1500) : tjContent.slice(0, 1500);
  } catch { /* threejs.md 없으면 무시 */ }

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const baseSlug = s.slug || `cardnews-${Date.now()}`;
  const fullsDir = path.join(_groupOutputDir(), ym, baseSlug, 'fulls');
  await fs.mkdir(fullsDir, { recursive: true });

  const editorSystemForQA = await loadAgentSystem('editor');

  const buildTasks = selectedOptions.map(async (opt) => {
    const safeId = opt.id === '①' ? '1' : opt.id === '②' ? '2' : opt.id === '③' ? '3' : String(opt.id).replace(/[^0-9]/g, '') || 'x';

    // ── A) HTML v0 생성 ───────────────────────────────
    // reference_brands 에서 실제 DESIGN.md 로드
    let brandRefBlock = `## 기본 디자인 참고: ${design.name}\n${design.content.slice(0, 800)}`;
    const refBrands = opt.reference_brands || [];
    if (refBrands.length > 0) {
      const brandSections = [];
      for (const bName of refBrands.slice(0, 2)) {
        const bd = await loadBrandDesign(bName);
        if (bd) brandSections.push(`### ${bd.name} (${bd.source})\n${bd.content.slice(0, 4000)}`);
      }
      if (brandSections.length > 0) {
        brandRefBlock = `## 디자인 레퍼런스 (이 브랜드의 실제 색상·폰트·컴포넌트 값을 적극 활용)\n${brandSections.join('\n\n')}`;
      }
    }

    const htmlPrompt = `카드뉴스 풀 HTML (스타일만 다름 — 카피는 고정). 한 파일 완성본.

## 이 옵션의 스타일 정체성
- 이름: ${opt.name}
- 색감: ${opt.colors}
- 레이아웃: ${opt.layout}
- 인터랙션: ${opt.interaction}
- 어울림: ${opt.fits}
- 참조 브랜드: ${refBrands.join(', ') || design.name}

${brandRefBlock}

${threejsRef ? `## Three.js 인터랙션 레퍼런스 (CDN 활용 가능)\n${threejsRef}` : ''}

## 카피 (공통 — 이걸 슬라이드로 렌더링)
${JSON.stringify(copyJson, null, 2)}

## 요구사항
1. **Swiper.js 11** vertical fade, 키보드/휠/터치
2. Pretendard Variable + JetBrains Mono
3. **PC 뷰** (1280px+): 여백·그리드·타이포 PC 최적화
4. **모바일 뷰** (375~480px): clamp()로 자동 reflow, 터치 스와이프
5. 숫자 카운터업 (data-count 속성)
6. 상단 진행바 + 슬라이드 카운터 (01 / ${copyJson.slides.length})
7. 위 스타일을 **정확히** 적용 (색·레이아웃·인터랙션 설정값)
8. 인터랙션은 설정한 것 **반드시 작동** (CSS + JS 모두 구현)
9. file:// 에서도 작동 (CDN 외부 리소스 OK). 사용 가능한 CDN:
    - Swiper.js 11: \`https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js\`
    - Three.js: \`https://cdn.jsdelivr.net/npm/three@latest/build/three.min.js\` (3D 배경·파티클·기하 효과)
    - GSAP + ScrollTrigger: \`https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js\` (프로급 애니메이션)
    - Lottie: \`https://cdn.jsdelivr.net/npm/lottie-web@5/build/player/lottie.min.js\` (벡터 애니메이션)
    - Pretendard Variable, JetBrains Mono (폰트 CDN — 기존 그대로)
10. **마지막 슬라이드 CTA — 실제 클릭 가능하게**:
    ${s.notionUrl
      ? `URL: ${s.notionUrl}
    반드시 \`<a href="${s.notionUrl}" target="_blank" rel="noopener">원문 보기</a>\` 형태의 **실제 anchor 태그**로 구현.
    스타일링은 자유지만 href 속성에 위 URL 정확히 들어가야 함. 텍스트만 박지 말 것.`
      : `URL 없음 → CTA 버튼 자체를 **생략** (빈 슬라이드 피하고 싶으면 "감사합니다" 같은 클로징 메시지로 대체)`}

${HANWHA_LOGO_RULE}

## ⚠️ 품질 체크리스트 (이거 위반하면 안 됨)

### A. 문장 잘림 금지
- \`.swiper-slide\` 는 \`overflow-y:auto\` (내부 스크롤), \`overflow:hidden\` 절대 사용 금지
- 긴 텍스트가 있는 슬라이드는 max-height:calc(100vh - 120px) + 내부 스크롤 허용
- \`word-break:keep-all\` + \`overflow-wrap:break-word\` 한국어 단어 중간 끊김 방지
- 카드·implication·본문 영역 \`min-width:0\` 지정 (flex overflow 방지)

### B. 챕터 인디케이터 (필수)
- 상단 바에 현재 챕터 이름을 **항상 표시** (슬라이드 카운터 옆이나 별도 영역)
- 챕터 전환 시 제목이 페이드/슬라이드로 업데이트
- 본문이 "챕터 1 / AI 패러다임" 같은 형태면 chapter 슬라이드의 \`data-chapter\` 속성 파싱해서 상단 고정
- 챕터 없이 본문만이어도 "섹션 X / N" 같은 형태로 소속 영역 표시

### C. 타이포 스케일 통일
- **CSS 변수**로 타이포 정의: \`--fs-xs, --fs-sm, --fs-md, --fs-lg, --fs-xl, --fs-2xl\`
- 각 슬라이드 내 h1/h2/h3/p/small 은 변수만 참조 (인라인 픽셀 금지)
- clamp() 값 통일: 예) \`--fs-md:clamp(14px,1.6vw,15px)\`
- 슬라이드마다 같은 역할 텍스트(헤드라인끼리, 본문끼리)는 같은 변수 사용

### D. 인터랙션 실제 작동 확인
- hover/카운터업/fade-in 은 CSS \`@keyframes\` 와 JS 이벤트 리스너 **둘 다** 구현
- \`Swiper.on('slideChangeTransitionEnd')\` 에서 활성 슬라이드 애니메이션 트리거
- data-count 속성 있으면 IntersectionObserver 또는 slideChange 로 반드시 카운트업

12. 코드 블록(\`\`\`) 금지. <!DOCTYPE 부터 </html> 까지만.`;

    log.info('BUILDING_FULLS', `html.start id=${opt.id} name="${opt.name}"`);
    const r = await callAgent(artSystem, htmlPrompt, {
      model: models.heavy,
      maxTokens: 16000,
    });
    let html = extractHtml(r.text);

    // ── B) 아트 셀프 QA (v0 → v0.1) ───────────────────
    log.info('BUILDING_FULLS', `qa.art.start id=${opt.id}`);
    const artQAPrompt = `방금 네가 만든 HTML이야. 아트 관점에서 체크해서 **수정된 HTML 한 파일** 반환해.

## 체크리스트 (하나씩 검사 — 발견되면 HTML 직접 고쳐)
1. **문장 잘림**: \`.swiper-slide\` 에 overflow:hidden 있으면 overflow-y:auto 로. word-break:keep-all 누락 슬라이드 있는지. 긴 텍스트가 뷰포트 아래로 짤리면 max-height + 내부 스크롤로 해결.
2. **챕터 인디케이터**: 상단 바에 현재 챕터명 계속 보이는지. 슬라이드 전환 시 챕터명 업데이트 JS 있는지. 없으면 추가.
3. **타이포 스케일**: 전체 글자 크기 용도별(h1/h2/h3/p/small)로 통일돼 있나. 슬라이드마다 제각각이면 CSS 변수로 정리.
4. **인터랙션 작동**: 카운터업 IntersectionObserver / slideChange 이벤트 구현됐나. hover CSS 없으면 추가. fade-in keyframe 정의됐나.

## 기존 HTML
${html.slice(0, 15000)}

## 출력
수정된 완성본 HTML 한 파일. <!DOCTYPE 부터 </html>. 코드블록 X. 설명 X.
수정할 게 없으면 원본 그대로 반환해도 됨.`;

    try {
      const qaRes = await callAgent(artSystem, artQAPrompt, {
        model: models.heavy,
        maxTokens: 16000,
      });
      const qaHtml = extractHtml(qaRes.text);
      if (qaHtml && qaHtml.toLowerCase().includes('<!doctype') && qaHtml.length > 1000) {
        html = qaHtml;
        log.info('BUILDING_FULLS', `qa.art.ok id=${opt.id} bytes=${qaHtml.length}`);
      } else {
        log.warn('BUILDING_FULLS', `qa.art.skip id=${opt.id} invalid_output`);
      }
    } catch (e) {
      log.warn('BUILDING_FULLS', `qa.art.fail id=${opt.id} ${e.message}`);
      // QA 실패해도 원본은 사용
    }

    // ── C) 편집장 체크 (approve | issues) ─────────────
    log.info('BUILDING_FULLS', `qa.editor.start id=${opt.id}`);
    const editorCheckPrompt = `아트가 완성한 HTML 검수. 배포 가능한지 아트 관점 QA 체크 후 판단.

## 카피 (기준)
${JSON.stringify(copyJson, null, 2).slice(0, 3000)}

## 완성된 HTML
${html.slice(0, 15000)}

## 체크 기준
- 카피의 모든 슬라이드가 HTML 에 반영됐나 (빠진 슬라이드 없는지)
- 문장 잘림 방지 CSS 가 적용됐나 (overflow, word-break)
- 챕터 인디케이터가 상단에 고정돼 있고 슬라이드마다 업데이트되나
- 타이포가 CSS 변수로 통일돼 있나
- 인터랙션(카운터업/fade/hover)이 CSS·JS 둘 다 구현됐나
- HTML 파싱 에러 없나 (닫히지 않은 태그 등)

## 응답 (JSON만)
\`\`\`json
{
  "approve": true,
  "issues": ["구체적 이슈 리스트 (approve=false 일 때)"]
}
\`\`\`
approve=true 면 issues=[] 로.`;

    let editorApproved = true;
    let editorIssues = [];
    try {
      const checkRes = await callAgent(editorSystemForQA, editorCheckPrompt, {
        model: models.main,
        maxTokens: 800,
        json: true,
      });
      if (checkRes.json) {
        editorApproved = !!checkRes.json.approve;
        editorIssues = Array.isArray(checkRes.json.issues) ? checkRes.json.issues.filter(Boolean) : [];
      }
      log.info('BUILDING_FULLS', `qa.editor.ok id=${opt.id} approve=${editorApproved} issues=${editorIssues.length}`);
    } catch (e) {
      log.warn('BUILDING_FULLS', `qa.editor.fail id=${opt.id} ${e.message}`);
    }

    // ── D) 편집장이 issues 플래그했으면 아트 재수정 (1회) ──
    if (!editorApproved && editorIssues.length > 0) {
      log.info('BUILDING_FULLS', `qa.refix.start id=${opt.id} issues=${editorIssues.length}`);
      const refixPrompt = `편집장이 네 HTML 에서 아래 이슈 발견. 수정한 완성본 HTML 반환해.

## 편집장 지적
${editorIssues.map((i) => `- ${i}`).join('\n')}

## 현재 HTML
${html.slice(0, 15000)}

## 출력
수정된 완성본 HTML 한 파일. <!DOCTYPE 부터 </html>. 코드블록 X. 설명 X.`;

      try {
        const refixRes = await callAgent(artSystem, refixPrompt, {
          model: models.heavy,
          maxTokens: 16000,
        });
        const refixHtml = extractHtml(refixRes.text);
        if (refixHtml && refixHtml.toLowerCase().includes('<!doctype') && refixHtml.length > 1000) {
          html = refixHtml;
          log.info('BUILDING_FULLS', `qa.refix.ok id=${opt.id} bytes=${refixHtml.length}`);
        }
      } catch (e) {
        log.warn('BUILDING_FULLS', `qa.refix.fail id=${opt.id} ${e.message}`);
      }
    }

    // ── E) 버전 저장 ──────────────────────────────────
    const cur = getSession() || s;
    const existingList = (cur.fullVersions && cur.fullVersions[opt.id]) || [];
    const version = existingList.length + 1;
    // 모바일 오버플로우·문장 잘림 safety CSS 결정적 주입
    html = injectMobileSafetyCSS(html);

    const fileName = `full-0${safeId}-v${version}.html`;
    const filePath = path.join(fullsDir, fileName);
    await fs.writeFile(filePath, html, 'utf-8');

    log.info('BUILDING_FULLS', `html.ok id=${opt.id} v=${version} path=${fileName}`);
    return { id: opt.id, name: opt.name, version, path: filePath, editorApproved, editorIssues };
  });

  const builtList = [];
  for (const t of buildTasks) {
    try {
      builtList.push(await t);
    } catch (e) {
      log.error('BUILDING_FULLS', 'html.fail', e);
    }
  }
  clearInterval(typingInterval);

  if (builtList.length === 0) {
    throw new Error('풀 HTML 전부 생성 실패');
  }

  // ── 3) 세션의 fullVersions 업데이트 ───────────────────
  const curSession = getSession();
  const newVersions = { ...(curSession?.fullVersions || {}) };
  for (const b of builtList) {
    if (!newVersions[b.id]) newVersions[b.id] = [];
    newVersions[b.id].push({ v: b.version, path: b.path, builtAt: Date.now() });
  }
  updateSession({
    fullVersions: newVersions,
    state: STATES.AWAITING_FINAL_CHOICE,
    slug: baseSlug,
  });
  log.state(STATES.BUILDING_FULLS, STATES.AWAITING_FINAL_CHOICE, `built=${builtList.length}`);

  // ── 4) 파일 첨부 전송 ─────────────────────────────────
  const qaSummary = builtList
    .map((b) => `${b.id} ${b.editorApproved ? '✅' : '⚠️ ' + (b.editorIssues || []).length + '건 수정'}`)
    .join(' · ');
  await sendMessage(
    bots.artDirector,
    `🎨 풀 완성 (${builtList.length}개). QA: ${qaSummary}\n첨부로 보내드려요 — 다 열어보시고 비교해주세요.\n\n— 아트`,
  );
  for (const b of builtList) {
    try {
      await sendDocument(bots.artDirector, b.path, `${b.id} ${b.name} (v${b.version})`);
    } catch (e) {
      log.error('BUILDING_FULLS', `sendDocument 실패 id=${b.id}`, e);
    }
  }

  // ── 5) 편집장 체크포인트 ③ — 검수 유도 ───────────────
  const listLine = builtList.map((b) => `${b.id} ${b.name} — v${b.version}`).join('\n  ');
  await sendMessage(
    bots.editor,
    `@주현대리 완성본 ${builtList.length}개 첨부 드렸어요:
  ${listLine}

🔍 **배포 전 꼭 체크** — 하나씩 열어서:
  ✓ 텍스트 (문장 잘림 / 오타 / 어색한 표현)
  ✓ 레이아웃 (여백 / 카드 배치 / 슬라이드 순서)
  ✓ 인터랙션 (hover / 카운터업 / 슬라이드 전환)
  ✓ PC + 모바일 둘 다

✏️ **수정은 장표별로 자유롭게 쌓아두세요** (재생성 안 함):
  • "**① 1페이지 헤드라인 문장 잘림 고쳐**"
  • "**3페이지 카드 간격 넓혀**"
  • "**5페이지 이미지 빼고 텍스트만**"
  → 한 건씩 보내도 되고, 한 메시지에 여러 건 몰아서 보내도 됨
  → 메모로만 쌓여요. 시간·토큰 안 씀.

🔄 **다 끝나면 반영** (그때 새 버전 만들어요, ~2분):
  • "**① 반영해**" / "**v2 뽑아줘**" / "**다시 만들어**"

🚀 **최종 배포** (꼭 이 키워드로):
  • "**① 컨펌**" / "**② 배포해**" / "**1번 확정 올려**" / "**② push**"
  ⚠️ 그냥 "1번 좋아" / "1번으로 하자" 만으로는 배포 안 돼요 (실수 방지)

— 편집장 (체크포인트 ③)`,
  );
}

// ──────────────────────────────────────────────
// (레거시) 3) 단일 옵션 선택 → 단일 HTML 생성 → 컨펌 요청
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

  // 선택된 옵션의 reference_brands 로 실제 DESIGN.md 로드
  const selectedOpt = (s.options || []).find(o => o.id === choice) || {};
  const refBrands = selectedOpt.reference_brands || [];
  let designRefBlock = `- **디자인 스타일**: ${design.name}\n${design.content}`;
  if (refBrands.length > 0) {
    const parts = [];
    for (const bName of refBrands.slice(0, 2)) {
      const bd = await loadBrandDesign(bName);
      if (bd) parts.push(`### ${bd.name} (${bd.source})\n${bd.content.slice(0, 4000)}`);
    }
    if (parts.length > 0) {
      designRefBlock = `## 디자인 레퍼런스 (이 브랜드의 실제 색상·폰트·컴포넌트 값을 적극 활용)\n${parts.join('\n\n')}`;
    }
  }

  const htmlPrompt = `카드뉴스 HTML을 생성하세요. 통째로 한 파일 완성본.

## 컨텍스트
- **오디언스**: ${s.audience}
- **선택된 옵션**: ${choice} (${JSON.stringify(s.options)})
${designRefBlock}
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
8. **마지막 슬라이드 CTA — 실제 클릭 가능하게**:
    ${s.notionUrl
      ? `URL: ${s.notionUrl}
    반드시 \`<a href="${s.notionUrl}" target="_blank" rel="noopener">원문 상세 보기</a>\` 형태의 **실제 anchor 태그**로 구현. href 속성에 위 URL 정확히.`
      : `URL 없음 → CTA 버튼 **생략**`}
9. **진행바**(progress-bar) + **슬라이드 카운터** (01 / 15 형태) 상단 고정
10. **시맨틱 HTML** + **alt 속성** 필수

${HANWHA_LOGO_RULE}

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
  const outDir = path.join(_groupOutputDir(), ym, slug);
  await fs.mkdir(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'index.html');
  html = injectMobileSafetyCSS(html);
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
  const previewProjectName = `cardnews-g${_gidSlug()}-${slug}-r${revN}`.slice(0, 50);
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
    const projectName = `cardnews-g${_gidSlug()}-${s.slug}`.slice(0, 50);
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
// 4b) 새 플로우 전용 — 복수 완성본 중 선택한 버전을 Vercel에 최종 배포
// ──────────────────────────────────────────────
export async function handleFinalDeploy(finalId, finalVersion) {
  const s = getSession();
  if (!s) return;
  const versions = s.fullVersions?.[finalId] || [];
  if (versions.length === 0) {
    await sendMessage(bots.editor, `⚠️ ${finalId} 완성본이 세션에 없어요. 처음부터 다시 할까요?\n\n— 편집장`);
    return;
  }
  // 버전 미지정 → 최신
  const target = finalVersion
    ? versions.find((x) => x.v === finalVersion)
    : versions[versions.length - 1];
  if (!target) {
    await sendMessage(bots.editor, `⚠️ ${finalId} v${finalVersion} 기록 없음. 있는 버전: ${versions.map((x) => 'v' + x.v).join(', ')}\n\n— 편집장`);
    return;
  }

  updateSession({ state: STATES.DEPLOYING, finalChoice: { id: finalId, version: target.v } });
  log.state(STATES.AWAITING_FINAL_CHOICE, STATES.DEPLOYING, `final=${finalId} v${target.v}`);

  await sendMessage(bots.editor, `네, ${finalId} v${target.v} 로 올릴게요 @주현대리. Vercel 푸시 중...\n\n— 편집장`);
  await typing(bots.editor);

  try {
    // final/index.html 로 복사해서 배포
    const finalDir = path.join(path.dirname(path.dirname(target.path)), 'final');
    await fs.mkdir(finalDir, { recursive: true });
    const finalHtmlPath = path.join(finalDir, 'index.html');
    await fs.copyFile(target.path, finalHtmlPath);

    const projectName = `cardnews-g${_gidSlug()}-${s.slug}`.slice(0, 50);
    const { stdout } = await execAsync(
      `vercel deploy --prod --yes --name ${projectName}`,
      { cwd: finalDir, maxBuffer: 10 * 1024 * 1024 },
    );
    const urlMatch = stdout.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/);
    const canonical = `https://${projectName}.vercel.app`;

    if (urlMatch) {
      updateSession({ deployUrl: canonical });
      await sendMessage(
        bots.editor,
        `@주현대리 다 됐어요 🎉\n\n${canonical}\n\n(${finalId} ${target.v === versions[versions.length-1].v ? '최신' : 'v' + target.v} 버전) PC + 모바일 모두 열어보세요. 다음 편 때 뵐게요.\n\n— 편집장`,
      );
    } else {
      await sendMessage(bots.editor, `❌ 배포는 됐는데 URL 파싱 실패. 로그 확인 필요.\n\n— 편집장`);
    }
  } catch (e) {
    log.error('DEPLOY', 'handleFinalDeploy 실패', e);
    await sendMessage(bots.editor, `❌ 배포 실패: ${String(e).slice(0, 300)}\n\n— 편집장`);
    updateSession({ state: STATES.AWAITING_FINAL_CHOICE });
    return;
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

  // 모든 단계에서 디자인 브랜드 선호 캡처 (예: "토스 느낌으로" 같은 지시를 언제든 가능)
  if (!s.designPreference) {
    const designPref = resolveDesignIntent(text);
    if (designPref) {
      updateSession({ designPreference: designPref });
      log.info('DESIGN_PREF', `brands=${designPref.requestedBrands.join(',')} mix=${designPref.mixMode}`);
    }
  }

  // 상태에 따라 라우팅
  switch (s.state) {
    case STATES.AWAITING_AUDIENCE:
      await handleAudienceAnswer(text);
      break;

    case STATES.AWAITING_COPY_APPROVAL: {
      const f = await parseFinalChoice(text, s);
      log.info('COPY_PARSE', `action=${f.action} variant=${f.variant} chosen=${s.chosenProvider} notes=${f.notes.length}`);

      if (f.action === 'cancel') {
        await sendMessage(bots.editor, `작업 취소. 다음 편 때 뵐게요.\n\n— 편집장`);
        resetSession();
        break;
      }

      // ── A/B 선택 전 단계 (copyDrafts 둘 다 있고 chosenProvider 미선택) ──
      const bothAvailable = s.copyDrafts && s.copyDrafts.opus && s.copyDrafts.gpt;
      if (bothAvailable && !s.chosenProvider) {
        if (f.action === 'select_variant' && f.variant) {
          const chosen = s.copyDrafts[f.variant];
          if (!chosen) {
            await sendMessage(bots.editor, `⚠️ ${f.variant === 'opus' ? 'Opus' : 'GPT'} 버전이 세션에 없어요. 다른 쪽 고르세요.\n\n— 편집장`);
            break;
          }
          updateSession({ copyDraft: chosen, chosenProvider: f.variant });
          log.info('COPY_SELECT', `chosen=${f.variant} slides=${chosen.slides.length} withMergeNotes=${f.notes.length > 0}`);
          const label = f.variant === 'opus' ? 'Claude Opus' : 'GPT-5';

          // 합본 지시가 함께 들어온 경우 — 바로 apply_notes 로 돌입 (v2 재생성)
          if (f.notes.length > 0) {
            const longMerge = f.notes.filter((n) => n.length >= 200);
            const shortNotes = f.notes.filter((n) => n.length < 200);
            const allShort = shortNotes.length > 0 ? shortNotes : [];
            const mergeText = longMerge.length > 0 ? longMerge.join('\n\n---\n\n') : null;
            const joined = f.notes.join(' / ');

            await sendMessage(
              bots.editor,
              `✅ **${label}** 베이스로 받았어요 @주현대리. 합본 지시도 함께 오셨네요:
> ${joined.slice(0, 200)}${joined.length > 200 ? ' …' : ''}

A·B 두 버전 참고 + 위 지시 반영해서 **${label} 카피 v${(s.copyRevCount || 1) + 1}** 뽑을게요. 30~60초 걸려요.

— 편집장 (체크포인트 ①.5b)`,
            );

            try {
              const cur = getSession();
              const regenerate = cur.chosenProvider === 'opus' ? _generateCopyJson : _generateCopyJsonOpenAI;
              const refOpts = {
                referenceDrafts: { opus: cur.copyDrafts?.opus, gpt: cur.copyDrafts?.gpt },
                userMergeText: mergeText,
              };
              // userNotes 에 짧은 지시 누적 (긴 지시는 mergeText 로 들어감)
              if (allShort.length > 0) {
                updateSession({ userNotes: [...(cur.userNotes || []), ...allShort] });
              }
              const newCopy = await regenerate(getSession(), refOpts);
              const nextVer = (cur.copyRevCount || 1) + 1;
              const vLabel = `v${nextVer}`;

              const now3 = new Date();
              const ym3 = `${now3.getFullYear()}-${String(now3.getMonth() + 1).padStart(2, '0')}`;
              const baseSlug3 = cur.slug || `cardnews-${Date.now()}`;
              const copyDir3 = path.join(_groupOutputDir(), ym3, baseSlug3, 'copy');
              await fs.mkdir(copyDir3, { recursive: true });
              await fs.writeFile(path.join(copyDir3, `copy-${vLabel}-${cur.chosenProvider}.json`), JSON.stringify(newCopy, null, 2), 'utf-8');

              updateSession({ copyDraft: newCopy, copyRevCount: nextVer });
              log.info('COPY_SELECT_AND_APPLY', `ok ${vLabel} provider=${cur.chosenProvider} slides=${newCopy.slides.length} merge=${!!mergeText}`);

              await _presentCopyDraft(newCopy, vLabel);
              await sendMessage(
                bots.editor,
                `@주현대리 ${label} 합본 카피 ${vLabel} 나왔어요. 더 수정할 거 있으시면 쌓으시고, 괜찮으면 "**카피 OK**" — 아트 단계로 갑니다.\n\n— 편집장`,
              );
            } catch (e) {
              log.error('COPY_SELECT_AND_APPLY', '재생성 실패', e);
              await sendMessage(bots.editor, `⚠️ 합본 카피 생성 실패: ${String(e.message || e).slice(0, 150)}. 다시 "반영해" 주시거나 다른 지시 주세요.\n\n— 편집장`);
            }
            break;
          }

          // 합본 지시 없이 단순 선택
          await sendMessage(
            bots.editor,
            `✅ **${label}** 버전 선택 받았어요 @주현대리.

이제 다음 중 자유롭게:

✏️ **짧은 수정 지시** (쌓였다가 "반영해" 시 v2)
  • "3번 슬라이드 헤드 더 강하게"
  • "데이터 파트 축소"

🔀 **합본·발췌 텍스트 투입** (긴 텍스트 붙여넣기 — A·B 다 참고 + 글자 그대로 존중)
  예) "A의 표지 헤드 쓰고, B의 시사점 스타일로 통일, 3번 슬라이드는 [여기 직접 쓴 본문...]"
  → LLM이 A·B 원본 + 주신 텍스트 + 오디언스 맥락 모두 반영해 v2 생성

🔄 다 쌓고 "**반영해**" / "**v2 뽑아줘**" — 그때 재생성
🚀 만족이면 "**카피 OK**" — 아트 옵션 단계로 넘어갈게요.

— 편집장 (체크포인트 ①.5b)`,
          );
          break;
        }
        // A/B 선택 전이지만 수정 지시(note_add)나 재생성(apply_notes) 요청이면 수용
        // → 양쪽 다 참고해서 재생성 (Opus 기본)
        if (f.action === 'note_add' || f.action === 'apply_notes') {
          // 수정 지시를 누적하고 Opus 기본 선택 후 재생성
          const allNotes = [...(s.userNotes || []), ...f.notes];
          updateSession({ copyDraft: s.copyDrafts.opus, chosenProvider: 'opus', userNotes: allNotes });
          log.info('COPY_FEEDBACK_BEFORE_AB', `action=${f.action} notes=${f.notes.length} auto-select=opus`);

          await sendMessage(
            bots.editor,
            `📝 @주현대리 피드백 받았어요. A·B 둘 다 참고해서 **Opus 카피 v${(s.copyRevCount || 1) + 1}**로 다시 뽑을게요. 30~60초 걸립니다.

> ${f.notes.join(' / ').slice(0, 200)}

— 편집장`,
          );

          try {
            const cur = getSession();
            const refOpts = {
              referenceDrafts: { opus: cur.copyDrafts?.opus, gpt: cur.copyDrafts?.gpt },
            };
            const newCopy = await _generateCopyJson(cur, refOpts);
            const nextVer = (cur.copyRevCount || 1) + 1;
            updateSession({ copyDraft: newCopy, copyRevCount: nextVer });
            log.info('COPY_REGEN_BEFORE_AB', `ok v${nextVer} slides=${newCopy.slides.length}`);

            const vLabel = `v${nextVer}`;
            const now4 = new Date();
            const ym4 = `${now4.getFullYear()}-${String(now4.getMonth() + 1).padStart(2, '0')}`;
            const baseSlug4 = cur.slug || `cardnews-${Date.now()}`;
            const copyDir4 = path.join(_groupOutputDir(), ym4, baseSlug4, 'copy');
            await fs.mkdir(copyDir4, { recursive: true });
            await fs.writeFile(path.join(copyDir4, `copy-${vLabel}-opus.json`), JSON.stringify(newCopy, null, 2), 'utf-8');

            await _presentCopyDraft(newCopy, vLabel);
            await sendMessage(
              bots.editor,
              `@주현대리 피드백 반영한 카피 ${vLabel} 나왔어요 (${newCopy.slides.length}장). 더 수정할 거 있으시면 쌓으시고, 괜찮으면 "**카피 OK**".\n\n— 편집장`,
            );
          } catch (e) {
            log.error('COPY_REGEN_BEFORE_AB', '재생성 실패', e);
            await sendMessage(bots.editor, `⚠️ 카피 재생성 실패: ${String(e.message || e).slice(0, 150)}. 다시 시도해주세요.\n\n— 편집장`);
          }
          break;
        }

        // 그 외 — A/B 선택 안내
        await sendMessage(
          bots.editor,
          `먼저 **A / B 중 하나** 골라주세요 @주현대리.
  • "**A**" 또는 "**Opus**" → Claude Opus 버전으로
  • "**B**" 또는 "**GPT**" → GPT-5 버전으로
  • 또는 **"A 베이스로 B의 X 추가"** 처럼 합본 지시 함께 주셔도 OK (바로 v2 생성)
  • 또는 **수정 피드백** ("내용 더 넣어줘", "장표 수 늘려") → 자동으로 재생성

— 편집장 (체크포인트 ①.5a)`,
        );
        break;
      }

      // "카피 OK"/"승인" → 아트 옵션 단계로 진행 (confirm 의미 전환)
      if (f.action === 'confirm') {
        if (!s.copyDraft) {
          await sendMessage(bots.editor, `카피가 아직 확정 안 됐어요. A/B 중 하나 먼저 골라주세요.\n\n— 편집장`);
          break;
        }
        updateSession({ copyApproved: true });
        await sendMessage(
          bots.editor,
          `✅ 카피 승인 받았어요 @주현대리 (${s.chosenProvider === 'opus' ? 'Claude Opus' : 'GPT-5'} 기준). 아트 옵션 단계로 넘어갑니다.\n\n— 편집장`,
        );
        await proposeArtOptions();
        break;
      }

      // 수정 메모 누적
      if (f.action === 'note_add') {
        const pending = { ...(s.pendingNotes || {}) };
        const key = 'copy';
        if (!pending[key]) pending[key] = [];
        if (f.notes.length > 0) pending[key].push(...f.notes);
        updateSession({ pendingNotes: pending });

        const total = (pending[key] || []).length;
        const recent = (pending[key] || []).slice(-3).join(' / ');
        await sendMessage(
          bots.editor,
          `📝 메모했어요. 카피 수정 누적 **${total}건**: ${recent}${total > 3 ? ' …' : ''}

계속 주세요. 다 끝나면 "**반영해**" / "**v2 뽑아**" — 한번에 반영해서 새 버전 만들게요.

— 편집장`,
        );
        break;
      }

      // 누적된 메모 반영해서 v2 생성 (선택된 프로바이더만 재호출)
      if (f.action === 'apply_notes') {
        const pending = s.pendingNotes || {};
        const copyNotes = pending['copy'] || [];
        if (copyNotes.length === 0) {
          await sendMessage(
            bots.editor,
            `누적된 카피 수정 메모가 없어요. 구체적 수정 요구 주시면 쌓아뒀다가 반영해요.\n\n— 편집장`,
          );
          break;
        }
        if (!s.chosenProvider) {
          await sendMessage(bots.editor, `먼저 A/B 중 하나 골라주세요. 그 후에 수정 반영됩니다.\n\n— 편집장`);
          break;
        }

        const allNotes = [...(s.userNotes || []), ...copyNotes];
        const nextPending = { ...pending };
        delete nextPending['copy'];
        updateSession({ userNotes: allNotes, pendingNotes: nextPending });

        const providerLabel = s.chosenProvider === 'opus' ? 'Claude Opus' : 'GPT-5';

        // 사용자 머지 텍스트 감지: 긴 단일 메모(>=200자)가 있으면 "합본·발췌" 의도로 판단
        const longNotes = copyNotes.filter((n) => n.length >= 200);
        const hasUserMerge = longNotes.length > 0;
        const userMergeText = hasUserMerge ? longNotes.join('\n\n---\n\n') : null;
        const shortNotes = copyNotes.filter((n) => n.length < 200);

        const ctxLine = hasUserMerge
          ? `🎯 사용자 합본·발췌 텍스트 ${longNotes.length}건 (A·B 참고본 함께 투입) + 짧은 지시 ${shortNotes.length}건`
          : `${copyNotes.length}건 지시 반영`;

        await sendMessage(
          bots.editor,
          `알겠어요 @주현대리. ${ctxLine} 반영해서 ${providerLabel} 카피 v${(s.copyRevCount || 1) + 1} 뽑을게요:
${copyNotes.map((n) => `  • ${n.length > 120 ? n.slice(0, 120) + ' …' : n}`).join('\n')}

30~60초 걸려요.\n\n— 편집장`,
        );

        try {
          // 선택된 프로바이더로만 재생성 — A·B 참고본 + 사용자 머지 텍스트 주입
          const regenerate = s.chosenProvider === 'opus' ? _generateCopyJson : _generateCopyJsonOpenAI;
          const refOpts = {
            referenceDrafts: {
              opus: s.copyDrafts?.opus || null,
              gpt: s.copyDrafts?.gpt || null,
            },
            userMergeText,
          };
          const newCopy = await regenerate(getSession(), refOpts);
          const nextVer = (s.copyRevCount || 1) + 1;
          const vLabel = `v${nextVer}`;

          // 저장
          const now3 = new Date();
          const ym3 = `${now3.getFullYear()}-${String(now3.getMonth() + 1).padStart(2, '0')}`;
          const baseSlug3 = s.slug || `cardnews-${Date.now()}`;
          const copyDir3 = path.join(_groupOutputDir(), ym3, baseSlug3, 'copy');
          await fs.mkdir(copyDir3, { recursive: true });
          await fs.writeFile(path.join(copyDir3, `copy-${vLabel}-${s.chosenProvider}.json`), JSON.stringify(newCopy, null, 2), 'utf-8');

          updateSession({ copyDraft: newCopy, copyRevCount: nextVer });
          log.info('COPY_REVISE', `copy.ok ${vLabel} provider=${s.chosenProvider} slides=${newCopy.slides.length} mergeText=${hasUserMerge}`);

          await _presentCopyDraft(newCopy, vLabel);
          await sendMessage(
            bots.editor,
            `@주현대리 ${providerLabel} 카피 ${vLabel} 나왔어요${hasUserMerge ? ' (A·B 참고 + 주신 합본 텍스트 반영)' : ''}. 또 수정할 거 있으시면 쌓으시고, 괜찮으면 "**카피 OK**" — 아트 단계로 갑니다.\n\n— 편집장`,
          );
        } catch (e) {
          log.error('COPY_REVISE', '재생성 실패', e);
          await sendMessage(bots.editor, `⚠️ 카피 재생성 실패: ${String(e.message || e).slice(0, 150)}. 다시 "반영해" 주세요.\n\n— 편집장`);
        }
        break;
      }

      if (f.action === 'question' || f.questions.length > 0) {
        await answerQuestionsAndReprompt(f.questions.length > 0 ? f.questions : [text], s, 'copy');
        break;
      }

      // unclear — 사용법 재안내
      await sendMessage(
        bots.editor,
        `@주현대리 지금 카피 검토 단계에요. 어떻게 할까요?
  • "**3번 슬라이드 헤드 약해**" → 메모 누적
  • "**반영해**" → v2 생성
  • "**카피 OK**" / "**승인**" → 아트 옵션 단계로
  • "**취소**"

— 편집장`,
      );
      break;
    }

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

      // 스타일 선택 있으면 풀 HTML 제작 단계로 (복수 허용)
      if (parsed.choices.length > 0) {
        if (parsed.notes.length > 0) {
          await sendMessage(
            bots.editor,
            `📝 추가 요구 받았어요:\n${parsed.notes.map((n) => `  • ${n}`).join('\n')}\n카피·아트 제작 시 반영합니다.\n\n— 편집장`,
          );
        }
        if (parsed.questions.length > 0) {
          await sendMessage(
            bots.editor,
            `질문 주신 건 작업하면서 답변 드릴게요: ${parsed.questions.join(' / ')}\n\n— 편집장`,
          );
        }
        await handleStyleChoices(parsed.choices);
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

    case STATES.AWAITING_FINAL_CHOICE: {
      const f = await parseFinalChoice(text, s);
      log.info('FINAL_PARSE', `action=${f.action} finalId=${f.finalId} v=${f.finalVersion} reviseId=${f.reviseId}`);

      if (f.action === 'cancel') {
        await sendMessage(bots.editor, `작업 취소. 다음 편 때 뵐게요.\n\n— 편집장`);
        resetSession();
        break;
      }

      if (f.action === 'confirm' && f.finalId) {
        await handleFinalDeploy(f.finalId, f.finalVersion);
        break;
      }

      // 수정 메모 누적 (재생성 X) — 장표별로 자유롭게 쌓기
      if (f.action === 'note_add') {
        const targetId = f.reviseId || '공통';
        const pending = { ...(s.pendingNotes || {}) };
        if (!pending[targetId]) pending[targetId] = [];
        if (f.notes.length > 0) pending[targetId].push(...f.notes);
        updateSession({ pendingNotes: pending });

        const totalCount = Object.values(pending).reduce((sum, arr) => sum + arr.length, 0);
        const summary = Object.entries(pending)
          .map(([id, arr]) => `  ${id === '공통' ? '공통' : id} (${arr.length}건): ${arr.slice(-3).join(' / ')}${arr.length > 3 ? ' …' : ''}`)
          .join('\n');

        await sendMessage(
          bots.editor,
          `📝 메모했어요. 누적 **${totalCount}건**:
${summary}

계속 주세요. 다 끝나면 "**${targetId !== '공통' ? targetId + ' ' : ''}반영해**" / "**v2 뽑아**" 하시면 한번에 반영해서 새 버전 만들게요.

— 편집장`,
        );
        break;
      }

      // 누적된 메모 반영해서 재빌드
      if (f.action === 'apply_notes') {
        const pending = s.pendingNotes || {};
        const targetId = f.reviseId || Object.keys(pending).find((k) => k !== '공통') || '공통';
        const relevantNotes = [
          ...(pending[targetId] || []),
          ...(targetId !== '공통' ? (pending['공통'] || []) : []),
        ];
        if (relevantNotes.length === 0) {
          await sendMessage(
            bots.editor,
            `누적된 수정 메모가 없어요 @주현대리. "① 1페이지 X 고쳐" 같이 구체적으로 주시면 쌓아뒀다가 반영해요.\n\n— 편집장`,
          );
          break;
        }
        // userNotes 에 합치고 pendingNotes 는 해당 id 만 비우기
        const allNotes = [...(s.userNotes || []), ...relevantNotes];
        const nextPending = { ...pending };
        delete nextPending[targetId];
        if (targetId !== '공통') delete nextPending['공통'];
        updateSession({ userNotes: allNotes, pendingNotes: nextPending });

        await sendMessage(
          bots.editor,
          `알겠어요 @주현대리. **${targetId}** 에 누적된 **${relevantNotes.length}건** 반영해서 새 버전 만들게요:
${relevantNotes.map((n) => `  • ${n}`).join('\n')}

기존 버전은 그대로 보관. 2분 내외.\n\n— 편집장`,
        );
        await handleStyleChoices([targetId === '공통' ? (s.styleChoices?.[0] || '①') : targetId]);
        break;
      }

      if (f.action === 'rollback' && f.finalId && f.finalVersion) {
        // 예전 버전 파일 재첨부
        const list = s.fullVersions?.[f.finalId] || [];
        const target = list.find((x) => x.v === f.finalVersion);
        if (!target) {
          await sendMessage(bots.editor, `⚠️ ${f.finalId} v${f.finalVersion} 기록이 없어요. 있는 버전: ${list.map((x) => 'v' + x.v).join(', ') || '없음'}\n\n— 편집장`);
        } else {
          await sendMessage(bots.artDirector, `📎 ${f.finalId} v${f.finalVersion} 다시 보내드려요.\n\n— 아트`);
          await sendDocument(bots.artDirector, target.path, `${f.finalId} v${f.finalVersion} (재전송)`);
        }
        break;
      }

      if (f.action === 'question' || f.questions.length > 0) {
        await answerQuestionsAndReprompt(f.questions.length > 0 ? f.questions : [text], s, 'final');
        break;
      }

      // unclear — 사용법 다시 안내
      await sendMessage(
        bots.editor,
        `@주현대리 어떻게 할까요?
  • "**①로 컨펌**" → 최종 배포
  • "**② 수정 [내용]**" → 새 버전 뽑기
  • "**① v1 다시 봐**" → 예전 버전 재전송
  • "**취소**"

— 편집장`,
      );
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
 * 옵션별 미리보기 HTML 생성 (병렬) — 파일로만 저장, Vercel 배포 안 함
 * @returns {Promise<Array<{id, name, path}>>}
 */
async function generateOptionPreviews(s, options, audience) {
  const design = await loadCurrentDesign();
  const artSystem = await loadAgentSystem('art-director');

  // 승인된 카피가 있으면 그걸, 없으면 본문 발췌로 fallback
  const copyForPreview = (s.copyDraft && Array.isArray(s.copyDraft.slides))
    ? s.copyDraft.slides.slice(0, 3)  // cover + 본문 2개
    : null;
  const sourceExcerpt = copyForPreview
    ? null
    : s.sourceText.slice(0, 2500);

  // 이 카드뉴스의 전용 폴더 (slug 는 첫 호출 시 확보)
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const baseSlug = s.slug || `cardnews-${Date.now()}`;
  const previewsDir = path.join(_groupOutputDir(), ym, baseSlug, 'previews');
  await fs.mkdir(previewsDir, { recursive: true });
  if (!s.slug) updateSession({ slug: baseSlug });

  const tasks = options.map(async (opt) => {
    const copyBlock = copyForPreview
      ? `## 승인된 카피 (앞 3슬라이드 — **반드시 이 텍스트 그대로** 렌더링, 추가 창작·각색 금지)
${JSON.stringify(copyForPreview, null, 2)}
`
      : `## 본문 발췌 (앞부분 — 미리보기용)
${sourceExcerpt}
`;

    const prompt = `미니 카드뉴스 미리보기(3슬라이드만)를 HTML 한 파일로 작성. 사용자가 이 스타일이 마음에 드는지 보고 결정할 수 있게.

## 스타일 (이 옵션의 정체성)
- 이름: ${opt.name}
- 색감: ${opt.colors}
- 레이아웃: ${opt.layout}
- 인터랙션: ${opt.interaction}
- 어울림: ${opt.fits}

## 컨텍스트
- 오디언스: ${audience}
- 참조 브랜드: ${(opt.reference_brands || []).join(', ') || design.name}
${await (async () => {
      const refs = opt.reference_brands || [];
      if (refs.length > 0) {
        const parts = [];
        for (const b of refs.slice(0, 2)) {
          const bd = await loadBrandDesign(b);
          if (bd) parts.push(`### ${bd.name}\n${bd.content.slice(0, 2000)}`);
        }
        if (parts.length > 0) return `## 디자인 레퍼런스\n${parts.join('\n\n')}`;
      }
      return `- 디자인 라이브러리 참고: ${design.name}\n${design.content.slice(0, 800)}`;
    })()}

${copyBlock}
## 요구사항
- Swiper.js 11 vertical fade
- Pretendard Variable + JetBrains Mono
- 정확히 3슬라이드: 표지 + 본문 핵심 1 + 본문 핵심 2${copyForPreview ? ' (카피 JSON 순서 그대로)' : ''}
- 위 스타일을 정확히 적용
- 인터랙션 1~2개 동작 (설정한 인터랙션)
- **PC 뷰**: 1280px 이상에서 여백·카드 그리드·타이포가 PC에 최적화
- **모바일 뷰**: 375~480px 에서 clamp() 로 자동 reflow, 터치 스와이프 작동
- 슬라이드 카운터 (1/3) + 진행바
- HTML 한 파일 자체완결 (CDN 외부 리소스만 참조 — file:// 에서도 작동)
- 코드 블록(\`\`\`) 금지. <!DOCTYPE 부터 </html> 까지만.

${HANWHA_LOGO_RULE}`;

    const r = await callAgent(artSystem, prompt, {
      model: models.main,
      maxTokens: 12000,
    });

    let html = r.text.trim();
    const cb = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
    if (cb) html = cb[1].trim();
    if (!html.toLowerCase().startsWith('<!doctype')) {
      const idx = html.toLowerCase().indexOf('<!doctype');
      if (idx > 0) html = html.slice(idx);
    }

    const safeId = opt.id === '①' ? '1' : opt.id === '②' ? '2' : opt.id === '③' ? '3' : String(opt.id).replace(/[^0-9]/g, '') || 'x';
    // 모바일 safety CSS 주입
    html = injectMobileSafetyCSS(html);

    const fileName = `preview-0${safeId}.html`;
    const filePath = path.join(previewsDir, fileName);
    await fs.writeFile(filePath, html, 'utf-8');

    return { id: opt.id, name: opt.name, path: filePath };
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

  // 3개 초과 요청 감지 ("4개/5개/6개로..." 같은 문구) — 시스템 제약 안내
  const overCapMatch = notesLine.match(/([4-9]|[1-9]\d)개/);
  if (overCapMatch) {
    await sendMessage(
      bots.editor,
      `📌 시스템은 한 번에 최대 **3개 옵션**만 제시해요 (선택 피로 방지). 3개 슬롯을 서로 확실히 다르게 다시 뽑아드릴게요.\n\n— 편집장`,
    );
  }

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

  // 옵션 하나당 ~700토큰 + 래퍼 오버헤드 → id 개수만큼 스케일
  const proposalMaxTokens = 800 + ids.length * 900;

  let newOptions = [];
  try {
    const { json } = await callAgent(artSystem, proposalPrompt, {
      model: models.main,
      maxTokens: proposalMaxTokens,
      json: true,
    });
    if (json && Array.isArray(json.options)) {
      newOptions = json.options.filter((o) => ids.includes(o.id));
    }
    log.info('REGENERATE', `art.propose parsed=${newOptions.length}/${ids.length} maxTok=${proposalMaxTokens}`);
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
    await sendMessage(bots.artDirector, `🎨 새 미리보기 ${newPreviews.length}개 첨부 드려요 — 클릭해서 열어보세요.${keepIds.length > 0 ? `\n※ ${keepIds.join('·')} 는 기존 미리보기 그대로.` : ''}\n\n— 아트`);
    for (const p of newPreviews) {
      try {
        await sendDocument(bots.artDirector, p.path, `${p.id} ${p.name}`);
      } catch (e) {
        log.error('REGEN_ATTACH', `sendDocument 실패 id=${p.id}`, e);
      }
    }
    updateSession({ previewAttachments: [...(getSession()?.previewAttachments || []), ...newPreviews] });
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
