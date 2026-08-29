import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { getUserId } from './auth';
import { sql } from './db';
import { allowMethods, bodyObject } from './http';

function encryptionSecret(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('API_KEY_ENCRYPTION_SECRET 或 JWT_SECRET 未配置');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptUserApiKey(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptUserApiKey(value: string): string {
  const [version, ivValue, authTagValue, encryptedValue] = value.split(':');
  if (version !== 'v1' || !ivValue || !authTagValue || !encryptedValue) throw new Error('API Key 密文格式无效');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionSecret(), Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagValue, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64')), decipher.final()]).toString('utf8');
}

export async function getStoredApiKey(userId: string): Promise<string> {
  const [row] = await sql`SELECT deepseek_api_key_encrypted FROM users WHERE id = ${userId}`;
  if (!row?.deepseek_api_key_encrypted) return '';
  return decryptUserApiKey(row.deepseek_api_key_encrypted);
}

export async function resolveApiKey(req: VercelRequest): Promise<string> {
  const headerKey = req.headers['x-deepseek-key'];
  if (typeof headerKey === 'string' && headerKey) return headerKey;
  try {
    return await getStoredApiKey(getUserId(req));
  } catch {
    return process.env.DEEPSEEK_API_KEY || '';
  }
}

export async function handleApiKey(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET', 'PUT', 'DELETE'])) return;
  let userId: string;
  try {
    userId = getUserId(req);
  } catch {
    res.status(401).json({ error: '未登录或登录已过期' });
    return;
  }
  try {
    if (req.method === 'GET') {
      const [row] = await sql`SELECT deepseek_api_key_encrypted FROM users WHERE id = ${userId}`;
      res.status(200).json({ configured: !!row?.deepseek_api_key_encrypted });
      return;
    }
    if (req.method === 'DELETE') {
      await sql`UPDATE users SET deepseek_api_key_encrypted = NULL WHERE id = ${userId}`;
      res.status(204).end();
      return;
    }
    const apiKey = bodyObject(req).apiKey;
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      res.status(400).json({ error: 'API Key 不能为空' });
      return;
    }
    await sql`UPDATE users SET deepseek_api_key_encrypted = ${encryptUserApiKey(apiKey.trim())} WHERE id = ${userId}`;
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: `API Key 保存失败: ${error instanceof Error ? error.message : String(error)}` });
  }
}
