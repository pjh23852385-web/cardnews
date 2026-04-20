import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// bot-runtime/src/config.js → 프로젝트 루트는 ../..
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// 프로젝트 루트의 .env 강제 지정 (bot-runtime 서브디렉토리에서 실행돼도 찾을 수 있게)
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

export const paths = {
  root: PROJECT_ROOT,
  claudeMd: path.join(PROJECT_ROOT, 'CLAUDE.md'),
  designMd: path.join(PROJECT_ROOT, 'design.md'),
  designsDir: path.join(PROJECT_ROOT, 'designs'),
  designLibraryDir: path.resolve(PROJECT_ROOT, '..', '..', 'DESIGN-library-all'),
  sourcesDir: path.join(PROJECT_ROOT, 'sources'),
  outputDir: path.join(PROJECT_ROOT, 'output'),
  assetsDir: path.join(PROJECT_ROOT, 'assets'),
  agentsDir: path.join(PROJECT_ROOT, '.claude', 'agents'),
  telegramDir: path.join(PROJECT_ROOT, '.claude', 'telegram'),
  sessionFile: path.join(__dirname, '..', 'session.json'),  // 레거시 단일 파일 (마이그레이션 대상)
  sessionsDir: path.join(__dirname, '..', 'sessions'),       // 그룹별 세션 파일 디렉터리
};

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 없음. .env 확인`);
  return v;
}

// 그룹 ID 복수 파싱 — 하위 호환: TELEGRAM_GROUP_ID 단수도 허용
function parseGroupIds() {
  const raw = process.env.TELEGRAM_GROUP_IDS || process.env.TELEGRAM_GROUP_ID || '';
  const ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n !== 0);
  if (ids.length === 0) {
    throw new Error('환경변수 TELEGRAM_GROUP_IDS (또는 TELEGRAM_GROUP_ID) 필수. 쉼표 구분 여러 그룹 허용.');
  }
  return ids;
}

const GROUP_IDS = parseGroupIds();

export const env = {
  ANTHROPIC_API_KEY: required('ANTHROPIC_API_KEY'),
  OPENAI_API_KEY: required('OPENAI_API_KEY'),  // 이미지 생성 + 카피 A/B 비교 (GPT-5) — 필수
  TELEGRAM_BOT_EDITOR: required('TELEGRAM_BOT_EDITOR'),
  TELEGRAM_BOT_COPY: required('TELEGRAM_BOT_COPY'),
  TELEGRAM_BOT_ART: required('TELEGRAM_BOT_ART'),
  TELEGRAM_GROUP_IDS: new Set(GROUP_IDS),                // 허용된 그룹 ID Set (다중)
  TELEGRAM_GROUP_IDS_LIST: GROUP_IDS,                    // 순서 유지 배열 (시작 메시지 전송용)
  TELEGRAM_GROUP_ID: GROUP_IDS[0],                       // 레거시 호환 — 첫 번째 그룹
};

export const bots = {
  editor: {
    token: env.TELEGRAM_BOT_EDITOR,
    username: '@HanwhaFinanceNewsBot',
    role: 'editor',
    label: '편집장',
  },
  copywriter: {
    token: env.TELEGRAM_BOT_COPY,
    username: '@hl_copywriter_bot',
    role: 'copywriter',
    label: '카피',
  },
  artDirector: {
    token: env.TELEGRAM_BOT_ART,
    username: '@hl_artdirector_bot',
    role: 'art-director',
    label: '아트',
  },
};

// 모델 매핑 (역할별)
// - 2026-04-16: 카피 품질 최우선 → Sonnet 자리 전부 Opus 로 상향
// - 2026-04-16: 카피 A/B 비교를 위해 OpenAI GPT-5 병행
export const models = {
  light: 'claude-haiku-4-5-20251001',       // 정의만 유지 (현재 미사용)
  main: 'claude-opus-4-6',                   // 모든 Claude 작업 (파싱/대화/카피-A/아트/편집장/QA)
  heavy: 'claude-opus-4-6',                  // HTML 생성
  gpt: 'gpt-5',                              // 카피-B (OpenAI GPT-5, 비교용)
};

export const POLL_INTERVAL_MS = 2000;         // 2초 주기 getUpdates
export const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24시간 무응답 → 세션 초기화 (점심·외출 대비)
