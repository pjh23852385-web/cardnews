// 대화 상태 머신 — 메모리 캐시 + JSON 파일 영속화 (재시작 복원용)
import fs from 'node:fs';
import path from 'node:path';
import { SESSION_TIMEOUT_MS, paths } from './config.js';

export const STATES = {
  IDLE: 'idle',
  AWAITING_AUDIENCE: 'awaiting_audience',          // ✋ 체크포인트 ①
  AWAITING_SCOPE: 'awaiting_scope',                // 소스에 주제 여러 개일 때
  AWAITING_COPY_APPROVAL: 'awaiting_copy_approval',// ✋ 체크포인트 ①.5 — 카피 검토·수정·승인
  AWAITING_OPTION: 'awaiting_option',              // ✋ 체크포인트 ② — 스타일 프리뷰 중 복수 선택
  AWAITING_CONTENT_SUPPLEMENT: 'awaiting_content_supplement', // 카피 보충 제안
  BUILDING_FULLS: 'building_fulls',                // 카피 1회 + 스타일별 풀 HTML 병렬 생성
  AWAITING_FINAL_CHOICE: 'awaiting_final_choice',  // ✋ 체크포인트 ③ — N개 풀 HTML 중 최종 1개 + 버전 선택
  BUILDING: 'building',                            // (레거시 — 단일 빌드 경로용, 필요 시 유지)
  AWAITING_CONFIRM: 'awaiting_confirm',            // (레거시 단일 컨펌)
  DEPLOYING: 'deploying',
};

const FILE = paths.sessionFile;

// 시작 시 디스크에서 로드 (재시작 후 복원)
let session = _loadFromDisk();

function _loadFromDisk() {
  try {
    if (!fs.existsSync(FILE)) return null;
    const raw = fs.readFileSync(FILE, 'utf-8');
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // 타임아웃 지난 세션은 버리기
    if (Date.now() - (parsed.lastActivity || 0) > SESSION_TIMEOUT_MS) {
      console.log(`[state] 저장된 세션이 타임아웃 지남 (${Math.round((Date.now() - parsed.lastActivity) / 60000)}분 전) — 무시`);
      try { fs.unlinkSync(FILE); } catch {}
      return null;
    }
    console.log(`[state] 세션 복원: state=${parsed.state} audience=${parsed.audience || '미정'} options=${parsed.options?.length || 0}개`);
    return parsed;
  } catch (e) {
    console.warn(`[state] session.json 읽기 실패 (${e.message}) — 신규 시작`);
    return null;
  }
}

function _saveToDisk() {
  try {
    if (session) {
      // 원자적 쓰기: temp 에 쓰고 rename (크래시 중 파일 손상 방지)
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(session, null, 2), 'utf-8');
      fs.renameSync(tmp, FILE);
    } else {
      if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
    }
  } catch (e) {
    console.error(`[state] session.json 쓰기 실패:`, e.message);
  }
}

export function getSession() {
  if (!session) return null;
  // 타임아웃 체크
  if (Date.now() - session.lastActivity > SESSION_TIMEOUT_MS) {
    session = null;
    _saveToDisk();
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
    revisionCount: 0,             // 수정 반복 횟수
    // 새 플로우 필드 (파일 첨부 + 복수 스타일 + 버전 관리)
    previewAttachments: null,     // [{id,name,path}] — ③ 단계 미니 프리뷰 파일 경로
    styleChoices: [],             // ['①','③'] — ④ 단계에서 주현대리가 고른 스타일들
    copyDraft: null,              // 카피라이터가 뽑은 공통 카피 (JSON)
    copyApproved: false,          // 카피 승인 여부 (true 되어야 아트 옵션 단계 진입)
    copyRevCount: 0,              // 카피 수정 반복 횟수 (v1, v2, ...)
    fullVersions: {},             // { '①': [{v:1,path,builtAt}], '②': [{v:1,...},{v:2,...}], ... }
    finalChoice: null,            // { id:'①', version:1 } — ⑦ 단계에서 배포할 대상
    pendingNotes: {},             // { '①': ['1페이지 헤드라인 X 고쳐', ...], ... } — apply_notes 대기 중 수정 지시 누적
    ...initial,
  };
  _saveToDisk();
  return session;
}

export function updateSession(patch) {
  if (!session) return null;
  Object.assign(session, patch, { lastActivity: Date.now() });
  _saveToDisk();
  return session;
}

export function resetSession() {
  session = null;
  _saveToDisk();
}
