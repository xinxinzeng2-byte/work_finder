import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PortfolioRenderer} from '../src/components/PortfolioRenderer';
import {buildSuggestions,createPreparation,emptyPortfolio,getPreparation,themeNames,updatePreparation} from '../src/services/preparations';

const memory=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>{memory.set(key,value);},removeItem:(key:string)=>{memory.delete(key);}}});

const resume={basicInfo:{name:'测试用户',email:'private@example.com'},skills:[],experiences:[],rawText:'真实简历'};
const document=emptyPortfolio('产品经理','测试用户');
document.blocks=[{id:'advantages',type:'advantages',title:'核心优势',visible:true,order:0,data:{items:['用户研究','产品规划']},sourceRefs:[]},{id:'hidden',type:'education',title:'隐藏区块',visible:false,order:1,data:{content:'不应出现的内容'},sourceRefs:[]}];
document.contacts=[{id:'email',kind:'email',label:'邮箱',value:'private@example.com',public:false}];

for(const theme of Object.keys(themeNames) as Array<keyof typeof themeNames>){const html=renderToStaticMarkup(<PortfolioRenderer document={document} themeId={theme}/>);assert.ok(html.includes(`theme-${theme}`));assert.ok(html.includes('测试用户'));assert.ok(!html.includes('private@example.com'),'未公开联系方式不得渲染');assert.ok(!html.includes('不应出现的内容'),'隐藏区块不得渲染');}

const wechatDocument={...document,contacts:[{id:'wechat',kind:'wechat' as const,label:'微信',value:'worker-finder',public:true}],primaryAction:{label:'联系我',contactId:'wechat'}};
const wechatHtml=renderToStaticMarkup(<PortfolioRenderer document={wechatDocument} themeId="clean-professional"/>);
assert.ok(wechatHtml.includes('href="#contact"'),'非链接类联系方式应定位到公开联系区');

const created=await createPreparation({mode:'general',name:'测试主页',careerDirection:'产品经理',sourceResumeId:'resume-1',sourceResumeVersion:1,sourceResumeSnapshot:resume,document,documentSchemaVersion:1,contentSuggestions:buildSuggestions(),themeId:'clean-professional',themeConfig:{}});
assert.equal(created.revision,1);
const updated=await updatePreparation(created,{themeId:'enterprise-tech'});
assert.equal(updated.revision,2);
assert.equal((await getPreparation(created.id)).themeId,'enterprise-tech');
assert.equal(buildSuggestions().length,2);

console.log('client preparation and theme tests passed');
