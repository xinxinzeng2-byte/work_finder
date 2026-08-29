import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getSql } from './services/database';
import aiRoutes from './routes/aiRoutes';
import authRoutes from './routes/authRoutes';
import dataRoutes from './routes/dataRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function withTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('DATABASE_TIMEOUT')), milliseconds)),
  ]);
}

// 中间件
app.use(
  cors({
    origin: [CLIENT_URL, 'http://localhost:5174', 'http://localhost:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'worker-finder-server' });
});

// 只读数据库连通性检查，方便本地启动后快速确认 DATABASE_URL 是否生效。
app.get('/health/db', async (_req, res) => {
  try {
    await withTimeout(getSql()`SELECT 1`, 6_000);
    res.json({ status: 'ok', service: 'worker-finder-database' });
  } catch (error) {
    console.error('[Health database]', error instanceof Error ? error.message : error);
    res.status(503).json({ status: 'error', service: 'worker-finder-database', error: '数据库暂时无法连接' });
  }
});

// API 路由
app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);

// 错误处理中间件
app.use(
  (
    err: Error & { code?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[Error]', err.message);
    if (err.message.includes('不支持的文件类型')) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: '文件大小超过 10MB 限制' });
      return;
    }
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
);

// 导出 app 供 Vercel Serverless 使用
export default app;

// 本地开发时启动长驻服务（Vercel 环境不执行）
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`\n🚀 AI 求职助手后端服务已启动`);
    console.log(`   本地地址: http://localhost:${PORT}`);
    console.log(`   健康检查: http://localhost:${PORT}/health`);
    console.log(`   前端地址: ${CLIENT_URL}\n`);
  });
}
