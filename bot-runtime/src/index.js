// 메인 엔트리 — Telegram 롱 폴링 + 이벤트 디스패치
import path from 'node:path';
import { bots, paths, POLL_INTERVAL_MS } from './config.js';
import { getUpdates, sendMessage, downloadFile, getMe } from './telegram.js';
import { handleSourceReceived, handleUserText } from './pipeline.js';
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

  const preview = msg.document
    ? `[file: ${msg.document.file_name} ${msg.document.file_size}B]`
    : (msg.text || '').slice(0, 100).replace(/\n/g, ' ');
  console.log(`[${new Date().toISOString()}] 수신 from=${msg.from?.first_name} text="${preview}"`);

  try {
    // 1) 파일 첨부 (md/txt)
    if (msg.document) {
      const fileName = msg.document.file_name || 'source.md';
      if (!/\.(md|txt)$/i.test(fileName)) {
        await sendMessage(bots.editor, `⚠️ .md 또는 .txt 파일만 받습니다.\n\n— 편집장`);
        return;
      }
      // 다운로드
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const destPath = path.join(paths.sourcesDir, ym, fileName);
      await downloadFile(bots.editor, msg.document.file_id, destPath);
      console.log(`  📥 파일 저장: ${destPath}`);

      const sourceText = await fs.readFile(destPath, 'utf-8');
      await handleSourceReceived(sourceText);
      return;
    }

    // 2) 텍스트 메시지
    if (msg.text) {
      await handleUserText(msg.text);
    }
  } catch (e) {
    console.error('❌ 처리 중 에러:', e);
    try {
      await sendMessage(bots.editor, `❌ 처리 중 에러 발생: ${String(e.message || e).slice(0, 200)}\n\n— 편집장`);
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
    console.log(`  📍 그룹 ID: ${process.env.TELEGRAM_GROUP_ID}`);
    console.log('\n📡 폴링 시작. Ctrl+C 로 종료.\n');
    await sendMessage(bots.editor, `🤖 편집장 봇 대기 시작. 카드뉴스 소스를 던져주세요.`);
    await pollLoop();
  } catch (e) {
    console.error('시작 실패:', e);
    process.exit(1);
  }
})();

// 종료 시그널
process.on('SIGINT', async () => {
  console.log('\n🛑 종료 시그널. 안녕히 가세요.');
  try {
    await sendMessage(bots.editor, `🛑 편집장 봇 종료됩니다.`);
  } catch {}
  process.exit(0);
});
