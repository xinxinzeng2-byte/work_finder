import type { PortfolioBlockType, PortfolioDocument, ThemeId } from '../types';

const blockTypes = new Set<PortfolioBlockType>(['hero','advantages','projects','experience','skills','education','contact']);
const contactKinds = new Set(['email','phone','website','github','linkedin','wechat','custom']);
const themeIds = new Set<ThemeId>(['clean-professional','product-home','creative-portfolio','enterprise-tech']);
const allowedProtocols = new Set(['http:','https:','mailto:','tel:']);

function object(value:unknown):Record<string,any>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('求职主页结构无效');
  return value as Record<string,any>;
}

function shortText(value:unknown,label:string,max=500):string{
  if(typeof value!=='string')throw new Error(`${label}必须是文本`);
  const result=value.trim();
  if(result.length>max)throw new Error(`${label}超过 ${max} 字`);
  return result;
}

function safeJson(value:unknown,depth=0):unknown{
  if(depth>6)throw new Error('区块内容层级过深');
  if(value===null||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='string')return shortText(value,'区块内容',5000);
  if(Array.isArray(value)){
    if(value.length>100)throw new Error('区块内容条目过多');
    return value.map(item=>safeJson(item,depth+1));
  }
  const source=object(value);
  const entries=Object.entries(source);
  if(entries.length>60)throw new Error('区块内容字段过多');
  return Object.fromEntries(entries.map(([key,item])=>[shortText(key,'字段名',80),safeJson(item,depth+1)]));
}

export function validatePortfolioBlockData(value:unknown):Record<string,unknown>{
  return safeJson(object(value)) as Record<string,unknown>;
}

const interviewCategories=new Set(['role','experience','gap','scenario','reverse']);
export function validateInterviewQuestions(value:unknown){
  if(!Array.isArray(value)||value.length>100)throw new Error('面试问题数据无效');
  return value.map((raw,index)=>{const question=object(raw);if(!interviewCategories.has(question.category))throw new Error('面试问题分类无效');return{id:shortText(question.id||`question_${index+1}`,'面试问题 ID',120),category:question.category as 'role'|'experience'|'gap'|'scenario'|'reverse',question:shortText(question.question,'面试问题',800),rationale:shortText(question.rationale||'','生成原因',1000),relatedSource:question.relatedSource?shortText(question.relatedSource,'关联经历',240):undefined,starred:question.starred===true,answerNote:shortText(question.answerNote||'','答题笔记',20_000)};});
}

function safeLink(value:unknown):string|undefined{
  if(value===undefined||value==='')return undefined;
  const link=shortText(value,'行动按钮链接',1000);
  try{const url=new URL(link);if(!allowedProtocols.has(url.protocol))throw new Error();return link;}catch{throw new Error('行动按钮链接仅支持 http、https、mailto 或 tel');}
}

export function validateThemeId(value:unknown):ThemeId{
  if(typeof value!=='string'||!themeIds.has(value as ThemeId))throw new Error('未知的主题');
  return value as ThemeId;
}

export function validatePortfolioDocument(value:unknown):PortfolioDocument{
  const source=object(value);
  if(source.schemaVersion!==1)throw new Error('不支持的求职主页版本');
  const identity=object(source.identity);
  if(!Array.isArray(source.blocks)||source.blocks.length>30)throw new Error('求职主页区块无效');
  if(!Array.isArray(source.contacts)||source.contacts.length>20)throw new Error('联系方式无效');
  const blocks=source.blocks.map((raw:unknown,index:number)=>{
    const block=object(raw);const type=block.type as PortfolioBlockType;
    if(!blockTypes.has(type))throw new Error('求职主页包含未知区块');
    return{id:shortText(block.id,`第 ${index+1} 个区块 ID`,100),type,title:shortText(block.title,`第 ${index+1} 个区块标题`,120),visible:block.visible!==false,order:Number.isFinite(block.order)?Math.floor(block.order):index,data:safeJson(block.data) as Record<string,unknown>,sourceRefs:Array.isArray(block.sourceRefs)?block.sourceRefs.slice(0,100).map((item:unknown)=>shortText(item,'来源引用',120)):[]};
  });
  const contacts=source.contacts.map((raw:unknown,index:number)=>{const contact=object(raw);if(!contactKinds.has(contact.kind))throw new Error('联系方式类型无效');return{id:shortText(contact.id,`第 ${index+1} 个联系方式 ID`,100),kind:contact.kind,label:shortText(contact.label,'联系方式名称',80),value:shortText(contact.value,'联系方式内容',1000),public:contact.public===true};});
  const action=object(source.primaryAction||{});
  const document:PortfolioDocument={schemaVersion:1,direction:shortText(source.direction,'求职方向',160),identity:{name:shortText(identity.name,'姓名',120),headline:shortText(identity.headline,'个人定位',240),tagline:shortText(identity.tagline,'价值主张',1000),location:identity.location?shortText(identity.location,'所在地',120):undefined},blocks,contacts,primaryAction:{label:shortText(action.label||'联系我','行动按钮文案',80),contactId:action.contactId?shortText(action.contactId,'行动按钮联系方式',100):undefined,href:safeLink(action.href)}};
  if(JSON.stringify(document).length>200_000)throw new Error('求职主页内容过大');
  return document;
}
