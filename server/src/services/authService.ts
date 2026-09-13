import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { Response } from 'express';
import { getSql } from './database';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET 未配置');
  return secret;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createToken(userId: string): string {
  return jwt.sign({ sub: userId }, getSecret(), { expiresIn: '15m' });
}

const DAY = 24 * 60 * 60 * 1000;
const COOKIE = 'wf_refresh';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const readCookie = (req: Request) => {
  const entry = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  return entry ? decodeURIComponent(entry.slice(COOKIE.length + 1)) : '';
};
const writeCookie = (res: Response, value: string, maxAge = 30 * 24 * 60 * 60) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
};

export async function createRefreshSession(userId: string, res: Response): Promise<void> {
  const sql = getSql(); const value = crypto.randomBytes(32).toString('base64url'); const now = Date.now();
  await sql`INSERT INTO auth_sessions (user_id,refresh_token_hash,expires_at,absolute_expires_at) VALUES (${userId},${hash(value)},${new Date(now + 30 * DAY).toISOString()},${new Date(now + 90 * DAY).toISOString()})`;
  writeCookie(res, value);
}

export async function rotateRefreshSession(req: Request, res: Response): Promise<{ id: string; email: string } | null> {
  const value = readCookie(req); if (!value) return null; const sql = getSql();
  const [session] = await sql`SELECT s.id,s.user_id,s.absolute_expires_at,u.email FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_token_hash=${hash(value)} AND s.revoked_at IS NULL AND s.expires_at>now() AND s.absolute_expires_at>now()`;
  if (!session) return null;
  const rolling = new Date(Math.min(Date.now() + 30 * DAY, new Date(session.absolute_expires_at).getTime())).toISOString();
  await sql`UPDATE auth_sessions SET expires_at=${rolling},last_used_at=now() WHERE id=${session.id}`;
  writeCookie(res, value, Math.max(0, Math.floor((new Date(rolling).getTime() - Date.now()) / 1000)));
  return { id: session.user_id, email: session.email };
}

export async function revokeRefreshSession(req: Request, res: Response): Promise<void> {
  const value = readCookie(req); const sql = getSql();
  if (value) await sql`UPDATE auth_sessions SET revoked_at=now() WHERE refresh_token_hash=${hash(value)}`;
  writeCookie(res, '', 0);
}

export const hasRefreshCookie = (req: Request) => !!readCookie(req);

export function getUserId(req: Request): string {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
  try {
    const payload = jwt.verify(header.slice(7), getSecret()) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string') throw new Error('invalid subject');
    return payload.sub;
  } catch {
    throw new Error('UNAUTHORIZED');
  }
}
