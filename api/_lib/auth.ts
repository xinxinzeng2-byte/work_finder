import type { VercelRequest } from '@vercel/node';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
  return jwt.sign({ sub: userId }, secret, { expiresIn: '7d' });
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
