import type { DeepSeekMessage, DeepSeekRequest } from '../types';

const DEFAULT_API_URL = 'https://api.deepseek.com/v1/chat/completions';
export const DEEPSEEK_MODEL = 'deepseek-chat';

export type DeepSeekErrorCode =
  | 'AI_REQUEST_FAILED'
  | 'AI_RESPONSE_INVALID'
  | 'AI_OUTPUT_TRUNCATED'
  | 'AI_OUTPUT_EMPTY';

export class DeepSeekClientError extends Error {
  constructor(public readonly code: DeepSeekErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = 'DeepSeekClientError';
  }
}

export interface DeepSeekJsonOptions {
  maxTokens: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  apiUrl?: string;
}

interface DeepSeekResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string };
  }>;
}

function retryable(error: unknown): boolean {
  return error instanceof DeepSeekClientError && (error.code === 'AI_REQUEST_FAILED' || error.code === 'AI_RESPONSE_INVALID');
}

async function requestJson(
  apiKey: string,
  messages: DeepSeekMessage[],
  options: DeepSeekJsonOptions,
): Promise<string> {
  const fetchImpl = options.fetchImpl || fetch;
  const body: DeepSeekRequest = {
    model: DEEPSEEK_MODEL,
    messages,
    temperature: 0,
    max_tokens: options.maxTokens,
    response_format: { type: 'json_object' },
  };
  let response: Response;
  try {
    response = await fetchImpl(options.apiUrl || DEFAULT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DeepSeekClientError('AI_REQUEST_FAILED', 'AI 服务连接失败，请稍后重试');
  }

  if (!response.ok) {
    throw new DeepSeekClientError('AI_REQUEST_FAILED', `AI 服务请求失败（${response.status}）`, response.status);
  }

  let data: DeepSeekResponse;
  try {
    data = await response.json() as DeepSeekResponse;
  } catch {
    throw new DeepSeekClientError('AI_RESPONSE_INVALID', 'AI 服务返回了无法读取的响应');
  }
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new DeepSeekClientError('AI_OUTPUT_TRUNCATED', 'AI 输出达到长度上限，未进入岗位评分');
  }
  const content = choice?.message?.content?.trim();
  if (!content) throw new DeepSeekClientError('AI_OUTPUT_EMPTY', 'AI 未返回可用内容');
  return content;
}

export async function callDeepSeekJson(
  apiKey: string,
  messages: DeepSeekMessage[],
  options: DeepSeekJsonOptions,
): Promise<string> {
  const attempts = Math.max(1, (options.retries ?? 1) + 1);
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestJson(apiKey, messages, options);
    } catch (error) {
      lastError = error;
      if (!retryable(error) || attempt === attempts - 1) throw error;
    }
  }
  throw lastError;
}
