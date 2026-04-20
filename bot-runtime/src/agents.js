// 에이전트 system prompt 로드 (.claude/agents/*.md 파일)
import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from './config.js';
import * as log from './logger.js';

// CLAUDE.md 핵심 철학 + 디자인 스타일 요약을 system prompt 앞에 붙여 컨텍스트 주입
let cachedClaudeMd = null;
let cachedDesigns = null;
let cachedBrandCatalog = null;

export async function loadClaudeMd() {
  if (cachedClaudeMd) return cachedClaudeMd;
  cachedClaudeMd = await fs.readFile(paths.claudeMd, 'utf-8');
  return cachedClaudeMd;
}

export async function loadCurrentDesign() {
  const designMd = await fs.readFile(paths.designMd, 'utf-8');
  const m = designMd.match(/current_style:\s*(\S+)/);
  const styleName = m ? m[1] : 'LIFEPLUS';

  // 검색 순서: designs/{name}.md → designs/{name}/{name}-DESIGN.md → designs/{name}/DESIGN.md
  const candidates = [
    path.join(paths.designsDir, `${styleName}.md`),
    path.join(paths.designsDir, styleName, `${styleName}-DESIGN.md`),
    path.join(paths.designsDir, styleName, 'DESIGN.md'),
  ];
  for (const p of candidates) {
    try {
      const styleContent = await fs.readFile(p, 'utf-8');
      return { name: styleName, content: styleContent };
    } catch { /* 다음 후보 */ }
  }
  return { name: styleName, content: '' };
}

export async function loadAllDesigns() {
  if (cachedDesigns) return cachedDesigns;
  const files = await fs.readdir(paths.designsDir);
  const designs = {};
  for (const f of files) {
    if (f.endsWith('.md')) {
      const name = f.replace(/\.md$/, '');
      designs[name] = await fs.readFile(path.join(paths.designsDir, f), 'utf-8');
    }
  }
  cachedDesigns = designs;
  return designs;
}

// ──────────────────────────────────────────────
// 브랜드 카탈로그 + 동적 디자인 레퍼런스 시스템
// ──────────────────────────────────────────────

// 한글-영문 브랜드 매핑
const BRAND_ALIASES = {
  '토스': 'toss', '애플': 'apple', '스트라이프': 'stripe', '스트라입': 'stripe',
  '노션': 'notion', '피그마': 'figma', '리니어': 'linear.app', '버셀': 'vercel',
  '스포티파이': 'spotify', '에어비앤비': 'airbnb', '배민': 'baemin',
  '나이키': 'nike', '테슬라': 'tesla', '카카오': 'kakao', '메타': 'meta',
  '레이캐스트': 'raycast', '수파베이스': 'supabase', '클로드': 'claude',
  '페라리': 'ferrari', '람보르기니': 'lamborghini', '부가티': 'bugatti',
  '비엠더블유': 'bmw', 'BMW': 'bmw', '스타벅스': 'starbucks', '우버': 'uber',
  '엔비디아': 'nvidia', '쇼피파이': 'shopify', '핀터레스트': 'pinterest',
  '플레이스테이션': 'playstation', '마스터카드': 'mastercard', '코인베이스': 'coinbase',
  '와이어드': 'wired', '몽고디비': 'mongodb', '센트리': 'sentry',
  '웹플로우': 'webflow', '프레이머': 'framer', '미로': 'miro',
  '슈퍼휴먼': 'superhuman', '커서': 'cursor', '볼트에이전트': 'voltagent',
};

// 카테고리 매핑 (DESIGN-library-organized 기반)
const BRAND_CATEGORIES = {
  ai: ['claude', 'cohere', 'elevenlabs', 'minimax', 'mistral.ai', 'ollama', 'opencode.ai', 'replicate', 'runwayml', 'together.ai', 'voltagent', 'x.ai'],
  brand: ['apple', 'nike', 'spotify', 'tesla', 'spacex', 'ferrari', 'lamborghini', 'bugatti', 'bmw', 'airbnb', 'shopify', 'starbucks', 'meta', 'ibm', 'nvidia', 'pinterest', 'playstation', 'theverge', 'uber', 'vodafone', 'wired', 'renault'],
  'design-productivity': ['figma', 'framer', 'airtable', 'clay', 'notion', 'webflow', 'cal', 'intercom', 'miro'],
  'dev-tools': ['vercel', 'linear.app', 'cursor', 'lovable', 'raycast', 'superhuman', 'warp', 'sentry', 'posthog', 'resend', 'zapier', 'mintlify', 'expo', 'supabase'],
  finance: ['stripe', 'binance', 'mastercard', 'revolut', 'kraken', 'coinbase', 'wise'],
  infra: ['clickhouse', 'mongodb', 'sanity', 'hashicorp', 'composio'],
};

function _categoryOf(brandName) {
  for (const [cat, brands] of Object.entries(BRAND_CATEGORIES)) {
    if (brands.includes(brandName)) return cat;
  }
  return 'other';
}

