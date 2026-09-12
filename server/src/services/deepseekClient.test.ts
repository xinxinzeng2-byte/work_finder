import assert from 'node:assert/strict';
import { callDeepSeekJson, DeepSeekClientError } from './deepseekClient';

async function run(): Promise<void> {

  const messages = [{ role: 'user' as const, content: 'test' }];

  let capturedBody: Record<string, unknown> | undefined;
  const successfulFetch: typeof fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }), { status: 200 });
  };
  const content = await callDeepSeekJson('secret-key', messages, { maxTokens: 8192, retries: 0, fetchImpl: successfulFetch });
  assert.equal(content, '{"ok":true}');
  assert.equal(capturedBody?.temperature, 0);
  assert.equal(capturedBody?.max_tokens, 8192);
  assert.deepEqual(capturedBody?.response_format, { type: 'json_object' });

  let truncatedParseAttempted = false;
  const truncatedFetch: typeof fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      truncatedParseAttempted = true;
      return { choices: [{ finish_reason: 'length', message: { content: '{"incomplete":' } }] };
    },
  } as Response);
  await assert.rejects(
    callDeepSeekJson('secret-key', messages, { maxTokens: 64, retries: 2, fetchImpl: truncatedFetch }),
    (error: unknown) => error instanceof DeepSeekClientError && error.code === 'AI_OUTPUT_TRUNCATED',
  );
  assert.equal(truncatedParseAttempted, true);

  let retryCount = 0;
  const retryFetch: typeof fetch = async () => {
    retryCount += 1;
    if (retryCount === 1) throw new Error('network');
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"retry":true}' } }] }), { status: 200 });
  };
  assert.equal(await callDeepSeekJson('secret-key', messages, { maxTokens: 100, retries: 1, fetchImpl: retryFetch }), '{"retry":true}');
  assert.equal(retryCount, 2);

  let noRetryCount = 0;
  const nonRetryableFetch: typeof fetch = async () => {
    noRetryCount += 1;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }), { status: 200 });
  };
  await assert.rejects(callDeepSeekJson('secret-key', messages, { maxTokens: 100, retries: 2, fetchImpl: nonRetryableFetch }));
  assert.equal(noRetryCount, 1, '截断错误不得盲目重试');

  console.log('deepseekClient tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
