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

function isTlsPreconnectReset(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
      sourceError?: unknown;
    };
    if (
      candidate.code === 'ECONNRESET'
      && typeof candidate.message === 'string'
      && candidate.message.includes('before secure TLS connection was established')
    ) {
      return true;
    }
    current = candidate.sourceError ?? candidate.cause;
  }
  return false;
}

/**
 * 仅重试尚未建立 TLS 连接的 Neon 请求。
 *
 * 这种错误发生在 SQL 发往数据库之前，因此读取和写入都可以安全重试；
 * 对响应阶段断线等结果不确定的错误不重试，避免重复写入。
 */
export async function withDatabaseRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTlsPreconnectReset(error)) throw error;
      console.warn(`[Database] Neon TLS 连接被重置，正在重试 (${attempt}/${attempts - 1})`);
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}
