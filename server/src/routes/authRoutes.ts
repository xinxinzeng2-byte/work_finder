import { Router, type Request, type Response } from 'express';
import { getSql } from '../services/database';
import { createToken, getUserId, hashPassword, verifyPassword } from '../services/authService';
import { isValidEmail, normalizeEmail } from '../services/emailValidation';

const router = Router();

function withTimeout<T>(operation: Promise<T>, milliseconds = 6_000): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('DATABASE_TIMEOUT')), milliseconds)),
  ]);
}

function bodyObject(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
}

router.post('/register', async (req: Request, res: Response) => {
  const body = bodyObject(req);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!isValidEmail(email) || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: '请输入有效邮箱，密码至少 8 位' });
    return;
  }
  try {
    const sql = getSql();
    const existing = await withTimeout<any[]>(sql`SELECT id FROM users WHERE email = ${email}`);
    if (existing.length) {
      res.status(409).json({ error: '该邮箱已注册' });
      return;
    }
    const passwordHash = await hashPassword(password);
    const [user] = await withTimeout<any[]>(sql`
      INSERT INTO users (email, password_hash)
      VALUES (${email}, ${passwordHash})
      RETURNING id, email
    `);
    res.status(201).json({ token: createToken(user.id), user });
  } catch (error) {
    console.error('[Auth register]', error);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const body = bodyObject(req);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!isValidEmail(email) || typeof password !== 'string' || !password) {
    res.status(400).json({ error: '请输入有效邮箱和密码' });
    return;
  }
  try {
    const sql = getSql();
    const [user] = await withTimeout<any[]>(sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      res.status(401).json({ error: '邮箱或密码错误' });
      return;
    }
    res.status(200).json({ token: createToken(user.id), user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('[Auth login]', error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('DATABASE_TIMEOUT') || message.includes('CONNECT_TIMEOUT') || message.includes('ECONN')) {
      res.status(503).json({ error: '数据库暂时无法连接，请检查本地数据库配置' });
      return;
    }
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const sql = getSql();
    const [user] = await withTimeout<any[]>(sql`SELECT id, email FROM users WHERE id = ${userId}`);
    if (!user) {
      res.status(401).json({ error: '用户不存在' });
      return;
    }
    res.status(200).json({ user });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      res.status(401).json({ error: '未登录或登录已过期' });
      return;
    }
    console.error('[Auth me]', error);
    res.status(500).json({ error: '读取用户信息失败' });
  }
});

export default router;
