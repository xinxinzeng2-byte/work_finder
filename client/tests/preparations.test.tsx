import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PortfolioRenderer} from '../src/components/PortfolioRenderer';
import {buildSuggestions,createPreparation,emptyPortfolio,getInterviewKit,getPreparation,loadPublishedPortfolio,themeNames,updatePreparation} from '../src/services/preparations';
import {contactKindLabels} from '../src/utils/portfolioContacts';
import {preparationToCustomizedResume} from '../src/utils/preparationResume';
import {resumeToHtml} from '../src/utils/resumeExport';
import type {ResumeItem} from '../src/utils/storage';
import type {JobPreparation} from '../src/types';

const memory=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>{memory.set(key,value);},removeItem:(key:string)=>{memory.delete(key);}}});

const resume={basicInfo:{name:'测试用户',email:'private@example.com'},skills:[],experiences:[],rawText:'真实简历'};
const document=emptyPortfolio('产品经理','测试用户');
document.blocks=[{id:'advantages',type:'advantages',title:'核心优势',visible:true,order:0,data:{items:['用户研究','产品规划']},sourceRefs:[]},{id:'hidden',type:'education',title:'隐藏区块',visible:false,order:1,data:{content:'不应出现的内容'},sourceRefs:[]}];
document.contacts=[{id:'email',kind:'email',label:'邮箱',value:'private@example.com',public:false}];

for(const theme of Object.keys(themeNames) as Array<keyof typeof themeNames>){const html=renderToStaticMarkup(<PortfolioRenderer document={document} themeId={theme}/>);assert.ok(html.includes(`theme-${theme}`));assert.ok(html.includes('测试用户'));assert.ok(!html.includes('private@example.com'),'未公开联系方式不得渲染');assert.ok(!html.includes('不应出现的内容'),'隐藏区块不得渲染');}

const editableHtml=renderToStaticMarkup(<PortfolioRenderer document={document} themeId="clean-professional" editable onDocumentChange={()=>undefined}/>);
assert.ok(editableHtml.includes('contenteditable="true"'),'编辑模式应允许直接修改主页文字');
assert.ok(editableHtml.includes('data-section-id="identity"'),'编辑模式应支持区块定位');

const wechatDocument={...document,contacts:[{id:'wechat',kind:'wechat' as const,label:'微信',value:'worker-finder',public:true}],primaryAction:{label:'联系我',contactId:'wechat'}};
const wechatHtml=renderToStaticMarkup(<PortfolioRenderer document={wechatDocument} themeId="clean-professional"/>);
assert.ok(!wechatHtml.includes('pf-action'),'首屏不应显示联系行动按钮');
assert.ok(wechatHtml.includes('pf-contact-grid'),'公开联系方式应使用两列对齐布局');
assert.ok(wechatHtml.includes('worker-finder'),'公开联系方式应同时显示名称和值');
assert.ok(wechatHtml.includes('class="pf-footer"><div'),'联系方式页脚不应重复显示姓名');
assert.ok(!wechatHtml.includes('由 AI 求职助手生成'),'联系方式页脚不应显示生成说明');

const publishedResume:ResumeItem={id:'published-resume',name:'发布页简历',type:'customized',resume,uploadedAt:'2026-10-07T00:00:00.000Z',version:1,isCurrent:false,targetJob:{position:'产品经理',matchScore:80,portfolioDocument:document,portfolioThemeId:'product-home'}};
const exportedHtml=resumeToHtml(publishedResume);
assert.ok(exportedHtml.includes('theme-product-home'),'定制简历导出应保留发布页主题');
assert.ok(exportedHtml.includes('pf-advantages'),'定制简历导出应复用发布页区块结构');
assert.ok(exportedHtml.includes('.pf-hero'),'定制简历导出应内嵌发布页样式');
assert.ok(!exportedHtml.includes('private@example.com'),'定制简历导出不得包含未公开联系方式');

