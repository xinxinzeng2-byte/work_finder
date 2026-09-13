import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { allowMethods, bodyObject } from '../_lib/http';
import { currentUser, jsonValue, mapJob, mapPreparation, mapResume, requireId, sql } from '../_lib/data';
import { validateInterviewQuestions, validatePortfolioDocument, validateThemeId } from '../../server/src/services/portfolioValidation';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  const parts = Array.isArray(req.query.path) ? req.query.path : typeof req.query.path === 'string' ? req.query.path.split('/') : [];
  const [resource, id, action] = parts;
  if (resource === 'draft') return draft(req, res);
  if (resource === 'resumes') return id ? resumeItem(req, res, id) : resumes(req, res);
  if (resource === 'jobs') return id ? jobItem(req, res, id) : jobs(req, res);
  if (resource === 'preparations') {
    if (!id) return preparations(req, res);
    if (action === 'interview') return interview(req, res, id);
    if (action === 'publish') return publish(req, res, id);
    if (action === 'unpublish') return unpublish(req, res, id);
    return preparationItem(req, res, id);
  }
  res.status(404).json({ error: '数据接口不存在' });
}

async function preparations(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const userId = await currentUser(req, res); if (!userId) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT p.*,pub.slug AS public_slug,pub.status AS public_status,pub.published_at FROM job_preparations p LEFT JOIN published_portfolios pub ON pub.preparation_id=p.id WHERE p.user_id=${userId} ORDER BY p.updated_at DESC`;
      res.status(200).json({ preparations: rows.map((row: Record<string, unknown>) => mapPreparation(row)) }); return;
    }
    const body = bodyObject(req);
    if (!['targeted','general'].includes(String(body.mode)) || typeof body.name !== 'string' || typeof body.careerDirection !== 'string' || !body.sourceResumeSnapshot || !body.document) {
      res.status(400).json({ error: '求职准备数据不完整' }); return;
    }
    let document;let themeId;try{document=validatePortfolioDocument(body.document);themeId=validateThemeId(body.themeId||'clean-professional');}catch(error){res.status(400).json({error:error instanceof Error?error.message:'求职主页数据无效'});return;}
    const sourceJobId = typeof body.sourceJobId === 'string' && /^[0-9a-f-]{36}$/i.test(body.sourceJobId) ? body.sourceJobId : null;
    const sourceResumeId = typeof body.sourceResumeId === 'string' && /^[0-9a-f-]{36}$/i.test(body.sourceResumeId) ? body.sourceResumeId : null;
    const [row] = await sql`INSERT INTO job_preparations (user_id,mode,name,career_direction,source_job_id,source_resume_id,source_resume_version,source_resume_snapshot,job_snapshot,match_result_snapshot,document,content_suggestions,theme_id,theme_config,status) VALUES (${userId},${body.mode},${body.name.trim()},${body.careerDirection.trim()},${sourceJobId},${sourceResumeId},${typeof body.sourceResumeVersion === 'number' ? Math.floor(body.sourceResumeVersion) : null},${jsonValue(body.sourceResumeSnapshot,{})}::jsonb,${body.jobSnapshot ? jsonValue(body.jobSnapshot,{}) : null}::jsonb,${body.matchResultSnapshot ? jsonValue(body.matchResultSnapshot,{}) : null}::jsonb,${jsonValue(document,{})}::jsonb,${jsonValue(body.contentSuggestions,[])}::jsonb,${themeId},${jsonValue(body.themeConfig,{})}::jsonb,'draft') RETURNING *`;
    res.status(201).json({ preparation: mapPreparation(row) });
  } catch (error) { console.error('[Preparation create/list]', error); res.status(500).json({ error: '保存求职准备失败' }); }
}

async function preparationItem(req: VercelRequest, res: VercelResponse, id: string) {
  req.query.id = id; if (!allowMethods(req, res, ['GET','PATCH','DELETE'])) return;
  const identity = requireId(req, res); if (!identity) return;
  try {
    if (req.method === 'GET') {
      const [row] = await sql`SELECT p.*,pub.slug AS public_slug,pub.status AS public_status,pub.published_at FROM job_preparations p LEFT JOIN published_portfolios pub ON pub.preparation_id=p.id WHERE p.id=${identity.id} AND p.user_id=${identity.userId}`;
      if (!row) { res.status(404).json({ error: '求职准备不存在' }); return; }
      res.status(200).json({ preparation: mapPreparation(row) }); return;
    }
    if (req.method === 'DELETE') { await sql`DELETE FROM job_preparations WHERE id=${identity.id} AND user_id=${identity.userId}`; res.status(204).end(); return; }
    const body = bodyObject(req);
    if (typeof body.baseRevision !== 'number') { res.status(400).json({ error: '缺少草稿版本' }); return; }
    let document:string|null=null;let themeId:string|null=null;try{if(body.document)document=jsonValue(validatePortfolioDocument(body.document),{});if(body.themeId!==undefined)themeId=validateThemeId(body.themeId);}catch(error){res.status(400).json({error:error instanceof Error?error.message:'求职主页数据无效'});return;}
    const [row] = await sql`UPDATE job_preparations SET name=COALESCE(${typeof body.name === 'string' ? body.name.trim() : null},name),career_direction=COALESCE(${typeof body.careerDirection === 'string' ? body.careerDirection.trim() : null},career_direction),document=COALESCE(${document}::jsonb,document),content_suggestions=COALESCE(${body.contentSuggestions ? jsonValue(body.contentSuggestions,[]) : null}::jsonb,content_suggestions),theme_id=COALESCE(${themeId},theme_id),theme_config=COALESCE(${body.themeConfig ? jsonValue(body.themeConfig,{}) : null}::jsonb,theme_config),status=COALESCE(${typeof body.status === 'string' ? body.status : null},status),revision=revision+1,updated_at=now() WHERE id=${identity.id} AND user_id=${identity.userId} AND revision=${Math.floor(body.baseRevision)} RETURNING *`;
    if (!row) { res.status(409).json({ error: '草稿已在其他页面更新，请选择要保留的版本' }); return; }
    res.status(200).json({ preparation: mapPreparation(row) });
  } catch (error) { console.error('[Preparation item]', error); res.status(500).json({ error: '操作求职准备失败' }); }
}

async function interview(req: VercelRequest, res: VercelResponse, id: string) {
  req.query.id=id; if (!allowMethods(req,res,['GET','PUT'])) return; const identity=requireId(req,res); if(!identity)return;
  try {
    const [owned]=await sql`SELECT id FROM job_preparations WHERE id=${identity.id} AND user_id=${identity.userId}`;
    if(!owned){res.status(404).json({error:'求职准备不存在'});return;}
    if(req.method==='GET'){
      const [row]=await sql`SELECT * FROM interview_kits WHERE preparation_id=${identity.id} AND user_id=${identity.userId}`;
      res.status(200).json({interviewKit:row?{preparationId:row.preparation_id,questions:row.questions||[],generationBasisHash:row.generation_basis_hash,createdAt:row.created_at,updatedAt:row.updated_at}:null});return;
    }
    const body=bodyObject(req);let questions;try{questions=validateInterviewQuestions(body.questions||[]);}catch(error){res.status(400).json({error:error instanceof Error?error.message:'面试问题数据无效'});return;}const [row]=await sql`INSERT INTO interview_kits (preparation_id,user_id,questions,generation_basis_hash) VALUES (${identity.id},${identity.userId},${jsonValue(questions,[])}::jsonb,${typeof body.generationBasisHash==='string'?body.generationBasisHash.slice(0,200):''}) ON CONFLICT (preparation_id) DO UPDATE SET questions=EXCLUDED.questions,generation_basis_hash=EXCLUDED.generation_basis_hash,updated_at=now() WHERE interview_kits.user_id=${identity.userId} RETURNING *`;
    res.status(200).json({interviewKit:{preparationId:row.preparation_id,questions:row.questions||[],generationBasisHash:row.generation_basis_hash,createdAt:row.created_at,updatedAt:row.updated_at}});
  } catch(error){console.error('[Interview kit]',error);res.status(500).json({error:'保存面试准备失败'});}
}

const slugAlphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function makeSlug(){return Array.from(crypto.randomBytes(16),byte=>slugAlphabet[byte%slugAlphabet.length]).join('');}
function safeUrl(value:unknown){if(typeof value!=='string'||!(/^(https?:\/\/|mailto:|tel:)/i.test(value)))return '';try{const url=new URL(value);return ['http:','https:','mailto:','tel:'].includes(url.protocol)?value:'';}catch{return '';}}
function stripSourceReferences(value:any):any{
  if(Array.isArray(value))return value.map(stripSourceReferences);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['sourceId','sourceRefs','sourceReference'].includes(key)).map(([key,item])=>[key,stripSourceReferences(item)]));
  return value;
}
function publicDocument(value:any){
  const document=stripSourceReferences(JSON.parse(JSON.stringify(value||{})));
  document.contacts=Array.isArray(document.contacts)?document.contacts.filter((item:any)=>{if(item?.public!==true||typeof item.value!=='string'||!item.value.trim())return false;if(['website','github','linkedin'].includes(item.kind))return /^https?:\/\//i.test(item.value);if(item.kind==='email')return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item.value);return true;}).map((item:any)=>({...item,value:String(item.value||'')})):[];
  if(document.primaryAction?.href) document.primaryAction.href=safeUrl(document.primaryAction.href);
  if(document.primaryAction?.contactId&&!document.contacts.some((item:any)=>item.id===document.primaryAction.contactId)) document.primaryAction={label:'联系我'};
  return document;
}

async function publish(req:VercelRequest,res:VercelResponse,id:string){
  if(!allowMethods(req,res,['POST']))return; req.query.id=id; const identity=requireId(req,res);if(!identity)return;
  try{
    const [prep]=await sql`SELECT * FROM job_preparations WHERE id=${identity.id} AND user_id=${identity.userId}`;
    if(!prep){res.status(404).json({error:'求职准备不存在'});return;}
    const document=publicDocument(prep.document);
    const action=document.primaryAction||{};
    if(!document.contacts.length&&!safeUrl(action.href)){res.status(400).json({error:'发布前请至少公开一种联系方式或配置一个有效行动按钮'});return;}
    const [existing]=await sql`SELECT slug FROM published_portfolios WHERE preparation_id=${identity.id}`;
    let slug=existing?.slug;
    for(let attempts=0;!slug&&attempts<5;attempts+=1){const candidate=makeSlug();const rows=await sql`SELECT slug FROM published_portfolios WHERE slug=${candidate}`;if(!rows.length)slug=candidate;}
    if(!slug)throw new Error('无法生成公开链接');
    const [row]=await sql`INSERT INTO published_portfolios (preparation_id,user_id,slug,published_document,theme_id,theme_config,status,noindex) VALUES (${identity.id},${identity.userId},${slug},${jsonValue(document,{})}::jsonb,${prep.theme_id},${jsonValue(prep.theme_config,{})}::jsonb,'published',true) ON CONFLICT (preparation_id) DO UPDATE SET published_document=EXCLUDED.published_document,theme_id=EXCLUDED.theme_id,theme_config=EXCLUDED.theme_config,status='published',published_at=now(),updated_at=now() RETURNING *`;
    await sql`UPDATE job_preparations SET status='published',updated_at=now() WHERE id=${identity.id}`;
    res.status(200).json({slug:row.slug,status:row.status,publishedAt:row.published_at});
  }catch(error){console.error('[Publish portfolio]',error);res.status(500).json({error:'发布失败，请重试'});}
}

async function unpublish(req:VercelRequest,res:VercelResponse,id:string){
  if(!allowMethods(req,res,['POST']))return;req.query.id=id;const identity=requireId(req,res);if(!identity)return;
  try{await sql`UPDATE published_portfolios SET status='unpublished',updated_at=now() WHERE preparation_id=${identity.id} AND user_id=${identity.userId}`;await sql`UPDATE job_preparations SET status='draft',updated_at=now() WHERE id=${identity.id} AND user_id=${identity.userId}`;res.status(204).end();}
  catch{res.status(500).json({error:'下线失败，请重试'});}
}

async function resumes(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const userId = await currentUser(req, res); if (!userId) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM resumes WHERE user_id = ${userId} ORDER BY uploaded_at DESC`;
      res.status(200).json({ resumes: rows.map((row: Record<string, unknown>) => mapResume(row)) }); return;
    }
    const body = bodyObject(req);
    if (typeof body.name !== 'string' || !body.name.trim() || !['original', 'customized'].includes(String(body.type)) || !body.resume) {
      res.status(400).json({ error: '简历数据不完整' }); return;
    }
    const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
    const values = [body.name.trim(), body.type, jsonValue(body.resume, {}), body.originalText || null, body.fileName || null, body.sourceFileData || null, body.sourceMimeType || null, body.isCurrent === true, jsonValue(body.sourceIds, []), body.targetJob == null ? null : jsonValue(body.targetJob, null), typeof body.version === 'number' && body.version >= 1 ? Math.floor(body.version) : 1];
    const [row] = id
      ? await sql`INSERT INTO resumes (id,user_id,name,type,resume,original_text,file_name,file_data,file_mime,is_current,source_ids,target_job,version) VALUES (${id},${userId},${values[0]},${values[1]},${values[2]}::jsonb,${values[3]},${values[4]},${values[5]},${values[6]},${values[7]},${values[8]}::jsonb,${values[9]}::jsonb,${values[10]}) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,type=EXCLUDED.type,resume=EXCLUDED.resume,original_text=EXCLUDED.original_text,file_name=EXCLUDED.file_name,file_data=EXCLUDED.file_data,file_mime=EXCLUDED.file_mime,is_current=EXCLUDED.is_current,source_ids=EXCLUDED.source_ids,target_job=EXCLUDED.target_job,version=EXCLUDED.version WHERE resumes.user_id=${userId} RETURNING *`
      : await sql`INSERT INTO resumes (user_id,name,type,resume,original_text,file_name,file_data,file_mime,is_current,source_ids,target_job,version) VALUES (${userId},${values[0]},${values[1]},${values[2]}::jsonb,${values[3]},${values[4]},${values[5]},${values[6]},${values[7]},${values[8]}::jsonb,${values[9]}::jsonb,${values[10]}) RETURNING *`;
    if (body.isCurrent === true && body.type === 'original') await sql`UPDATE resumes SET is_current=false WHERE user_id=${userId} AND id<>${row.id} AND type='original'`;
    res.status(201).json({ resume: mapResume(row) });
  } catch { res.status(500).json({ error: '保存简历失败' }); }
}

