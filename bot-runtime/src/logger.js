// 타임스탬프 + 선택적 groupId 태그 구조화 로그 (stdout → bot.log 로 수집됨)

function ts() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function g(groupId) {
  return groupId != null ? `[g:${groupId}] ` : '';
}

export function info(tag, msg, extra, groupId) {
  const line = extra
    ? `[${ts()}] ℹ️  ${g(groupId)}${tag} ${msg} ${JSON.stringify(extra)}`
    : `[${ts()}] ℹ️  ${g(groupId)}${tag} ${msg}`;
  console.log(line);
}

export function warn(tag, msg, extra, groupId) {
  const line = extra
    ? `[${ts()}] ⚠️  ${g(groupId)}${tag} ${msg} ${JSON.stringify(extra)}`
    : `[${ts()}] ⚠️  ${g(groupId)}${tag} ${msg}`;
  console.warn(line);
}

export function error(tag, msg, err, groupId) {
  const stack = err && err.stack ? `\n${err.stack}` : (err ? ` ${String(err)}` : '');
  console.error(`[${ts()}] ❌ ${g(groupId)}${tag} ${msg}${stack}`);
}

export function state(from, to, reason = '', groupId) {
  console.log(`[${ts()}] 🔄 ${g(groupId)}STATE ${from} → ${to}${reason ? ' · ' + reason : ''}`);
}

export function llm(phase, meta, groupId) {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts()}] 🧠 ${g(groupId)}LLM ${phase}${payload}`);
}

/**
 * 그룹 ID 를 자동 바인딩한 로거 조각 반환. pipeline.js 의 긴 함수에서 편하게 사용.
 *   const lg = log.forGroup(groupId);
 *   lg.info('TAG', 'msg');
 *   lg.state(from, to, reason);
 */
export function forGroup(groupId) {
  return {
    info: (tag, msg, extra) => info(tag, msg, extra, groupId),
    warn: (tag, msg, extra) => warn(tag, msg, extra, groupId),
    error: (tag, msg, err) => error(tag, msg, err, groupId),
    state: (from, to, reason) => state(from, to, reason, groupId),
    llm: (phase, meta) => llm(phase, meta, groupId),
  };
}
