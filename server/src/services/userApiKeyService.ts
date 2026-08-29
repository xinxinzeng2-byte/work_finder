import crypto from 'crypto';
import { getSql } from './database';

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

export async function getUserApiKey(userId: string): Promise<string> {
  const sql = getSql();
  const [row] = await sql`SELECT deepseek_api_key_encrypted FROM users WHERE id = ${userId}`;
  if (!row?.deepseek_api_key_encrypted) return '';
  return decryptUserApiKey(row.deepseek_api_key_encrypted);
}

export async function saveUserApiKey(userId: string, apiKey: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE users SET deepseek_api_key_encrypted = ${encryptUserApiKey(apiKey)} WHERE id = ${userId}`;
}

export async function clearUserApiKey(userId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE users SET deepseek_api_key_encrypted = NULL WHERE id = ${userId}`;
}