async function resumeItem(req: VercelRequest, res: VercelResponse, id: string) {
  req.query.id = id;
  if (!allowMethods(req, res, ['PATCH', 'DELETE'])) return;
  const identity = requireId(req, res); if (!identity) return;
  try {
    if (req.method === 'DELETE') { await sql`DELETE FROM resumes WHERE id=${identity.id} AND user_id=${identity.userId}`; res.status(204).end(); return; }
    const body = bodyObject(req);
    if (body.resume) {
      const [row] = await sql`UPDATE resumes SET resume=${jsonValue(body.resume,{})}::jsonb,version=COALESCE(${typeof body.version === 'number' && body.version >= 1 ? Math.floor(body.version) : null},version) WHERE id=${identity.id} AND user_id=${identity.userId} RETURNING *`;
      if (!row) { res.status(404).json({ error: '简历不存在' }); return; }
      res.status(200).json({ resume: mapResume(row) }); return;
    }
    if (typeof body.name === 'string') {
      const [row] = await sql`UPDATE resumes SET name=${body.name.trim()} WHERE id=${identity.id} AND user_id=${identity.userId} RETURNING *`;
      if (!row) { res.status(404).json({ error: '简历不存在' }); return; }
      res.status(200).json({ resume: mapResume(row) }); return;
    }
    if (body.isCurrent === true) {
      await sql`UPDATE resumes SET is_current=false WHERE user_id=${identity.userId} AND type='original'`;
      const [row] = await sql`UPDATE resumes SET is_current=true WHERE id=${identity.id} AND user_id=${identity.userId} AND type='original' RETURNING *`;
      if (!row) { res.status(404).json({ error: '原始简历不存在' }); return; }
      res.status(200).json({ resume: mapResume(row) }); return;
    }
    res.status(400).json({ error: '没有可更新的字段' });
  } catch { res.status(500).json({ error: '更新简历失败' }); }
}

