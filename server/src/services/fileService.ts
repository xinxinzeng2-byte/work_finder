import multer from 'multer';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import path from 'path';

// 使用内存存储，兼容 Vercel 等 Serverless 只读文件系统
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['application/pdf', 'text/html', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.docx', '.html', '.htm', '.txt'];
    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型，仅支持 PDF、Word（.docx）、HTML 和 TXT 文件'));
    }
  },
});

/**
 * 从 PDF 文件 Buffer 提取文本（内存中处理，不落盘）
 */
export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text.trim();
}

/**
 * 从 HTML 字符串提取文本（简单解析）
 */
export function extractTextFromHtmlString(content: string): string {
  // 移除 script 和 style 标签内容
  const withoutScript = content.replace(/<script[\s\S]*?<\/script>/gi, '');
  const withoutStyle = withoutScript.replace(/<style[\s\S]*?<\/style>/gi, '');
  // 将 HTML 标签替换为换行
  const withBreaks = withoutStyle
    .replace(/<\/(div|p|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  // 移除剩余标签
  const text = withBreaks.replace(/<[^>]+>/g, '');
  // 解码常见 HTML 实体
  const decoded = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // 压缩多余空白
  return decoded
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

/**
 * 从 DOCX 文件 Buffer 提取纯文本。
 */
export async function extractTextFromDocxBuffer(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

/**
 * 根据 buffer 和原始文件名提取文本
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  originalname: string
): Promise<string> {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.pdf') {
    return extractTextFromPdfBuffer(buffer);
  }
  if (ext === '.html' || ext === '.htm') {
    return extractTextFromHtmlString(buffer.toString('utf-8'));
  }
  if (ext === '.docx') {
    return extractTextFromDocxBuffer(buffer);
  }
  if (ext === '.txt') {
    return buffer.toString('utf-8').trim();
  }
  throw new Error(`不支持的文件类型: ${ext}`);
}
