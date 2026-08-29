import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL 未配置');
}

export const sql: any = postgres(connectionString, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 10,
});
