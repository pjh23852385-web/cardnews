// 연결 체크 스크립트 — 실제 폴링 시작 전 안전 점검
import { bots, env } from './config.js';
import { getMe, sendMessage } from './telegram.js';
import Anthropic from '@anthropic-ai/sdk';
import { loadClaudeMd, loadCurrentDesign, loadAgentSystem } from './agents.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

console.log('🔍 스모크 테스트 시작\n');

async function check(label, fn) {
  try {
    const result = await fn();
    console.log(`  ✅ ${label}: ${result || 'OK'}`);
    return true;
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.message}`);
    return false;
  }
}

async function main() {
  let allPass = true;

  allPass &= await check('OpenAI 키 존재', async () => env.OPENAI_API_KEY ? 'OK' : '(선택사항 — 이미지 생성용)');
  allPass &= await check('Anthropic 키 존재', async () => env.ANTHROPIC_API_KEY ? 'OK' : 'MISSING');
  allPass &= await check('그룹 ID', async () => env.TELEGRAM_GROUP_ID);

  console.log('\n📨 Telegram 봇 연결 확인:');
  for (const [key, bot] of Object.entries(bots)) {
    allPass &= await check(`  ${key} (${bot.label})`, async () => {
      const info = await getMe(bot);
      return `@${info.username}`;
    });
  }

  console.log('\n🧠 Claude API 연결 확인:');
  allPass &= await check('Claude Haiku 4.5', async () => {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'say OK' }],
    });
    return r.content[0]?.text?.trim() || 'empty';
  });

  console.log('\n📁 프로젝트 파일 로드 확인:');
  allPass &= await check('CLAUDE.md', async () => `${(await loadClaudeMd()).length} chars`);
  allPass &= await check('design.md (현재 스타일)', async () => (await loadCurrentDesign()).name);
  for (const role of ['editor', 'copywriter', 'art-director']) {
    allPass &= await check(`agents/${role}.md`, async () => `${(await loadAgentSystem(role)).length} chars`);
  }

  if (allPass) {
    console.log('\n🎉 모든 연결 정상. 그룹방에 테스트 메시지 전송...\n');
    await sendMessage(bots.editor, `🤖 스모크 테스트 통과. 런타임 시작할 준비 완료.`);
    console.log('  ✅ 그룹방 전송 완료\n');
  } else {
    console.log('\n⚠️ 일부 체크 실패. 런타임 시작 전 수정 필요.\n');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('스모크 실패:', e);
  process.exit(1);
});
