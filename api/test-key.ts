import type { VercelRequest, VercelResponse } from '@vercel/node';
import { testApiKey } from '../server/src/services/deepseekService';
import { resolveApiKey } from './_lib/apiKey';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 只允许 POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const apiKey = await resolveApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: '未配置 DeepSeek API Key' });
      return;
    }
    const isValid = await testApiKey(apiKey);
    res.json({ valid: isValid });
  } catch (error) {
    res.status(500).json({
      error: `测试失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
