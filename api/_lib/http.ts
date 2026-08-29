import type { VercelRequest, VercelResponse } from '@vercel/node';

export function allowMethods(req: VercelRequest, res: VercelResponse, methods: string[]): boolean {
  if (!methods.includes(req.method || '')) {
    res.setHeader('Allow', methods);
    res.status(405).json({ error: '不支持的请求方法' });
    return false;
  }
  return true;
}

export function bodyObject(req: VercelRequest): Record<string, unknown> {
  return typeof req.body === 'object' && req.body !== null ? req.body as Record<string, unknown> : {};
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