async function jobs(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const userId = await currentUser(req, res); if (!userId) return;
  try {
    if (req.method === 'GET') { const rows = await sql`SELECT * FROM jobs WHERE user_id=${userId} ORDER BY saved_at DESC`; res.status(200).json({ jobs: rows.map((row: Record<string, unknown>) => mapJob(row)) }); return; }
    const body = bodyObject(req); if (!body.jd || !body.matchResult) { res.status(400).json({ error: '岗位数据不完整' }); return; }
    const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
    const analyzedResumeId = typeof body.analyzedResumeId === 'string' && /^[0-9a-f-]{36}$/i.test(body.analyzedResumeId) ? body.analyzedResumeId : null;
    const values = [body.sequenceNumber ?? null, body.jobName || null, body.company || null, body.intendedPosition || null, body.matchScore ?? null, body.status || 'analyzed', jsonValue(body.jd, {}), jsonValue(body.matchResult, {}), body.resumeSnapshot == null ? null : jsonValue(body.resumeSnapshot, null), body.generatedResume == null ? null : jsonValue(body.generatedResume, null), jsonValue(body.supplementedGaps, []), jsonValue(body.sourceResumeIds, []), analyzedResumeId, typeof body.analyzedResumeVersion === 'number' ? Math.floor(body.analyzedResumeVersion) : null, typeof body.scoringVersion === 'string' ? body.scoringVersion : null, typeof body.inputHash === 'string' ? body.inputHash : null, body.savedAt || null, body.analyzedAt || null, body.createdAt || null, body.updatedAt || null];
    const [row] = id ? await sql`INSERT INTO jobs (id,user_id,sequence_number,job_name,company,intended_position,match_score,status,jd,match_result,resume_snapshot,generated_resume,supplemented_gaps,source_resume_ids,analyzed_resume_id,analyzed_resume_version,scoring_version,input_hash,saved_at,analyzed_at,created_at,updated_at) VALUES (${id},${userId},${values[0]},${values[1]},${values[2]},${values[3]},${values[4]},${values[5]},${values[6]}::jsonb,${values[7]}::jsonb,${values[8]}::jsonb,${values[9]}::jsonb,${values[10]}::jsonb,${values[11]}::jsonb,${values[12]},${values[13]},${values[14]},${values[15]},COALESCE(${values[16]},now()),${values[17]},COALESCE(${values[18]},now()),COALESCE(${values[19]},now())) ON CONFLICT (id) DO UPDATE SET sequence_number=EXCLUDED.sequence_number,job_name=EXCLUDED.job_name,company=EXCLUDED.company,intended_position=EXCLUDED.intended_position,match_score=EXCLUDED.match_score,status=EXCLUDED.status,jd=EXCLUDED.jd,match_result=EXCLUDED.match_result,resume_snapshot=EXCLUDED.resume_snapshot,generated_resume=EXCLUDED.generated_resume,supplemented_gaps=EXCLUDED.supplemented_gaps,source_resume_ids=EXCLUDED.source_resume_ids,analyzed_resume_id=EXCLUDED.analyzed_resume_id,analyzed_resume_version=EXCLUDED.analyzed_resume_version,scoring_version=EXCLUDED.scoring_version,input_hash=EXCLUDED.input_hash,saved_at=EXCLUDED.saved_at,analyzed_at=EXCLUDED.analyzed_at,updated_at=now() WHERE jobs.user_id=${userId} RETURNING *` : await sql`INSERT INTO jobs (user_id,sequence_number,job_name,company,intended_position,match_score,status,jd,match_result,resume_snapshot,generated_resume,supplemented_gaps,source_resume_ids,analyzed_resume_id,analyzed_resume_version,scoring_version,input_hash,saved_at,analyzed_at,created_at,updated_at) VALUES (${userId},${values[0]},${values[1]},${values[2]},${values[3]},${values[4]},${values[5]},${values[6]}::jsonb,${values[7]}::jsonb,${values[8]}::jsonb,${values[9]}::jsonb,${values[10]}::jsonb,${values[11]}::jsonb,${values[12]},${values[13]},${values[14]},${values[15]},COALESCE(${values[16]},now()),${values[17]},COALESCE(${values[18]},now()),COALESCE(${values[19]},now())) RETURNING *`;
    res.status(201).json({ job: mapJob(row) });
  } catch { res.status(500).json({ error: '保存岗位失败' }); }
}

