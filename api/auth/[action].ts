import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db';
import { createToken, hashPassword, verifyPassword, getUserId } from '../_lib/auth';
import { allowMethods, bodyObject, isNonEmptyString } from '../_lib/http';
import { isValidEmail, normalizeEmail } from '../_lib/email';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  if (action === 'register') return register(req, res);
  if (action === 'login') return login(req, res);
  if (action === 'me') return me(req, res);
  res.status(404).json({ error: '认证接口不存在' });
}

async function register(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ['POST'])) return;
  const body = bodyObject(req);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!isValidEmail(email) || !isNonEmptyString(password) || password.length < 8) {
    res.status(400).json({ error: '请输入有效邮箱，密码至少 8 位' }); return;
  }
  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length) { res.status(409).json({ error: '该邮箱已注册' }); return; }
    const passwordHash = await hashPassword(password);
    const [user] = await sql`INSERT INTO users (email, password_hash) VALUES (${email}, ${passwordHash}) RETURNING id, email`;
    res.status(201).json({ token: createToken(user.id), user });
  } catch { res.status(500).json({ error: '注册失败，请稍后重试' }); }
}

async function login(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ['POST'])) return;
  const body = bodyObject(req);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!isValidEmail(email) || !isNonEmptyString(password)) { res.status(400).json({ error: '请输入有效邮箱和密码' }); return; }
  try {
    const [user] = await sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`;
    if (!user || !(await verifyPassword(password, user.password_hash))) { res.status(401).json({ error: '邮箱或密码错误' }); return; }
    res.status(200).json({ token: createToken(user.id), user: { id: user.id, email: user.email } });
  } catch { res.status(500).json({ error: '登录失败，请稍后重试' }); }
}

async function me(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const id = getUserId(req);
    const [user] = await sql`SELECT id, email FROM users WHERE id = ${id}`;
    if (!user) { res.status(401).json({ error: '用户不存在' }); return; }
    res.status(200).json({ user });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') res.status(401).json({ error: '未登录或登录已过期' });
    else res.status(500).json({ error: '读取用户信息失败' });
  }
}