const created=await createPreparation({mode:'general',name:'测试主页',careerDirection:'产品经理',sourceResumeId:'resume-1',sourceResumeVersion:1,sourceResumeSnapshot:resume,document,documentSchemaVersion:1,contentSuggestions:buildSuggestions(),themeId:'clean-professional',themeConfig:{}});
assert.equal(created.revision,1);
const customized=preparationToCustomizedResume({...created,document:{...created.document,identity:{name:'主页姓名',headline:'产品经理',tagline:'解决真实问题',location:'上海'},contacts:[{id:'phone',kind:'phone',label:'电话',value:'13800000000',public:false}],blocks:[{id:'skills',type:'skills',title:'专业技能',visible:true,order:0,data:{groups:[{category:'产品',items:['需求分析']}]},sourceRefs:[]},{id:'experience',type:'experience',title:'工作经历',visible:true,order:1,data:{items:[{company:'测试公司',role:'产品经理',period:'2024—至今',description:'负责产品规划',highlights:['完成上线']}]},sourceRefs:[]}]}});
assert.equal(customized.basicInfo.name,'主页姓名');
assert.equal(customized.basicInfo.phone,'13800000000');
assert.equal(customized.skills[0].name,'需求分析');
assert.equal(customized.experiences[0].company,'测试公司');
const updated=await updatePreparation(created,{themeId:'enterprise-tech'});
assert.equal(updated.revision,2);
assert.equal((await getPreparation(created.id)).themeId,'enterprise-tech');
memory.set('wf_job_preparations',JSON.stringify([{...updated,id:'legacy-preparation',document:JSON.stringify(updated.document),contentSuggestions:JSON.stringify({unexpected:true})}]));
const legacy=await getPreparation('legacy-preparation');
assert.equal(legacy.document.identity.name,'测试用户','历史双重序列化的主页文档应恢复为对象');
assert.deepEqual(legacy.contentSuggestions,[],'异常的历史内容建议不应让编辑器崩溃');
assert.equal(buildSuggestions().length,2);
assert.deepEqual(contactKindLabels,{email:'邮箱',phone:'电话',website:'个人网站',github:'GitHub',linkedin:'LinkedIn',wechat:'微信',custom:'自定义'});
memory.set('wf_interview_kits',JSON.stringify([{preparationId:'legacy-preparation',questions:[{id:'valid',category:'role',question:'请介绍你自己',starred:false},{id:'invalid',category:'unknown',question:'异常问题'}]}]));
const legacyKit=await getInterviewKit('legacy-preparation');
assert.equal(legacyKit?.questions.length,1,'异常的历史面试问题不应让页面崩溃');
assert.equal(legacyKit?.questions[0].answerNote,'','历史问题缺少答题笔记时应补为空文本');

// 发布时即使来源快照缺失数组，也应使用当前主页生成完整简历。
const currentDocument={...created.document,blocks:[
  {id:'skills',type:'skills' as const,title:'技能',visible:true,order:0,data:{groups:[{category:'产品',items:['需求分析']}]},sourceRefs:[]},
  {id:'experience',type:'experience' as const,title:'经历',visible:true,order:1,data:{items:[{company:'主页公司',role:'产品经理',description:'真实经历'}]},sourceRefs:[]},
]};
for(const snapshot of [{},null,{basicInfo:{name:'旧姓名'}},JSON.stringify(resume)]){
  const legacyPreparation={...created,document:currentDocument,sourceResumeSnapshot:snapshot} as unknown as JobPreparation;
  const converted=preparationToCustomizedResume(legacyPreparation);
  assert.equal(converted.basicInfo.name,'测试用户');
  assert.equal(converted.skills[0].name,'需求分析');
  assert.equal(converted.experiences[0].company,'主页公司');
}
const oldFields=preparationToCustomizedResume({...created,sourceResumeSnapshot:{abilities:[{name:'历史技能'}],workExperience:[{companyName:'历史公司',position:'工程师'}]}} as unknown as JobPreparation);
assert.equal(oldFields.skills[0].name,'历史技能','没有技能区块时应保留来源快照中的历史能力');
assert.equal(oldFields.experiences[0].company,'历史公司');
memory.set('wf_job_preparations',JSON.stringify([{...created,sourceResumeSnapshot:JSON.stringify(resume)}]));
assert.deepEqual((await getPreparation(created.id)).sourceResumeSnapshot.skills,[],'读取来源快照时应解析历史字符串数据');

const originalFetch=globalThis.fetch;
try{
  // 直接打开公开主页时，不能依赖编辑器已经解析过文档。
  for(const storedDocument of [document,JSON.stringify(document),JSON.stringify(JSON.stringify(document))]){
    globalThis.fetch=async()=>new Response(JSON.stringify({portfolio:{slug:'23456789ABCDEFGH',document:storedDocument,themeId:'clean-professional'}}));
    const published=await loadPublishedPortfolio('23456789ABCDEFGH');
    assert.equal(published.document.identity.name,'测试用户');
    const html=renderToStaticMarkup(<PortfolioRenderer document={published.document} themeId={published.themeId}/>);
    assert.ok(html.includes('测试用户'));
    assert.ok(!html.includes('private@example.com'));
  }
  globalThis.fetch=async()=>new Response(JSON.stringify({portfolio:{document:'broken-json'}}));
  await assert.rejects(loadPublishedPortfolio('23456789ABCDEFGH'),/内容格式无效/);
  globalThis.fetch=async()=>new Response('{}',{status:404});
  await assert.rejects(loadPublishedPortfolio('23456789ABCDEFGH'),/不存在或已经下线/);
}finally{globalThis.fetch=originalFetch;}

console.log('client preparation and theme tests passed');
