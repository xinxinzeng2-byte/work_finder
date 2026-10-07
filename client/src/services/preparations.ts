import type { ContentSuggestion, InterviewKit, InterviewQuestion, JobPreparation, PortfolioBlock, PortfolioDocument, PublishedPortfolio, ThemeId } from '../types';
import { isMatchResultV2 } from '../types';
import { getApiKey, isCloudApiKeyMode, isCloudMode, type SavedJob } from '../utils/storage';
import { jsonRequest } from './http';

const LOCAL_KEY='wf_job_preparations';
const LOCAL_INTERVIEW_KEY='wf_interview_kits';
const pendingWrites=new Set<Promise<unknown>>();

export function trackPreparationWrite<T>(operation:Promise<T>):Promise<T>{pendingWrites.add(operation);void operation.finally(()=>pendingWrites.delete(operation)).catch(()=>undefined);return operation;}
export async function flushPreparationWrites():Promise<void>{while(pendingWrites.size)await Promise.allSettled([...pendingWrites]);}

function localItems():JobPreparation[]{try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');}catch{return[];}}
function saveLocal(items:JobPreparation[]){localStorage.setItem(LOCAL_KEY,JSON.stringify(items));}
function parseStoredJson(value:unknown):unknown{if(typeof value!=='string')return value;try{return JSON.parse(value);}catch{return undefined;}}
const interviewCategories=new Set<InterviewQuestion['category']>(['role','experience','gap','scenario','reverse']);
function normalizeInterviewQuestions(value:unknown):InterviewQuestion[]{
  const parsed=parseStoredJson(value);
  if(!Array.isArray(parsed))return[];
  return parsed.flatMap((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return[];
    const question=raw as Record<string,unknown>;
    if(typeof question.category!=='string'||!interviewCategories.has(question.category as InterviewQuestion['category']))return[];
    const content=typeof question.question==='string'?question.question.trim():'';
    if(!content)return[];
    return [{
      id:typeof question.id==='string'&&question.id.trim()?question.id:`question_${index+1}`,
      category:question.category as InterviewQuestion['category'],
      question:content,
      rationale:typeof question.rationale==='string'?question.rationale:'',
      relatedSource:typeof question.relatedSource==='string'&&question.relatedSource.trim()?question.relatedSource:undefined,
      starred:question.starred===true,
      answerNote:typeof question.answerNote==='string'?question.answerNote:'',
    }];
  });
}
function normalizeInterviewKit(value:unknown,preparationId:string):InterviewKit|null{
  const parsed=parseStoredJson(value);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
  const kit=parsed as Record<string,unknown>;
  return{preparationId:typeof kit.preparationId==='string'?kit.preparationId:preparationId,questions:normalizeInterviewQuestions(kit.questions),generationBasisHash:typeof kit.generationBasisHash==='string'?kit.generationBasisHash:'',createdAt:typeof kit.createdAt==='string'?kit.createdAt:undefined,updatedAt:typeof kit.updatedAt==='string'?kit.updatedAt:undefined};
}
function normalizePreparation(item:JobPreparation):JobPreparation{
  const stored=item as JobPreparation&{document?:unknown;contentSuggestions?:unknown};
  const parsedDocument=parseStoredJson(stored.document);
  const suggestions=parseStoredJson(stored.contentSuggestions);
  const document=parsedDocument&&typeof parsedDocument==='object'&&!Array.isArray(parsedDocument)?parsedDocument as PortfolioDocument:emptyPortfolio(item.careerDirection);
  return {...item,document,contentSuggestions:Array.isArray(suggestions)?suggestions.filter((value):value is ContentSuggestion=>Boolean(value)&&typeof value==='object'):[]};
}

export function emptyPortfolio(direction:string,name='你的名字'):PortfolioDocument{return{schemaVersion:1,direction,identity:{name,headline:direction,tagline:`专注于${direction}，用清晰的方法解决真实问题。`},blocks:[],contacts:[],primaryAction:{label:'联系我'}};}

export function buildSuggestions(job?:SavedJob):ContentSuggestion[]{
  if(!job)return[
    {id:'general_projects',title:'补充代表项目',detail:'选择最能代表你的项目，说明背景、行动与真实结果。',kind:'content_completeness',status:'pending',recommendedBlockTypes:['projects','experience']},
    {id:'general_advantages',title:'让核心优势更具体',detail:'用真实经历或结果证明你的个人定位。',kind:'content_completeness',status:'pending',recommendedBlockTypes:['advantages','experience']},
  ];
  if(isMatchResultV2(job.matchResult))return job.matchResult.capabilityEvidence.filter(item=>(item.isScoreable&&item.resumeEvidenceLevel!=='owned')||(item.isHard&&item.hardConditionStatus!=='met'&&item.hardConditionStatus!=='not_applicable')).map(item=>({id:`suggest_${item.id}`,requirementId:item.id,title:item.title||item.requirement,detail:item.isHard?'这是硬性条件，请只在事实确实成立时补充；否则选择“暂时没有”。':item.resumeEvidence?'已有相关内容，但证据强度或表达仍可提升。':'简历中尚未发现明确证据，请先确认自己是否有真实经历。',kind:item.isHard?'hard_gap':item.resumeEvidence?'weak_expression':'missing_evidence',status:'pending',recommendedBlockTypes:item.isHard?['advantages']:item.dimension==='project'?['projects']:item.dimension==='skill'?['skills','experience']:['experience','projects']}));
  return job.matchResult.gaps.map((gap,index)=>({id:`suggest_legacy_${index}`,title:gap.requirement,detail:gap.evidence?'已有相关内容，可以加强表达。':'历史分析中未发现明确证据。',kind:gap.evidence?'weak_expression':'missing_evidence',status:'pending',recommendedBlockTypes:['experience','projects']}));
}

export async function listPreparations():Promise<JobPreparation[]>{if(!isCloudMode)return localItems().map(normalizePreparation).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));return (await jsonRequest<{preparations:JobPreparation[]}>('/api/data/preparations')).preparations.map(normalizePreparation);}
export async function getPreparation(id:string):Promise<JobPreparation>{if(!isCloudMode){const item=localItems().find(value=>value.id===id);if(!item)throw new Error('求职准备不存在');return normalizePreparation(item);}return normalizePreparation((await jsonRequest<{preparation:JobPreparation}>(`/api/data/preparations/${id}`)).preparation);}
export async function createPreparation(input:Omit<JobPreparation,'id'|'revision'|'status'|'createdAt'|'updatedAt'>):Promise<JobPreparation>{
  if(isCloudMode)return normalizePreparation((await jsonRequest<{preparation:JobPreparation}>('/api/data/preparations',{method:'POST',body:JSON.stringify(input)})).preparation);
  const now=new Date().toISOString();const item:JobPreparation={...input,id:crypto.randomUUID(),revision:1,status:'draft',createdAt:now,updatedAt:now};const items=localItems();items.unshift(item);saveLocal(items);return item;
}
export async function updatePreparation(item:JobPreparation,updates:Partial<Pick<JobPreparation,'name'|'careerDirection'|'document'|'contentSuggestions'|'themeId'|'themeConfig'|'status'>>):Promise<JobPreparation>{
  if(isCloudMode)return normalizePreparation((await jsonRequest<{preparation:JobPreparation}>(`/api/data/preparations/${item.id}`,{method:'PATCH',body:JSON.stringify({...updates,baseRevision:item.revision})})).preparation);
  const next={...item,...updates,revision:item.revision+1,updatedAt:new Date().toISOString()};saveLocal(localItems().map(value=>value.id===item.id?next:value));return next;
}
export async function deletePreparation(id:string):Promise<void>{if(isCloudMode){await jsonRequest(`/api/data/preparations/${id}`,{method:'DELETE'});return;}saveLocal(localItems().filter(item=>item.id!==id));}

