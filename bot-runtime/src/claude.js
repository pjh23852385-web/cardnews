// Anthropic Claude API 클라이언트 (에이전트 LLM 호출)
import Anthropic from '@anthropic-ai/sdk';
import { env, models } from './config.js';
import * as log from './logger.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// heavy 모델(HTML 생성 16K)은 응답 오래 걸림 → 더 긴 타임아웃
const DEFAULT_TIMEOUT_MS = 120_000;  // 2분
const HEAVY_TIMEOUT_MS   = 240_000;  // 4분

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 에이전트 호출 (자동 재시도 3회 + exponential backoff + 타임아웃)
 * @param {string} systemPrompt - 에이전트 soul (editor.md, copywriter.md 등)
 * @param {string} userPrompt - 이번 턴 작업 지시
 * @param {object} opts - { model, maxTokens, json, timeoutMs }
 */
export async function callAgent(systemPrompt, userPrompt, opts = {}) {
  const model = opts.model || models.main;
  const maxTokens = opts.maxTokens || 4096;
  const timeoutMs = opts.timeoutMs
    || (model === models.heavy ? HEAVY_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const maxRetries = 3;

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error(`LLM timeout ${timeoutMs}ms`)), timeoutMs);
    log.llm('call.start', { model, maxTokens, timeoutMs, attempt });
    try {
      const msg = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }, { signal: ac.signal });
      clearTimeout(timer);
      const ms = Date.now() - started;
      log.llm('call.ok', { model, ms, inputTok: msg.usage?.input_tokens, outputTok: msg.usage?.output_tokens });
      return _processMessage(msg, opts);
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const errMsg = String(e.message || e);
      const isTimeout = ac.signal.aborted || /abort|timeout/i.test(errMsg);
      const transient = isTimeout || errMsg.match(/fetch failed|ECONNRESET|ETIMEDOUT|rate.?limit|overloaded|503|502|504/i);
      log.warn('LLM', `call.fail attempt=${attempt}/${maxRetries} timeout=${isTimeout} msg=${errMsg.slice(0,120)}`);
      if (!transient || attempt === maxRetries) {
        log.error('LLM', `call.giveup after ${attempt} attempts`, e);
        throw e;
      }
      const waitMs = 1500 * Math.pow(2, attempt - 1); // 1.5s → 3s → 6s
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

function _processMessage(msg, opts) {

  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  if (opts.json) {
    // 1) ```json ... ``` 블록 우선
    let jsonStr = null;
    const fenced = text.match(/```json\s*([\s\S]*?)```/);
    if (fenced) {
      jsonStr = fenced[1].trim();
    } else {
      // 2) 가장 큰 balanced { ... } 찾기 (greedy 방식 대신 balanced matching)
      const firstBrace = text.indexOf('{');
      if (firstBrace >= 0) {
        let depth = 0;
        let lastClose = -1;
        for (let i = firstBrace; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') {
            depth--;
            if (depth === 0) {
              lastClose = i;
              break;
            }
          }
        }
        if (lastClose > firstBrace) {
          jsonStr = text.substring(firstBrace, lastClose + 1);
        }
      }
    }

    if (jsonStr) {
      try {
        return { text, json: JSON.parse(jsonStr) };
      } catch (e) {
        console.error(`⚠️ JSON 파싱 에러: ${e.message}`);
        console.error(`RAW 응답 (앞 500자): ${text.slice(0, 500)}`);
        console.error(`시도한 JSON 문자열 (앞 300자): ${jsonStr.slice(0, 300)}`);
        return { text, json: null, jsonError: String(e) };
      }
    }
    console.error(`⚠️ JSON 블록 못 찾음. RAW 응답 (앞 500자): ${text.slice(0, 500)}`);
    return { text, json: null };
  }

  return { text, usage: msg.usage };
}

export { models };
