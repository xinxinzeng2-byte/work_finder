import type { VercelRequest, VercelResponse } from '@vercel/node';

// 动态导入 server 的 express app
async function getApp() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../server/dist/index');
  return mod.default || mod;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  return app(req, res);
}
