import { neon, neonConfig } from '@neondatabase/serverless';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

let client: any;
let proxyConfigured = false;

function databaseProxyUrl(): string | undefined {
  const configured = process.env.DATABASE_HTTP_PROXY?.trim();
  if (configured) return configured;
  const inherited = (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy)?.trim();
  if (!inherited) return undefined;
  try {
    const url = new URL(inherited);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    // Clash 的 mixed-port 同时接受 SOCKS 与 HTTP；Undici 只支持 HTTP CONNECT。
    if (['socks5:', 'socks5h:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
      return `http://${url.host}`;
    }
  } catch {
    // 无效代理配置交由直连和既有错误处理兜底。
  }
  return undefined;
}

function configureDatabaseProxy(): void {
  if (proxyConfigured) return;
  const proxyUrl = databaseProxyUrl();
  if (!proxyUrl) { proxyConfigured = true; return; }
  const dispatcher = new ProxyAgent(proxyUrl);
  neonConfig.fetchFunction = ((input: string | URL, init?: RequestInit) => (
    undiciFetch(input, { ...init, dispatcher } as Parameters<typeof undiciFetch>[1])
  )) as typeof fetch;
  proxyConfigured = true;
  console.log(`[Database] Neon HTTPS 请求使用代理 ${new URL(proxyUrl).host}`);
}

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
  configureDatabaseProxy();
  client = neon(connectionString);
  return client;
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
      sourceError?: unknown;
    };
    if (candidate.code === 'ECONNRESET' || candidate.code === 'CONNECT_TIMEOUT' || candidate.code === 'ETIMEDOUT') {
      return true;
    }
    current = candidate.sourceError ?? candidate.cause;
  }
  return false;
}

function isTlsPreconnectReset(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown; sourceError?: unknown };
    if (
      candidate.code === 'ECONNRESET'
      && typeof candidate.message === 'string'
      && candidate.message.includes('before secure TLS connection was established')
    ) return true;
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
