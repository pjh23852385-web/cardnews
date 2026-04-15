// 대화 상태 머신 (메모리 기반, 그룹방당 1세션)
import { SESSION_TIMEOUT_MS } from './config.js';

export const STATES = {
  IDLE: 'idle',
  AWAITING_AUDIENCE: 'awaiting_audience',          // ✋ 체크포인트 ①
  AWAITING_SCOPE: 'awaiting_scope',                // 소스에 주제 여러 개일 때
  AWAITING_OPTION: 'awaiting_option',              // ✋ 체크포인트 ② (3옵션 중 선택)
  AWAITING_CONTENT_SUPPLEMENT: 'awaiting_content_supplement', // 카피 보충 제안
  BUILDING: 'building',                            // 카피+아트 작업 중
  AWAITING_CONFIRM: 'awaiting_confirm',            // ✋ 체크포인트 ③
  DEPLOYING: 'deploying',
};

let session = null;

export function getSession() {
  if (!session) return null;
  // 타임아웃 체크
  if (Date.now() - session.lastActivity > SESSION_TIMEOUT_MS) {
    session = null;
    return null;
  }
  return session;
}

export function newSession(initial = {}) {
  session = {
    state: STATES.IDLE,
    lastActivity: Date.now(),
    sourceText: null,
    sourcePath: null,
    notionUrl: null,
    audience: null,
    scopeChoice: null,
    options: null,                // 아트의 3옵션 (배열 [{id, name, ...}])
    optionChoice: null,
    recommendedOption: null,      // 편집장이 추천한 옵션 id ("①"/"②"/"③")
    outline: null,                // 편집장이 잡은 목차
    copy: null,
    html: null,
    slug: null,
    deployUrl: null,
    userNotes: [],                // 사용자가 단계 진행 중 던진 부가 요구/메모 (HTML 생성 시 반영)
    revisionCount: 0,             // 수정 반복 횟수 (매 revision마다 새 preview URL 생성)
    ...initial,
  };
  return session;
}

export function updateSession(patch) {
  if (!session) return null;
  Object.assign(session, patch, { lastActivity: Date.now() });
  return session;
}

export function resetSession() {
  session = null;
}
