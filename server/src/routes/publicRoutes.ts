import { Router } from 'express';
import { getSql } from '../services/database';

const router = Router();

router.get('/portfolios/:slug', async (req, res) => {
  res.setHeader('Cache-Control', 'public, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const { slug } = req.params;
  if (!/^[23456789A-HJ-NP-Za-km-z]{16}$/.test(slug)) { res.status(404).json({ error: '页面不存在' }); return; }
  try {
    const sql = getSql();
    const [row] = await sql`SELECT slug,published_document,theme_id,theme_config,published_at,updated_at FROM published_portfolios WHERE slug=${slug} AND status='published'`;
    if (!row) { res.status(404).json({ error: '页面不存在' }); return; }
    res.json({ portfolio:{ slug:row.slug,document:row.published_document,themeId:row.theme_id,themeConfig:row.theme_config||{},publishedAt:row.published_at,updatedAt:row.updated_at } });
  } catch { res.status(500).json({ error: '公开主页暂时无法访问' }); }
});

export default router;
