import type {
  ParsedResume,
  ParsedJobDescription,
  MatchResult,
  GeneratedResume,
  AtomicExperience,
} from '../types';
import { getApiKey } from '../utils/storage';

const BASE_URL = '/api';

/**
 * 构建请求头
 */
function buildHeaders(json: boolean = true): Record<string, string> {
  const headers: Record<string, string> = {};
  const key = getApiKey();
  if (key) {
    headers['x-deepseek-key'] = key;
  }
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

/**
 * 统一错误处理
 */
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `请求失败 (${res.status})` }));
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return res.json();
}

/**
 * 测试 API Key
 */
export async function testApiKey(): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/test-key`, {
    method: 'POST',
    headers: buildHeaders(),
  });
  const data = await handleResponse<{ valid: boolean }>(res);
  return data.valid;
}

/**
 * 解析简历（文件上传）
 */
export async function parseResumeFile(file: File): Promise<ParsedResume> {
  // 将文件转为 base64 发送
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch(`${BASE_URL}/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-deepseek-key': getApiKey() || '' },
          body: JSON.stringify({
            file: {
              data: (reader.result as string).split(',')[1], // 去掉 data:xxx;base64, 前缀
              originalname: file.name,
            },
          }),
        });
        const result = await handleResponse<ParsedResume>(res);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 解析简历（文本输入）
 */
export async function parseResumeText(text: string): Promise<ParsedResume> {
  const res = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ text }),
  });
  return handleResponse<ParsedResume>(res);
}

/**
 * 解析岗位描述
 */
export async function parseJobDescription(jdText: string): Promise<ParsedJobDescription> {
  const res = await fetch(`${BASE_URL}/parse-jd`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ jdText }),
  });
  return handleResponse<ParsedJobDescription>(res);
}

/**
 * 匹配分析
 */
export async function analyzeMatch(
  resume: ParsedResume,
  jobDescription: ParsedJobDescription
): Promise<MatchResult> {
  const res = await fetch(`${BASE_URL}/match`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ resume, jobDescription }),
  });
  return handleResponse<MatchResult>(res);
}

/**
 * 生成补录引导问题
 */
export async function generateFollowUpQuestion(
  gap: string,
  resume: ParsedResume
): Promise<string> {
  const res = await fetch(`${BASE_URL}/supplement`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ action: 'question', gap, resume }),
  });
  const data = await handleResponse<{ question: string }>(res);
  return data.question;
}

/**
 * 格式化用户补录的经历
 */
export async function formatFollowUpExperience(
  userResponse: string,
  gap: string
): Promise<AtomicExperience> {
  const res = await fetch(`${BASE_URL}/supplement`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ action: 'format', userResponse, gap }),
  });
  return handleResponse<AtomicExperience>(res);
}

/**
 * 生成定制简历
 */
export async function generateTailoredResume(
  resume: ParsedResume,
  jobDescription: ParsedJobDescription,
  matchResult?: MatchResult
): Promise<GeneratedResume> {
  const res = await fetch(`${BASE_URL}/generate`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ resume, jobDescription, matchResult }),
  });
  return handleResponse<GeneratedResume>(res);
}
