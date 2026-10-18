import assert from 'node:assert/strict';
import { parseResume, testApiKey } from './deepseekService';

async function run() {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let aborted = false;
  try {
    let requestBody: any;
    globalThis.fetch = async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      skills: [{ name: '数据分析', category: '技术', level: '熟悉', evidence: '项目经历' }],
      experiences: [], basicInfo: { name: '测试' },
    }) } }] }));
    };
    const result = await parseResume('test-key', '测试简历原文');
    assert.equal(result.skills[0].name, '数据分析');
    assert.equal(result.rawText, '测试简历原文');
    assert.equal(requestBody.model, 'deepseek-flash');
    assert.deepEqual(requestBody.thinking, { type: 'disabled' });
    assert.deepEqual(requestBody.response_format, { type: 'json_object' });

    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{
      finish_reason: 'length', message: { content: '{"skills":[' },
    }] }));
    await assert.rejects(parseResume('test-key', '测试简历原文'), /输出超过长度上限/);

    // 缩短测试中的 90 秒计时器，验证真实中止逻辑。
    globalThis.setTimeout = ((callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) =>
      originalSetTimeout(callback, ms === 90_000 ? 5 : ms, ...args)) as typeof setTimeout;
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted'));
      }, { once: true });
    });
    await assert.rejects(parseResume('test-key', '测试简历原文'), /90 秒内未完成生成/);
    assert.equal(aborted, true);

    // 响应头已到、正文仍卡住时，也必须中止并恢复。
    globalThis.fetch = async (_url, init) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new Error('aborted body')), { once: true });
      }),
    } as Response);
    await assert.rejects(parseResume('test-key', '测试简历原文'), /90 秒内未完成生成/);
    // 只收到 HTTP 200 但没有生成正文时，连接测试不得误报成功。
    globalThis.setTimeout = ((callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) =>
      originalSetTimeout(callback, ms === 15_000 ? 5 : ms, ...args)) as typeof setTimeout;
    assert.equal(await testApiKey('test-key'), false);
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
    assert.equal(await testApiKey('test-key'), true);
    console.log('resumeParsing tests passed');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
