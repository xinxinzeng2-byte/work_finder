import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
  return jwt.sign({ sub: userId }, getSecret(), { expiresIn: '7d' });
}

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
