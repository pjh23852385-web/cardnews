// Telegram Bot API wrapper (fetch 기반, 의존성 최소)
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from './config.js';

const API_BASE = 'https://api.telegram.org';

async function call(token, method, payload) {
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram ${method} 실패: ${json.description || JSON.stringify(json)}`);
  }
  return json.result;
}

/**
 * 타이핑 중... 인디케이터 (사용자에게 봇이 작업 중임을 알림)
 * 텔레그램 액션은 5초간 지속. 길어지는 작업이면 주기적으로 재호출.
 */
export async function sendTyping(bot) {
  return call(bot.token, 'sendChatAction', {
    chat_id: env.TELEGRAM_GROUP_ID,
    action: 'typing',
  }).catch(() => {}); // 실패해도 무시 (크리티컬 X)
}

export async function sendMessage(bot, text, extra = {}) {
  return call(bot.token, 'sendMessage', {
    chat_id: env.TELEGRAM_GROUP_ID,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...extra,
  }).catch((e) => {
    // Markdown 파싱 에러면 plain text 재시도
    if (String(e).includes("can't parse") || String(e).includes('parse')) {
      return call(bot.token, 'sendMessage', {
        chat_id: env.TELEGRAM_GROUP_ID,
        text,
        disable_web_page_preview: true,
        ...extra,
      });
    }
    throw e;
  });
}

export async function getMe(bot) {
  return call(bot.token, 'getMe', {});
}

// 편집장 기준으로 그룹 메시지를 폴링 (updates offset 관리)
let offset = 0;

export async function getUpdates(bot, timeout = 25) {
  const url = `${API_BASE}/bot${bot.token}/getUpdates?offset=${offset}&timeout=${timeout}&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`getUpdates 실패: ${json.description}`);
  }
  if (json.result.length > 0) {
    offset = json.result[json.result.length - 1].update_id + 1;
  }
  // 대상 그룹만 필터링
  return json.result.filter((u) => {
    const chatId = u.message?.chat?.id;
    return chatId === env.TELEGRAM_GROUP_ID;
  });
}

// 파일을 그룹에 업로드 (sendDocument)
export async function sendDocument(bot, filePath, caption = '') {
  const fs2 = await import('node:fs');
  const path2 = await import('node:path');
  const fileName = path2.basename(filePath);
  const safeName = /[^\x00-\x7F]/.test(fileName) ? `cardnews-${Date.now()}.html` : fileName;
  const tmpPath = path2.join(process.env.TEMP || '/tmp', safeName);
  fs2.copyFileSync(filePath, tmpPath);

  const form = new FormData();
  form.append('chat_id', String(env.TELEGRAM_GROUP_ID));
  if (caption) form.append('caption', caption);
  const fileBuf = fs2.readFileSync(tmpPath);
  const blob = new Blob([fileBuf], { type: 'text/html' });
  form.append('document', blob, safeName);

  const res = await fetch(`${API_BASE}/bot${bot.token}/sendDocument`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`sendDocument 실패: ${json.description}`);
  return json.result;
}

// 파일 다운로드
export async function downloadFile(bot, fileId, destPath) {
  // 1) 파일 경로 조회
  const fileInfo = await call(bot.token, 'getFile', { file_id: fileId });
  const fileUrl = `${API_BASE}/file/bot${bot.token}/${fileInfo.file_path}`;
  // 2) 다운로드
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`파일 다운로드 실패 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // 3) 디렉토리 생성 + 저장
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
  return destPath;
}
