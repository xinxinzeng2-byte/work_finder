import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PortfolioRenderer} from '../src/components/PortfolioRenderer';
import {buildSuggestions,createPreparation,emptyPortfolio,getPreparation,themeNames,updatePreparation} from '../src/services/preparations';
import {contactKindLabels} from '../src/utils/portfolioContacts';
import {preparationToCustomizedResume} from '../src/utils/preparationResume';

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

console.log('client preparation and theme tests passed');