export async function publishPreparation(id:string):Promise<{slug:string;publishedAt:string}>{if(!isCloudMode)throw new Error('公开发布需要登录并使用云端模式');return jsonRequest(`/api/data/preparations/${id}/publish`,{method:'POST'});}
export async function unpublishPreparation(id:string):Promise<void>{if(!isCloudMode)throw new Error('公开发布需要云端模式');await jsonRequest(`/api/data/preparations/${id}/unpublish`,{method:'POST'});}
export async function loadPublishedPortfolio(slug:string):Promise<PublishedPortfolio>{const response=await fetch(`/api/public/portfolios/${encodeURIComponent(slug)}`,{cache:'no-store'});if(!response.ok)throw new Error(response.status===404?'这个主页不存在或已经下线':'公开主页暂时无法访问');return(await response.json()).portfolio;}

function aiHeaders():Record<string,string>{const key=isCloudApiKeyMode?null:getApiKey();return key?{'x-deepseek-key':key}:{};}
export async function generatePortfolio(id:string,payload:{resume:unknown;direction:string;jobDescription?:unknown;matchResult?:unknown}):Promise<PortfolioDocument>{return(await jsonRequest<{document:PortfolioDocument}>(`/api/ai/preparations/${id}/generate`,{method:'POST',headers:aiHeaders(),body:JSON.stringify(payload)})).document;}
export async function optimizeBlock(preparation:JobPreparation,block:PortfolioBlock,instruction:string){return jsonRequest<{data:Record<string,unknown>;explanation:string}>(`/api/ai/preparations/${preparation.id}/blocks/${block.id}/optimize`,{method:'POST',headers:aiHeaders(),body:JSON.stringify({block,direction:preparation.careerDirection,instruction,resume:preparation.sourceResumeSnapshot})});}
export async function polishSuggestion(preparation:JobPreparation,suggestion:ContentSuggestion,userFacts:string){return jsonRequest<{text:string}>(`/api/ai/preparations/${preparation.id}/suggestions/${suggestion.id}/propose`,{method:'POST',headers:aiHeaders(),body:JSON.stringify({direction:preparation.careerDirection,suggestion:`${suggestion.title}：${suggestion.detail}`,userFacts})});}
export async function generateInterview(preparation:JobPreparation):Promise<InterviewQuestion[]>{const response=await jsonRequest<{questions:unknown}>(`/api/ai/preparations/${preparation.id}/interview/generate`,{method:'POST',headers:aiHeaders(),body:JSON.stringify({direction:preparation.careerDirection,document:preparation.document,jobDescription:preparation.jobSnapshot,matchResult:preparation.matchResultSnapshot})});const questions=normalizeInterviewQuestions(response.questions);if(!questions.length)throw new Error('AI 未返回有效的面试问题，请重试');return questions;}

