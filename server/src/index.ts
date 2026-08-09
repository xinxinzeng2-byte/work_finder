import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import aiRoutes from './routes/aiRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

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

// API 路由
app.use('/api/ai', aiRoutes);

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
