import type { VercelRequest } from '@vercel/node';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sql } from './db';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET 未配置');
const secret: string = jwtSecret;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createToken(userId: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: '15m' });
}

const REFRESH_COOKIE = 'wf_refresh';
const DAY = 24 * 60 * 60 * 1000;

function tokenHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cookieValue(req: VercelRequest, name: string): string {
  const cookies = req.headers.cookie || '';
  const entry = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function setRefreshCookie(res: { setHeader: (name: string, value: string) => void }, value: string, maxAge = 30 * 24 * 60 * 60): void {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${REFRESH_COOKIE}=${encodeURIComponent(value)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

export async function createRefreshSession(userId: string, res: { setHeader: (name: string, value: string) => void }): Promise<void> {
  const value = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await sql`INSERT INTO auth_sessions (user_id,refresh_token_hash,expires_at,absolute_expires_at) VALUES (${userId},${tokenHash(value)},${new Date(now + 30 * DAY).toISOString()},${new Date(now + 90 * DAY).toISOString()})`;
  setRefreshCookie(res, value);
}

export async function refreshSession(req: VercelRequest, res: { setHeader: (name: string, value: string) => void }): Promise<{ id: string; email: string } | null> {
  const value = cookieValue(req, REFRESH_COOKIE);
  if (!value) return null;
  const [session] = await sql`SELECT s.id,s.user_id,s.absolute_expires_at,u.email FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_token_hash=${tokenHash(value)} AND s.revoked_at IS NULL AND s.expires_at>now() AND s.absolute_expires_at>now()`;
  if (!session) return null;
  const rolling = new Date(Math.min(Date.now() + 30 * DAY, new Date(session.absolute_expires_at).getTime())).toISOString();
  await sql`UPDATE auth_sessions SET expires_at=${rolling},last_used_at=now() WHERE id=${session.id}`;
  setRefreshCookie(res, value, Math.max(0, Math.floor((new Date(rolling).getTime() - Date.now()) / 1000)));
  return { id: session.user_id, email: session.email };
}

export async function revokeRefreshSession(req: VercelRequest, res: { setHeader: (name: string, value: string) => void }): Promise<void> {
  const value = cookieValue(req, REFRESH_COOKIE);
  if (value) await sql`UPDATE auth_sessions SET revoked_at=now() WHERE refresh_token_hash=${tokenHash(value)}`;
  setRefreshCookie(res, '', 0);
}

export function hasRefreshCookie(req: VercelRequest): boolean {
  return !!cookieValue(req, REFRESH_COOKIE);
}

export function getUserId(req: VercelRequest): string {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
  try {
    const payload = jwt.verify(header.slice(7), secret) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string') throw new Error('invalid subject');
    return payload.sub;
  } catch {
    throw new Error('UNAUTHORIZED');
  }
}

export function sendAuthError(res: { status: (code: number) => { json: (body: unknown) => void } }, error: unknown): void {
  if (error instanceof Error && error.message === 'UNAUTHORIZED') {
    res.status(401).json({ error: '未登录或登录已过期' });
    return;
  }
  res.status(500).json({ error: '服务暂时不可用' });
}
