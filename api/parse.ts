import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseResume } from '../server/src/services/deepseekService';
import { extractTextFromBuffer } from './_lib/fileService';
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
      res.status(400).json({ error: '未配置 DeepSeek API Key，请先在设置中填入' });
      return;
    }

    // 检查是否有文件上传（base64 格式）
    const body = req.body as any;
    const hasFile = body.file && body.file.data;

    if (!hasFile) {
      // 如果没有文件，检查是否有文本输入
      const { text } = req.body as { text?: string };
      if (!text || text.trim().length === 0) {
        res.status(400).json({ error: '请上传简历文件或粘贴简历文本' });
        return;
      }
      const result = await parseResume(apiKey, text.trim());
      res.json(result);
      return;
    }

    // 处理文件上传（base64 解码为 buffer）
    const buffer = Buffer.from(body.file.data, 'base64');
    const fileName = body.file.originalname || 'resume.pdf';

    // 从内存 buffer 提取文本
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
