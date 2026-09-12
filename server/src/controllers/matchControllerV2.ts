import type { Request, Response } from 'express';
import type { ParsedJobDescription, ParsedResume } from '../types';
import { getUserId } from '../services/authService';
import { getUserApiKey } from '../services/userApiKeyService';
import { analyzeMatchV2, matchAnalysisErrorResponse } from '../services/matchAnalysisV2';

export async function resolveMatchApiKey(req: Request): Promise<string> {
  const headerKey = req.headers['x-deepseek-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();
  try {
    const storedKey = await getUserApiKey(getUserId(req));
    if (storedKey) return storedKey;
  } catch {
    // 本地开发允许回退到服务端环境变量。
  }
  return process.env.DEEPSEEK_API_KEY || '';
}

export async function executeMatchV2(apiKey: string, body: unknown) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  return analyzeMatchV2(apiKey, source.resume as ParsedResume, source.jobDescription as ParsedJobDescription);
}

export async function handleAnalyzeMatchV2(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = await resolveMatchApiKey(req);
    const result = await executeMatchV2(apiKey, req.body);
    res.json(result);
  } catch (error) {
    const failure = matchAnalysisErrorResponse(error);
    res.status(failure.status).json({ error: failure.message, code: failure.code });
  }
}
