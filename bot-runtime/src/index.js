// 메인 엔트리 — Telegram 롱 폴링 + 이벤트 디스패치 (다중 그룹 지원)
import path from 'node:path';
import { bots, paths, env, POLL_INTERVAL_MS } from './config.js';
import { getUpdates, sendMessage, downloadFile, getMe } from './telegram.js';
import { handleSourceReceived, handleUserText, runWithGroup } from './pipeline.js';
import { buildBrandCatalog } from './agents.js';
import { startGalleryServer } from './gallery.js';
import fs from 'node:fs/promises';

console.log('🤖 카드뉴스 봇 런타임 시작...');

// 시작 시 3봇 연결 확인
async function verifyBots() {
  for (const [key, bot] of Object.entries(bots)) {
    try {
      const info = await getMe(bot);
      console.log(`  ✅ ${key}: @${info.username}`);
    } catch (e) {
      console.error(`  ❌ ${key}: ${e.message}`);
      throw e;
    }
  }
}

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg) return;

  // 봇 자신이 보낸 메시지 무시 (우리 3봇)
  if (msg.from?.is_bot) return;

  const chatId = msg.chat?.id;
  if (chatId == null) return;

  const preview = msg.document
    ? `[file: ${msg.document.file_name} ${msg.document.file_size}B]`
    : (msg.text || '').slice(0, 100).replace(/\n/g, ' ');
  console.log(`[${new Date().toISOString()}] [g:${chatId}] 수신 from=${msg.from?.first_name} text="${preview}"`);

  try {
    // 1) 파일 첨부 (md/txt)
    if (msg.document) {
      const fileName = msg.document.file_name || 'source.md';
      if (!/\.(md|txt)$/i.test(fileName)) {
        await sendMessage(bots.editor, `⚠️ .md 또는 .txt 파일만 받습니다.\n\n— 편집장`, chatId);
        return;
      }
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const destPath = path.join(paths.sourcesDir, ym, fileName);
      await downloadFile(bots.editor, msg.document.file_id, destPath);
      console.log(`  📥 [g:${chatId}] 파일 저장: ${destPath}`);

      const sourceText = await fs.readFile(destPath, 'utf-8');
      await runWithGroup(chatId, () => handleSourceReceived(sourceText));
      return;
    }

    // 2) 텍스트 메시지
    if (msg.text) {
      await runWithGroup(chatId, () => handleUserText(msg.text));
    }
  } catch (e) {
    console.error(`❌ [g:${chatId}] 처리 중 에러:`, e);
    try {
      await sendMessage(bots.editor, `❌ 처리 중 에러 발생: ${String(e.message || e).slice(0, 200)}\n\n— 편집장`, chatId);
    } catch {}
  }
}

async function pollLoop() {
  while (true) {
    try {
      const updates = await getUpdates(bots.editor, 25);
      for (const u of updates) {
        await handleUpdate(u);
      }
    } catch (e) {
      console.error('⚠️ 폴링 에러:', e.message);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

// 시작
(async () => {
  try {
    await verifyBots();
    // 디자인 브랜드 카탈로그 빌드 (서버 시작 시 1회)
    const catalog = await buildBrandCatalog();
    console.log(`  🎨 디자인 카탈로그: ${catalog.cards.length}개 브랜드 로드`);

    // 갤러리 프리뷰 서버 시작 (localhost:4000)
    startGalleryServer();
    const groupIds = env.TELEGRAM_GROUP_IDS_LIST;
    console.log(`  📍 허용 그룹 (${groupIds.length}개): ${groupIds.join(', ')}`);
    console.log('\n📡 폴링 시작. Ctrl+C 로 종료.\n');

    // 모든 허용 그룹에 시작 인사
    for (const gid of groupIds) {
      try {
        await sendMessage(bots.editor, `한화디자인스쿨에 오신 것을 환영합니다\n무엇이든 제작 가능합니다\n내용만 던져주세요`, gid);
      } catch (e) {
        console.warn(`⚠️ [g:${gid}] 시작 인사 실패 (봇이 이 그룹 멤버 아닐 수 있음): ${e.message}`);
      }
    }

    await pollLoop();
  } catch (e) {
    console.error('시작 실패:', e);
    process.exit(1);
  }
})();

// 종료 시그널
process.on('SIGINT', async () => {
  console.log('\n🛑 종료 시그널. 안녕히 가세요.');
  const groupIds = env.TELEGRAM_GROUP_IDS_LIST;
  for (const gid of groupIds) {
    try {
      await sendMessage(bots.editor, `🛑 편집장 봇 종료됩니다.`, gid);
    } catch {}
  }
  process.exit(0);
});
