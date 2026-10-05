import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'public, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.status(405).json({ error: '不支持的请求方法' }); return; }
  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  if (typeof slug !== 'string' || !/^[23456789A-HJ-NP-Za-km-z]{16}$/.test(slug)) { res.status(404).json({ error: '页面不存在' }); return; }
  try {
    const [row] = await sql`SELECT slug,published_document,theme_id,theme_config,published_at,updated_at FROM published_portfolios WHERE slug=${slug} AND status='published'`;
    if (!row) { res.status(404).json({ error: '页面不存在' }); return; }
    res.status(200).json({ portfolio: { slug:row.slug,document:row.published_document,themeId:row.theme_id,themeConfig:row.theme_config||{},publishedAt:row.published_at,updatedAt:row.updated_at } });
  } catch { res.status(500).json({ error: '公开主页暂时无法访问' }); }
}
