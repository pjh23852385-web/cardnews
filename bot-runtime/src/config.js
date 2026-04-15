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
  sourcesDir: path.join(PROJECT_ROOT, 'sources'),
  outputDir: path.join(PROJECT_ROOT, 'output'),
  assetsDir: path.join(PROJECT_ROOT, 'assets'),
  agentsDir: path.join(PROJECT_ROOT, '.claude', 'agents'),
  telegramDir: path.join(PROJECT_ROOT, '.claude', 'telegram'),
  sessionFile: path.join(__dirname, '..', 'session.json'),  // bot-runtime/session.json — 재시작 복원용
};

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 없음. .env 확인`);
  return v;
}

export const env = {
  ANTHROPIC_API_KEY: required('ANTHROPIC_API_KEY'),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '', // 이미지 생성용 (선택)
  TELEGRAM_BOT_EDITOR: required('TELEGRAM_BOT_EDITOR'),
  TELEGRAM_BOT_COPY: required('TELEGRAM_BOT_COPY'),
  TELEGRAM_BOT_ART: required('TELEGRAM_BOT_ART'),
  TELEGRAM_GROUP_ID: Number(required('TELEGRAM_GROUP_ID')),
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

// Claude 모델 매핑 (역할별)
export const models = {
  light: 'claude-haiku-4-5-20251001',       // 라우팅, 파싱 같은 가벼운 작업
  main: 'claude-sonnet-4-6',                 // 카피 / 옵션 제안 등 일반
  heavy: 'claude-opus-4-6',                  // HTML 생성 같은 헤비 작업
};

export const POLL_INTERVAL_MS = 2000;         // 2초 주기 getUpdates
export const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2시간 무응답 → 세션 초기화
