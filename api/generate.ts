import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateTailoredResume } from '../server/src/services/deepseekService';
import type { ParsedResume, ParsedJobDescription, MatchResult } from '../server/src/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const apiKey = req.headers['x-deepseek-key'] as string || '';
    if (!apiKey) {
      res.status(400).json({ error: '未配置 DeepSeek API Key' });
      return;
    }

    const { resume, jobDescription, matchResult } = req.body as {
      resume?: ParsedResume;
      jobDescription?: ParsedJobDescription;
      matchResult?: MatchResult;
    };

    if (!resume || !jobDescription) {
      res.status(400).json({ error: '缺少简历或岗位数据' });
      return;
    }

    const result = await generateTailoredResume(apiKey, resume, jobDescription, matchResult);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: `简历生成失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
