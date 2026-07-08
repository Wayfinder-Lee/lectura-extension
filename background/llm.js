/**
 * LLM API module — OpenAI-compatible chat completions.
 * Used as fallback when local ECDICT dictionary misses a word,
 * and for generating example sentences on demand.
 */

import { getSettings } from './storage.js';

/**
 * Call an OpenAI-compatible chat completions API.
 * @param {Array<{role:string, content:string}>} messages
 * @returns {Promise<{success:boolean, data?:string, error?:string}>}
 */
export async function chatCompletion(messages) {
  const settings = await getSettings();
  const apiKey = settings.llmApiKey;
  const provider = settings.llmProvider || 'openai';
  const model = settings.llmModel || 'gpt-4o-mini';

  if (!apiKey) {
    return { success: false, error: '请先在设置页面配置 LLM API Key' };
  }

  const endpoints = {
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
    anthropic: 'https://api.anthropic.com/v1/messages',
  };

  let url;
  if (provider === 'custom') {
    let base = settings.llmEndpoint || 'https://api.openai.com/v1';
    // Strip trailing slash
    base = base.replace(/\/+$/, '');
    // Auto-append /v1/chat/completions if not already a full chat endpoint path
    if (!base.endsWith('/chat/completions')) {
      if (!base.endsWith('/v1')) base += '/v1';
      base += '/chat/completions';
    }
    url = base;
  } else {
    url = endpoints[provider];
  }

  try {
    let body, headers;

    if (provider === 'anthropic') {
      // Anthropic API format
      const systemMsg = messages.find(m => m.role === 'system');
      const userMsgs = messages.filter(m => m.role === 'user');
      body = JSON.stringify({
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemMsg?.content || '',
        messages: userMsgs.map(m => ({ role: 'user', content: m.content }))
      });
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      };
    } else {
      // OpenAI format
      body = JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.3,
        max_tokens: 1024
      });
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      const preview = errText.slice(0, 300).replace(/</g, '&lt;');
      return { success: false, error: `LLM HTTP ${response.status}: ${preview}` };
    }

    const json = await response.json();

    // Extract content from response
    let content;
    if (provider === 'anthropic') {
      content = json.content?.[0]?.text || '';
    } else {
      content = json.choices?.[0]?.message?.content || '';
    }

    if (!content) {
      return { success: false, error: `LLM 返回空内容。请检查模型名称是否正确。原始响应: ${JSON.stringify(json).slice(0, 300)}` };
    }

    return { success: true, data: content.trim() };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'LLM 请求超时' };
    }
    return { success: false, error: `LLM 错误: ${err.message}` };
  }
}

/**
 * Parse LLM JSON response for word lookup.
 * Expected format: { phonetic, pos, definitions: [], examType, examples: [{en, zh}] }
 */
export function parseWordResponse(text) {
  try {
    // Try to extract JSON from response (may be wrapped in markdown code block)
    let json = text;
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) json = match[1].trim();
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Parse LLM response for sentence translation.
 * Expected: plain Chinese text or JSON { translation }
 */
export function parseTranslationResponse(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed.translation || parsed.text || text;
  } catch {
    return text;
  }
}