async function jobItem(req: VercelRequest, res: VercelResponse, id: string) {
  req.query.id = id; if (!allowMethods(req, res, ['PATCH', 'DELETE'])) return;
  const identity = requireId(req, res); if (!identity) return;
  try {
    if (req.method === 'DELETE') { await sql`DELETE FROM jobs WHERE id=${identity.id} AND user_id=${identity.userId}`; res.status(204).end(); return; }
    const body = bodyObject(req);
    const [row] = await sql`UPDATE jobs SET status=COALESCE(${body.status ?? null},status),job_name=COALESCE(${body.jobName ?? null},job_name),company=COALESCE(${body.company ?? null},company),intended_position=COALESCE(${body.intendedPosition ?? null},intended_position),match_score=COALESCE(${body.matchScore ?? null},match_score),jd=COALESCE(${body.jd ? jsonValue(body.jd,{}) : null}::jsonb,jd),match_result=COALESCE(${body.matchResult ? jsonValue(body.matchResult,{}) : null}::jsonb,match_result),resume_snapshot=COALESCE(${body.resumeSnapshot ? jsonValue(body.resumeSnapshot,{}) : null}::jsonb,resume_snapshot),generated_resume=COALESCE(${body.generatedResume ? jsonValue(body.generatedResume,{}) : null}::jsonb,generated_resume),supplemented_gaps=COALESCE(${body.supplementedGaps ? jsonValue(body.supplementedGaps,[]) : null}::jsonb,supplemented_gaps),source_resume_ids=COALESCE(${body.sourceResumeIds ? jsonValue(body.sourceResumeIds,[]) : null}::jsonb,source_resume_ids),analyzed_resume_id=COALESCE(${typeof body.analyzedResumeId === 'string' && /^[0-9a-f-]{36}$/i.test(body.analyzedResumeId) ? body.analyzedResumeId : null}::uuid,analyzed_resume_id),analyzed_resume_version=COALESCE(${typeof body.analyzedResumeVersion === 'number' ? Math.floor(body.analyzedResumeVersion) : null},analyzed_resume_version),scoring_version=COALESCE(${typeof body.scoringVersion === 'string' ? body.scoringVersion : null},scoring_version),input_hash=COALESCE(${typeof body.inputHash === 'string' ? body.inputHash : null},input_hash),updated_at=now() WHERE id=${identity.id} AND user_id=${identity.userId} RETURNING *`;
    if (!row) { res.status(404).json({ error: '岗位记录不存在' }); return; } res.status(200).json({ job: mapJob(row) });
  } catch { res.status(500).json({ error: '更新岗位失败' }); }
}

