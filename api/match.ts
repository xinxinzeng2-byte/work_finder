import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeMatch } from '../server/src/services/deepseekService';
import type { ParsedResume, ParsedJobDescription } from '../server/src/types';

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

    const { resume, jobDescription } = req.body as {
      resume?: ParsedResume;
      jobDescription?: ParsedJobDescription;
    };

    if (!resume || !jobDescription) {
      res.status(400).json({ error: '缺少简历或岗位数据' });
      return;
    }

    const result = await analyzeMatch(apiKey, resume, jobDescription);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: `匹配分析失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
