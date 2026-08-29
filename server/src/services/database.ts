import { neon } from '@neondatabase/serverless';

let client: any;

/**
 * 使用 Neon HTTP 驱动连接数据库。
 *
 * 本地网络或代理经常会拦截 PostgreSQL 的 5432 端口；Neon Serverless
 * Driver 将相同 SQL 通过 HTTPS 443 发送，不影响现有 tagged-template 查询。
 */
export function getSql(): any {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL 未配置');
  client = neon(connectionString);
  return client;
}
