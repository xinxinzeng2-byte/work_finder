import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseJobDescription } from '../server/src/services/deepseekService';

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

    const { jdText } = req.body as { jdText?: string };
    if (!jdText || jdText.trim().length === 0) {
      res.status(400).json({ error: '请输入岗位描述' });
      return;
    }

    const result = await parseJobDescription(apiKey, jdText.trim());
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: `JD 解析失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
