// 에이전트 system prompt 로드 (.claude/agents/*.md 파일)
import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from './config.js';

// CLAUDE.md 핵심 철학 + 디자인 스타일 요약을 system prompt 앞에 붙여 컨텍스트 주입
let cachedClaudeMd = null;
let cachedDesigns = null;

export async function loadClaudeMd() {
  if (cachedClaudeMd) return cachedClaudeMd;
  cachedClaudeMd = await fs.readFile(paths.claudeMd, 'utf-8');
  return cachedClaudeMd;
}

export async function loadCurrentDesign() {
  const designMd = await fs.readFile(paths.designMd, 'utf-8');
  const m = designMd.match(/current_style:\s*(\S+)/);
  const styleName = m ? m[1] : 'voltagent';
  const stylePath = path.join(paths.designsDir, `${styleName}.md`);
  try {
    const styleContent = await fs.readFile(stylePath, 'utf-8');
    return { name: styleName, content: styleContent };
  } catch {
    return { name: styleName, content: '' };
  }
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
