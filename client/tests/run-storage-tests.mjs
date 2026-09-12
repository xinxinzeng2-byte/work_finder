import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  await server.ssrLoadModule('/tests/storage.test.ts');
  await server.ssrLoadModule('/tests/analysis-render.test.tsx');
} finally {
  await server.close();
}

const cloudServer = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  define: {
    'import.meta.env.VITE_DATA_MODE': JSON.stringify('cloud'),
    'import.meta.env.VITE_API_KEY_MODE': JSON.stringify('cloud'),
  },
});
try {
  await cloudServer.ssrLoadModule('/tests/storage-cloud.test.ts');
} finally {
  await cloudServer.close();
}
