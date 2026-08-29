import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  generateFollowUpQuestions,
  formatFollowUpExperience,
} from '../server/src/services/deepseekService';
import type { ParsedResume } from '../server/src/types';
import { resolveApiKey } from './_lib/apiKey';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    const { action, gap, userResponse, resume } = req.body as {
      action?: 'question' | 'format';
      gap?: string;
      userResponse?: string;
      resume?: ParsedResume;
    };

    if (action === 'question') {
      // 生成引导问题
      if (!gap || !resume) {
        res.status(400).json({ error: '缺少缺口信息或简历数据' });
        return;
      }
      const question = await generateFollowUpQuestions(apiKey, gap, resume);
      res.json({ question });
    } else if (action === 'format') {
      // 格式化用户补录经历
      if (!userResponse || !gap) {
        res.status(400).json({ error: '缺少用户回复或缺口信息' });
        return;
      }
      const experience = await formatFollowUpExperience(apiKey, userResponse, gap);
      res.json(experience);
    } else {
      res.status(400).json({ error: '无效的操作类型，必须是 question 或 format' });
    }
  } catch (error) {
    res.status(500).json({
      error: `补录操作失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
