import { Request, Response } from 'express';
import { extractTextFromBuffer } from '../services/fileService';
import {
  parseResume,
  parseJobDescription,
  analyzeMatch,
  generateFollowUpQuestions,
  formatFollowUpExperience,
  generateTailoredResume,
  testApiKey,
} from '../services/deepseekService';
import type { ParsedResume, ParsedJobDescription, MatchResult } from '../types';

/**
 * 从请求中获取 API Key（优先请求头，其次环境变量）
 */
function getApiKey(req: Request): string {
  const keyFromHeader = req.headers['x-deepseek-key'] as string | undefined;
  return keyFromHeader || process.env.DEEPSEEK_API_KEY || '';
}

// 测试 API Key
export async function handleTestApiKey(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = getApiKey(req);
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

// 解析简历
export async function handleParseResume(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: '未配置 DeepSeek API Key，请先在设置中填入' });
      return;
    }

    const encodedFile = req.body?.file?.data as string | undefined;
    const encodedFileName = req.body?.file?.originalname as string | undefined;

    if (!req.file && !encodedFile) {
      // 如果没有文件，检查是否有文本输入
      const { text } = req.body;
      if (!text || text.trim().length === 0) {
        res.status(400).json({ error: '请上传简历文件或粘贴简历文本' });
        return;
      }
      const result = await parseResume(apiKey, text.trim());
      res.json(result);
      return;
    }

    // 同时支持本地 multer 文件和前端 Base64 文件。
    const fileName = req.file?.originalname || encodedFileName || 'resume.pdf';
    const buffer = req.file?.buffer || Buffer.from(encodedFile!, 'base64');
    const text = await extractTextFromBuffer(buffer, fileName);

    if (!text || text.trim().length < 10) {
      res.status(400).json({ error: '文件内容为空或无法提取文字（注意：暂不支持图片/扫描件）' });
      return;
    }

    const result = await parseResume(apiKey, text, fileName);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: `简历解析失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// 解析 JD
export async function handleParseJobDescription(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: '未配置 DeepSeek API Key' });
      return;
    }

    const { jdText } = req.body;
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

// 匹配分析
export async function handleAnalyzeMatch(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: '未配置 DeepSeek API Key' });
      return;
    }

    const { resume, jobDescription } = req.body as {
      resume: ParsedResume;
      jobDescription: ParsedJobDescription;
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

// 补录引导 - 生成引导问题
export async function handleGenerateFollowUpQuestion(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: '未配置 DeepSeek API Key' });
      return;
    }

    const { gap, resume } = req.body as { gap: string; resume: ParsedResume };
    if (!gap) {
      res.status(400).json({ error: '缺少缺口信息' });
      return;
    }

    const question = await generateFollowUpQuestions(apiKey, gap, resume);
    res.json({ question });
  } catch (error) {
    res.status(500).json({
      error: `生成引导问题失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// 补录引导 - 格式化用户补录经历
export async function handleFormatFollowUpExperience(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: '未配置 DeepSeek API Key' });
      return;
    }

    const { userResponse, gap } = req.body as { userResponse: string; gap: string };
    if (!userResponse || !gap) {
      res.status(400).json({ error: '缺少用户回复或缺口信息' });
      return;
    }

    const experience = await formatFollowUpExperience(apiKey, userResponse, gap);
    res.json(experience);
  } catch (error) {
    res.status(500).json({
      error: `经历格式化失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// 生成定制简历
export async function handleGenerateResume(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: '未配置 DeepSeek API Key' });
      return;
    }

    const { resume, jobDescription, matchResult } = req.body as {
      resume: ParsedResume;
      jobDescription: ParsedJobDescription;
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