/**
 * DESIGN-library-all/ 에서 69개 브랜드를 스캔하여 1줄짜리 카탈로그 카드로 압축.
 * 서버 시작 시 1회 실행, 메모리 캐시.
 * 반환: { cards: [ { name, category, colors, mood, filePath } ], summary: string }
 */
export async function buildBrandCatalog() {
  if (cachedBrandCatalog) return cachedBrandCatalog;

  const catalog = [];
  let dir;
  try {
    dir = await fs.readdir(paths.designLibraryDir);
  } catch {
    log.warn('DESIGN-library-all 폴더를 찾을 수 없음:', paths.designLibraryDir);
    cachedBrandCatalog = { cards: [], summary: '(디자인 라이브러리 미연결)' };
    return cachedBrandCatalog;
  }

  for (const file of dir) {
    if (!file.endsWith('-DESIGN.md')) continue;
    const brandName = file.replace(/-DESIGN\.md$/, '');
    const filePath = path.join(paths.designLibraryDir, file);

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Section 1에서 Key Characteristics 추출
      const moodMatch = content.match(/\*\*Key Characteristics:\*\*\s*\n([\s\S]*?)(?=\n##|\n\*\*|$)/);
      let mood = '';
      if (moodMatch) {
        mood = moodMatch[1]
          .split('\n')
          .filter(l => l.startsWith('-'))
          .slice(0, 3)
          .map(l => l.replace(/^-\s*/, '').replace(/\*\*/g, '').split(' -- ')[0].split('—')[0].trim())
          .filter(Boolean)
          .join(', ');
      }
      // mood가 비면 Section 1 첫 문장에서 핵심 키워드 추출
      if (!mood) {
        const sec1Match = content.match(/## 1\. Visual Theme & Atmosphere\s*\n+([\s\S]*?)(?=\n##)/);
        if (sec1Match) {
          const firstSentence = sec1Match[1].split(/\.\s/)[0] || '';
          mood = firstSentence.slice(0, 80);
        }
      }

      // Section 2에서 Primary 색상 hex 추출
      const hexMatches = [...content.matchAll(/#([0-9a-fA-F]{6})\b/g)];
      const colors = [...new Set(hexMatches.map(m => `#${m[1]}`))].slice(0, 3).join(' ');

      const category = _categoryOf(brandName);
      catalog.push({ name: brandName, category, colors, mood, filePath });
    } catch (e) {
      log.warn(`브랜드 파일 읽기 실패: ${file}`, e.message);
    }
  }

  // 프로젝트 내 designs/ 축약 스타일도 추가 (중복 제외)
  const existingNames = new Set(catalog.map(c => c.name));
  try {
    const designFiles = await fs.readdir(paths.designsDir);
    for (const f of designFiles) {
      if (!f.endsWith('.md')) continue;
      const name = f.replace(/\.md$/, '');
      // 폴더(getdesign.md, ohmydesign.md 등)나 이미 있는 브랜드는 건너뜀
      if (existingNames.has(name)) continue;
      try {
        const stat = await fs.stat(path.join(paths.designsDir, f));
        if (stat.isDirectory()) continue;
      } catch { continue; }
      const content = await fs.readFile(path.join(paths.designsDir, f), 'utf-8');
      const hexMatches = [...content.matchAll(/#([0-9a-fA-F]{6})\b/g)];
      const colors = [...new Set(hexMatches.map(m => `#${m[1]}`))].slice(0, 3).join(' ');
      catalog.push({ name, category: 'style', colors, mood: content.split('\n').find(l => l && !l.startsWith('#'))?.slice(0, 60) || '', filePath: path.join(paths.designsDir, f) });
    }
  } catch { /* designs/ 읽기 실패 무시 */ }

  // 카탈로그 요약 문자열 생성 (아트 프롬프트에 주입용)
  const summary = catalog
    .map(c => `${c.name} | ${c.category} | ${c.colors} | ${c.mood.slice(0, 60)}`)
    .join('\n');

  cachedBrandCatalog = { cards: catalog, summary };
  log.info(`브랜드 카탈로그 빌드 완료: ${catalog.length}개 브랜드`);
  return cachedBrandCatalog;
}

/**
 * 브랜드명으로 DESIGN.md 전문(또는 핵심 섹션)을 로드.
 * 검색 우선순위: designs/{name}.md (축약) > DESIGN-library-all/{name}-DESIGN.md > ohmydesign.md/{name}/DESIGN.md
 * @returns {{ name: string, content: string, source: string }} | null
 */
export async function loadBrandDesign(brandName) {
  const normalized = brandName.toLowerCase().trim();

  // 1순위: 프로젝트 내 축약본 (1~5KB, 토큰 절약)
  const shortPath = path.join(paths.designsDir, `${normalized}.md`);
  try {
    const stat = await fs.stat(shortPath);
    if (stat.isFile()) {
      const content = await fs.readFile(shortPath, 'utf-8');
      return { name: normalized, content, source: 'designs/' };
    }
  } catch { /* 없으면 다음 */ }

  // 2순위: DESIGN-library-all 전문 (Section 1-4만 추출)
  const fullPath = path.join(paths.designLibraryDir, `${normalized}-DESIGN.md`);
  try {
    const raw = await fs.readFile(fullPath, 'utf-8');
    const content = _extractKeySections(raw);
    return { name: normalized, content, source: 'library/' };
  } catch { /* 없으면 다음 */ }

  // 3순위: ohmydesign.md 하위
  const omdPath = path.join(paths.designsDir, 'ohmydesign.md', normalized, 'DESIGN.md');
  try {
    const raw = await fs.readFile(omdPath, 'utf-8');
    const content = _extractKeySections(raw);
    return { name: normalized, content, source: 'ohmydesign/' };
  } catch { /* 없으면 다음 */ }

  // 카탈로그에서 부분 매칭 시도 (예: "linear" → "linear.app")
  if (cachedBrandCatalog) {
    const match = cachedBrandCatalog.cards.find(c =>
      c.name.startsWith(normalized) || c.name.includes(normalized)
    );
    if (match) {
      try {
        const raw = await fs.readFile(match.filePath, 'utf-8');
        const content = _extractKeySections(raw);
        return { name: match.name, content, source: 'library/' };
      } catch { /* 실패 */ }
    }
  }

  return null;
}

/**
 * DESIGN.md 전문에서 Section 1-4 (Visual Theme, Color Palette, Typography, Component Stylings)만 추출.
 * 토큰 절약: ~17KB → ~8KB
 */
function _extractKeySections(raw) {
  const sections = [];
  // 제목(# Design System ...)도 포함
  const titleMatch = raw.match(/^#\s+.+/m);
  if (titleMatch) sections.push(titleMatch[0]);

  for (let i = 1; i <= 4; i++) {
    const pattern = new RegExp(`## ${i}\\. [\\s\\S]*?(?=\\n## \\d+\\.|$)`);
    const m = raw.match(pattern);
    if (m) sections.push(m[0]);
  }
  return sections.join('\n\n');
}

/**
 * 사용자 텍스트에서 디자인 브랜드 지시를 파싱.
 * "토스 느낌으로", "apple style", "애플 + 스트라이프 믹스" 등
 * @returns {{ requestedBrands: string[], mixMode: boolean }} | null
 */
export function resolveDesignIntent(userText) {
  if (!userText) return null;
  const text = userText.toLowerCase();

  const found = [];

  // 한글 별명 매칭
  for (const [alias, brandName] of Object.entries(BRAND_ALIASES)) {
    if (text.includes(alias.toLowerCase())) {
      if (!found.includes(brandName)) found.push(brandName);
    }
  }

  // 영문 브랜드명 직접 매칭 (카탈로그에서)
  if (cachedBrandCatalog) {
    for (const card of cachedBrandCatalog.cards) {
      if (text.includes(card.name.toLowerCase())) {
        if (!found.includes(card.name)) found.push(card.name);
      }
    }
  }

  if (found.length === 0) return null;

  // "믹스", "+", "합쳐", "섞어" 등 → mixMode
  const mixMode = found.length > 1 || /믹스|mix|합쳐|섞어|조합|\+/.test(text);

  return { requestedBrands: found, mixMode };
}

// 에이전트별 system prompt 로드 + CLAUDE.md 핵심 철학 주입
export async function loadAgentSystem(role) {
  const roleMap = {
    editor: 'editor.md',
    copywriter: 'copywriter.md',
    'art-director': 'art-director.md',
  };
  const file = roleMap[role];
  if (!file) throw new Error(`Unknown role: ${role}`);

  const agentMd = await fs.readFile(path.join(paths.agentsDir, file), 'utf-8');
  const claudeMd = await loadClaudeMd();

  // 핵심 철학 섹션만 추출
  const philosophyMatch = claudeMd.match(/##\s*핵심 철학[\s\S]*?(?=\n##\s|\Z)/);
  const philosophy = philosophyMatch ? philosophyMatch[0] : '';

  return `${philosophy}\n\n---\n\n${agentMd}\n\n---\n\n## 출력 규칙 (Telegram 그룹방 발화)
- **짧고 명료**: 1~5줄. 사족 X
- **한국어 기본**. 영문 용어는 그대로 (Vercel, Swiper.js 등)
- **이모지 1~2개/메시지** 정도까지만
- **호칭**: 주현대리 → 존댓말 + @주현대리 멘션, 봇끼리 → 반말, 호칭은 역할명(편집장/카피/아트)
- **순서 존중**: 다른 봇 작업 끼어들지 않음
- **핵심 철학**: 오디언스 없이 카피·디자인 진행 X`;
}
