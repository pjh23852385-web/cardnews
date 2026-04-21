// 대화 상태 머신 — 그룹별 Map 기반 + JSON 파일 영속화
// 다중 그룹 지원: 그룹 ID 하나당 독립 세션. 파일은 sessions/<groupId>.json
import fs from 'node:fs';
import path from 'node:path';
import { SESSION_TIMEOUT_MS, paths } from './config.js';

export const STATES = {
  IDLE: 'idle',
  AWAITING_AUDIENCE: 'awaiting_audience',          // ✋ 체크포인트 ①
  AWAITING_SCOPE: 'awaiting_scope',                // 소스에 주제 여러 개일 때
  AWAITING_VOLUME_CONFIRM: 'awaiting_volume_confirm',// 분량 확인 대기 — 카피 생성 전
  AWAITING_COPY_APPROVAL: 'awaiting_copy_approval',// ✋ 체크포인트 ①.5 — 카피 검토·수정·승인
  AWAITING_OPTION: 'awaiting_option',              // ✋ 체크포인트 ② — 스타일 프리뷰 중 복수 선택
  AWAITING_CONTENT_SUPPLEMENT: 'awaiting_content_supplement',
  BUILDING_FULLS: 'building_fulls',                // 카피 1회 + 스타일별 풀 HTML 병렬 생성
  AWAITING_FINAL_CHOICE: 'awaiting_final_choice',  // ✋ 체크포인트 ③
  BUILDING: 'building',                            // (레거시 — 단일 빌드 경로용)
  AWAITING_CONFIRM: 'awaiting_confirm',            // (레거시)
  DEPLOYING: 'deploying',
};

const DIR = paths.sessionsDir;
const LEGACY_FILE = paths.sessionFile;

// 그룹 ID → SessionState Map
const sessions = new Map();

// 초기 로드 — sessions/*.json 전체 + 레거시 session.json 처리
_loadAllFromDisk();

function _sessionPath(groupId) {
  return path.join(DIR, `${groupId}.json`);
}

function _ensureDir() {
  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR, { recursive: true });
  }
}

function _loadAllFromDisk() {
  try {
    _ensureDir();

    // 레거시 session.json 처리 — 존재하면 경고 + 삭제 (복원 불가)
    if (fs.existsSync(LEGACY_FILE)) {
      console.warn(`[state] 레거시 session.json 발견 → 다중 그룹 구조로 전환되어 폐기됨. 진행 중 세션이 있었다면 리셋됨.`);
      try { fs.unlinkSync(LEGACY_FILE); } catch {}
    }

    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const groupId = Number(f.replace(/\.json$/, ''));
      if (!Number.isFinite(groupId)) continue;
      try {
        const raw = fs.readFileSync(path.join(DIR, f), 'utf-8');
        if (!raw.trim()) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') continue;
        // 타임아웃 지난 세션은 버리기
        if (Date.now() - (parsed.lastActivity || 0) > SESSION_TIMEOUT_MS) {
          console.log(`[state] [g:${groupId}] 저장 세션이 타임아웃 지남 (${Math.round((Date.now() - parsed.lastActivity) / 60000)}분 전) — 무시`);
          try { fs.unlinkSync(path.join(DIR, f)); } catch {}
          continue;
        }
        sessions.set(groupId, parsed);
        console.log(`[state] [g:${groupId}] 세션 복원: state=${parsed.state} audience=${parsed.audience || '미정'} options=${parsed.options?.length || 0}개`);
      } catch (e) {
        console.warn(`[state] [g:${groupId}] 세션 읽기 실패 (${e.message}) — 무시`);
      }
    }
    if (sessions.size === 0) {
      console.log(`[state] 복원할 세션 없음 — 새 시작`);
    }
  } catch (e) {
    console.error(`[state] _loadAllFromDisk 실패:`, e.message);
  }
}

function _saveToDisk(groupId) {
  try {
    _ensureDir();
    const session = sessions.get(groupId);
    const file = _sessionPath(groupId);
    if (session) {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(session, null, 2), 'utf-8');
      fs.renameSync(tmp, file);
    } else {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch (e) {
    console.error(`[state] [g:${groupId}] 저장 실패:`, e.message);
  }
}

/**
 * 그룹의 세션 조회. 타임아웃 지났으면 자동 폐기 후 null.
 */
export function getSession(groupId) {
  if (groupId == null) throw new Error('getSession: groupId 필수');
  const session = sessions.get(groupId);
  if (!session) return null;
  if (Date.now() - session.lastActivity > SESSION_TIMEOUT_MS) {
    sessions.delete(groupId);
    _saveToDisk(groupId);
    return null;
  }
  return session;
}

/**
 * 새 세션 시작. 기존 세션 있으면 덮어씀.
 */
export function newSession(groupId, initial = {}) {
  if (groupId == null) throw new Error('newSession: groupId 필수');
  const session = {
    state: STATES.IDLE,
    groupId,
    lastActivity: Date.now(),
    sourceText: null,
    sourcePath: null,
    notionUrl: null,
    audience: null,
    scopeChoice: null,
    options: null,
    optionChoice: null,
    recommendedOption: null,
    outline: null,
    copy: null,
    html: null,
    slug: null,
    deployUrl: null,
    userNotes: [],
    revisionCount: 0,
    previewAttachments: null,
    styleChoices: [],
    copyDraft: null,
    copyDrafts: null,
    chosenProvider: null,
    copyApproved: false,
    copyRevCount: 0,
    fullVersions: {},
    finalChoice: null,
    pendingNotes: {},
    ...initial,
  };
  sessions.set(groupId, session);
  _saveToDisk(groupId);
  return session;
}

export function updateSession(groupId, patch) {
  if (groupId == null) throw new Error('updateSession: groupId 필수');
  const session = sessions.get(groupId);
  if (!session) return null;
  Object.assign(session, patch, { lastActivity: Date.now() });
  _saveToDisk(groupId);
  return session;
}

export function resetSession(groupId) {
  if (groupId == null) throw new Error('resetSession: groupId 필수');
  sessions.delete(groupId);
  _saveToDisk(groupId);
}

// 디버깅·모니터링용
export function listActiveGroups() {
  return Array.from(sessions.keys());
}