async function draft(req: VercelRequest, res: VercelResponse) {
  if (!allowMethods(req, res, ['GET', 'PUT', 'DELETE'])) return; const userId = await currentUser(req, res); if (!userId) return;
  try {
    if (req.method === 'GET') { const [row] = await sql`SELECT data,updated_at FROM workflow_drafts WHERE user_id=${userId}`; res.status(200).json({ draft: row ? { id: userId, updatedAt: row.updated_at, data: row.data } : null }); return; }
    if (req.method === 'DELETE') { await sql`WITH marked AS (INSERT INTO workflow_draft_tombstones (user_id,deleted_at) VALUES (${userId},now()) ON CONFLICT (user_id) DO UPDATE SET deleted_at=EXCLUDED.deleted_at RETURNING user_id) DELETE FROM workflow_drafts WHERE user_id=(SELECT user_id FROM marked)`; res.status(204).end(); return; }
    const body = bodyObject(req); if (!body.data) { res.status(400).json({ error: '草稿内容不能为空' }); return; }
    const clientUpdatedAt = typeof body.updatedAt === 'string' && !Number.isNaN(Date.parse(body.updatedAt)) ? body.updatedAt : null;
    if (!clientUpdatedAt) { res.status(400).json({ error: '草稿更新时间无效，请刷新页面后重试' }); return; }
    const [row] = await sql`INSERT INTO workflow_drafts (user_id,data,client_updated_at,updated_at) VALUES (${userId},${jsonValue(body.data,{})}::jsonb,${clientUpdatedAt}::timestamptz,now()) ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data,client_updated_at=EXCLUDED.client_updated_at,updated_at=now() RETURNING data,updated_at`;
    if (!row) { res.status(409).json({ error: '该草稿早于最近一次放弃操作，已忽略旧数据' }); return; }
    res.status(200).json({ draft: { id: userId, updatedAt: row.updated_at, data: row.data } });
  } catch { res.status(500).json({ error: '操作草稿失败' }); }
}