function localKits():unknown[]{try{const parsed=JSON.parse(localStorage.getItem(LOCAL_INTERVIEW_KEY)||'[]');return Array.isArray(parsed)?parsed:[];}catch{return[];}}
export async function getInterviewKit(id:string):Promise<InterviewKit|null>{if(!isCloudMode){const stored=localKits().find(item=>Boolean(item)&&typeof item==='object'&&(item as Record<string,unknown>).preparationId===id);return normalizeInterviewKit(stored,id);}const response=await jsonRequest<{interviewKit:unknown}>(`/api/data/preparations/${id}/interview`);return normalizeInterviewKit(response.interviewKit,id);}
export async function saveInterviewKit(kit:InterviewKit):Promise<InterviewKit>{if(isCloudMode){const response=await jsonRequest<{interviewKit:unknown}>(`/api/data/preparations/${kit.preparationId}/interview`,{method:'PUT',body:JSON.stringify(kit)});const saved=normalizeInterviewKit(response.interviewKit,kit.preparationId);if(!saved)throw new Error('云端返回的面试问题数据无效');return saved;}const now=new Date().toISOString();const next={...kit,questions:normalizeInterviewQuestions(kit.questions),updatedAt:now,createdAt:kit.createdAt||now};const kits=localKits();const index=kits.findIndex(item=>Boolean(item)&&typeof item==='object'&&(item as Record<string,unknown>).preparationId===kit.preparationId);if(index>=0)kits[index]=next;else kits.push(next);localStorage.setItem(LOCAL_INTERVIEW_KEY,JSON.stringify(kits));return next;}

export const themeNames:Record<ThemeId,string>={'clean-professional':'清爽专业','product-home':'产品主页风','creative-portfolio':'创意作品集风','enterprise-tech':'企业科技风'};
