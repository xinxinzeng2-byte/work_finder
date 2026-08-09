// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import path from 'path';

/**
 * 从 PDF 文件 Buffer 提取文本（内存中处理，不落盘）。
 */
async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text.trim();
}

/**
 * 从 HTML 字符串中提取纯文本。
 */
function extractTextFromHtmlString(content: string): string {
  const withoutScript = content.replace(/<script[\s\S]*?<\/script>/gi, '');
  const withoutStyle = withoutScript.replace(/<style[\s\S]*?<\/style>/gi, '');
  const withBreaks = withoutStyle
    .replace(/<\/(div|p|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const text = withBreaks.replace(/<[^>]+>/g, '');
  const decoded = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return decoded
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

async function extractTextFromDocxBuffer(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

/**
 * 根据文件扩展名从 Buffer 中提取文本。
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  originalName: string
): Promise<string> {
  const extension = path.extname(originalName).toLowerCase();

  if (extension === '.pdf') {
    return extractTextFromPdfBuffer(buffer);
  }
  if (extension === '.html' || extension === '.htm') {
    return extractTextFromHtmlString(buffer.toString('utf-8'));
  }
  if (extension === '.docx') {
    return extractTextFromDocxBuffer(buffer);
  }
  if (extension === '.txt') {
    return buffer.toString('utf-8').trim();
  }

  throw new Error(`不支持的文件类型: ${extension}`);
}
