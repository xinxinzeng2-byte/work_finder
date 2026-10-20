import assert from 'node:assert/strict';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
  },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { setTimeout, clearTimeout },
});
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async () => new Response(JSON.stringify({ error: '模拟云端写入失败' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  }),
});

memory.set('auth_token', 'test-token');
const oldMatch = { score: 60, hardConditionCheck: [], skillMatch: [], gaps: [], summary: '原分析' };
const oldJob = { id: '00000000-0000-4000-8000-000000000001', jd: { requirements: [], rawText: '岗位' }, matchResult: oldMatch, savedAt: '2026-09-12T00:00:00.000Z', status: 'analyzed' };
memory.set('wf_saved_jobs', JSON.stringify([oldJob]));

const originalWarn = console.warn;
console.warn = () => undefined;
const { isCloudMode, replaceJobAnalysis, savePublishedResume, loadResumes } = await import('../src/utils/storage');
assert.equal(isCloudMode, true, '测试必须运行在云端数据模式');
await assert.rejects(
  replaceJobAnalysis({ ...oldJob, matchResult: { ...oldMatch, score: 90, summary: '新分析' } }),
  /模拟云端写入失败/,
);
const persisted = JSON.parse(memory.get('wf_saved_jobs')!)[0];
assert.equal(persisted.matchResult.score, 60, '云端重评保存失败时不得覆盖本地原分析');
assert.equal(persisted.matchResult.summary, '原分析');
const publishResume={basicInfo:{name:'发布测试'},skills:[],experiences:[],rawText:'主页简历'};
const publishOptions={name:'目标岗位简历',sourceIds:[],targetJob:{position:'产品经理',matchScore:null,jobId:'preparation-1'}};
await assert.rejects(savePublishedResume(publishResume,publishOptions),/模拟云端写入失败/,'发布流程必须感知云端入库失败');
const savedId=loadResumes()[0].id;
let completeWrite:()=>void=()=>undefined;
let writeStarted:()=>void=()=>undefined;
const started=new Promise<void>(resolve=>{writeStarted=resolve;});
globalThis.fetch=async()=>{writeStarted();await new Promise<void>(resolve=>{completeWrite=resolve;});return new Response('{}',{status:201});};
let saved=false;
const saving=savePublishedResume(publishResume,{...publishOptions,name:'重试后简历'}).then(()=>{saved=true;});
await started;
assert.equal(saved,false,'云端未确认时，发布入库不能提前返回成功');
completeWrite();
await saving;
assert.equal(saved,true);
assert.equal(loadResumes().length,1,'入库失败后重试不得生成重复简历');
assert.equal(loadResumes()[0].id,savedId);
assert.equal(loadResumes()[0].name,'重试后简历');
console.warn = originalWarn;

console.log('client cloud atomic replacement and published resume sync tests passed');
