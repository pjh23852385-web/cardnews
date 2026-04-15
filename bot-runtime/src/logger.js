// 타임스탬프 포함 구조화 로그 (stdout → bot.log 로 수집됨)

function ts() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function info(tag, msg, extra) {
  const line = extra ? `[${ts()}] ℹ️  ${tag} ${msg} ${JSON.stringify(extra)}` : `[${ts()}] ℹ️  ${tag} ${msg}`;
  console.log(line);
}

export function warn(tag, msg, extra) {
  const line = extra ? `[${ts()}] ⚠️  ${tag} ${msg} ${JSON.stringify(extra)}` : `[${ts()}] ⚠️  ${tag} ${msg}`;
  console.warn(line);
}

export function error(tag, msg, err) {
  const stack = err && err.stack ? `\n${err.stack}` : (err ? ` ${String(err)}` : '');
  console.error(`[${ts()}] ❌ ${tag} ${msg}${stack}`);
}

export function state(from, to, reason = '') {
  console.log(`[${ts()}] 🔄 STATE ${from} → ${to}${reason ? ' · ' + reason : ''}`);
}

export function llm(phase, meta) {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts()}] 🧠 LLM ${phase}${payload}`);
}
