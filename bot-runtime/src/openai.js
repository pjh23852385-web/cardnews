// OpenAI Chat Completions 클라이언트 (카피 A/B 비교용)
// 의존성 최소화 — fetch 로 직접 호출. claude.js 와 같은 시그니처.
import { env, models } from './config.js';
import * as log from './logger.js';

const DEFAULT_TIMEOUT_MS = 180_000;  // 3분 (GPT-5 는 Opus보다 약간 느릴 수 있음)

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * OpenAI Chat Completions 호출 (재시도 3회 + 타임아웃)
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} opts - { model, maxTokens, json, timeoutMs }
 * @returns {Promise<{text, json, usage}>}
 */
export async function callOpenAI(systemPrompt, userPrompt, opts = {}) {
  const model = opts.model || models.gpt;
  const maxTokens = opts.maxTokens || 4096;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRetries = 3;

  const body = {
    model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (opts.json) {
    body.response_format = { type: 'json_object' };
  }
  // GPT-5 는 reasoning 모델 — reasoning tokens 소모로 출력 부족 방지
  // 카피 생성 같은 빠른 생성 작업은 reasoning 최소화
  if (/^(gpt-5|o1|o3)/.test(model)) {
    body.reasoning_effort = opts.reasoningEffort || 'minimal';
  }

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error(`OpenAI timeout ${timeoutMs}ms`)), timeoutMs);
    log.llm('openai.call.start', { model, maxTokens, timeoutMs, attempt });

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 300)}`);
      }
      const json = await res.json();
      const ms = Date.now() - started;
      const content = json.choices?.[0]?.message?.content || '';
      log.llm('openai.call.ok', {
        model,
        ms,
        inputTok: json.usage?.prompt_tokens,
        outputTok: json.usage?.completion_tokens,
      });
      return _processResponse(content, opts, json.usage);
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const errMsg = String(e.message || e);
      const isTimeout = ac.signal.aborted || /abort|timeout/i.test(errMsg);
      const transient = isTimeout || errMsg.match(/fetch failed|ECONNRESET|ETIMEDOUT|rate.?limit|overloaded|503|502|504|429/i);
      log.warn('OPENAI', `call.fail attempt=${attempt}/${maxRetries} timeout=${isTimeout} msg=${errMsg.slice(0,120)}`);
      if (!transient || attempt === maxRetries) {
        log.error('OPENAI', `call.giveup after ${attempt} attempts`, e);
        throw e;
      }
      const waitMs = 1500 * Math.pow(2, attempt - 1);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

function _processResponse(text, opts, usage) {
  if (opts.json) {
    // response_format:json_object 로 요청했으면 text 자체가 valid JSON
    try {
      return { text, json: JSON.parse(text), usage };
    } catch (e) {
      // fallback: 코드 블록 또는 balanced-braces 매칭
      const fenced = text.match(/```json\s*([\s\S]*?)```/);
      if (fenced) {
        try { return { text, json: JSON.parse(fenced[1].trim()), usage }; } catch {}
      }
      const firstBrace = text.indexOf('{');
      if (firstBrace >= 0) {
        let depth = 0, lastClose = -1;
        for (let i = firstBrace; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') { depth--; if (depth === 0) { lastClose = i; break; } }
        }
        if (lastClose > firstBrace) {
          try {
            return { text, json: JSON.parse(text.substring(firstBrace, lastClose + 1)), usage };
          } catch {}
        }
      }
      log.warn('OPENAI', `JSON 파싱 실패 (앞 300자): ${text.slice(0, 300)}`);
      return { text, json: null, jsonError: String(e), usage };
    }
  }
  return { text, usage };
}
