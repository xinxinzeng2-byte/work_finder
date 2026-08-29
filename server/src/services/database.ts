import postgres from 'postgres';

let client: any;

/** 延迟创建连接，确保 server/index.ts 已先加载 .env。 */
export function getSql(): any {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL 未配置');
  client = postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    // 数据库不可达时尽快返回，让登录页显示错误，而不是一直等待。
    connect_timeout: 5,
  });
  return client;
}
