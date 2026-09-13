import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { getSql } from '../services/database';
import { getUserId } from '../services/authService';
import { validateInterviewQuestions, validatePortfolioDocument, validateThemeId } from '../services/portfolioValidation';

const router = Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bodyObject(req: Request): Record<string, any> {
  return req.body && typeof req.body === 'object' ? req.body as Record<string, any> : {};
}

function mapResume(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    resume: row.resume,
    originalText: row.original_text || undefined,
    fileName: row.file_name || undefined,
    sourceFileData: row.file_data || undefined,
    sourceMimeType: row.file_mime || undefined,
    isCurrent: row.is_current,
    sourceIds: row.source_ids || [],
    targetJob: row.target_job || undefined,
    version: row.version || 1,
    uploadedAt: row.uploaded_at,
  };
}

function mapJob(row: Record<string, any>) {
  return {
    id: row.id,
    sequenceNumber: row.sequence_number,
    jobName: row.job_name || undefined,
    company: row.company || undefined,
    intendedPosition: row.intended_position || undefined,
    matchScore: row.match_score,
    status: row.status,
    jd: row.jd,
    matchResult: row.match_result,
    resumeSnapshot: row.resume_snapshot || undefined,
    generatedResume: row.generated_resume || undefined,
    supplementedGaps: row.supplemented_gaps || [],
    sourceResumeIds: row.source_resume_ids || [],
    analyzedResumeId: row.analyzed_resume_id || undefined,
    analyzedResumeVersion: row.analyzed_resume_version || undefined,
    scoringVersion: row.scoring_version || undefined,
    inputHash: row.input_hash || undefined,
    savedAt: row.saved_at,
    analyzedAt: row.analyzed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPreparation(row: Record<string, any>) {
  return { id:row.id,mode:row.mode,name:row.name,careerDirection:row.career_direction,sourceJobId:row.source_job_id||undefined,sourceResumeId:row.source_resume_id||undefined,sourceResumeVersion:row.source_resume_version||undefined,sourceResumeSnapshot:row.source_resume_snapshot,jobSnapshot:row.job_snapshot||undefined,matchResultSnapshot:row.match_result_snapshot||undefined,document:row.document,documentSchemaVersion:row.document_schema_version||1,contentSuggestions:row.content_suggestions||[],themeId:row.theme_id,themeConfig:row.theme_config||{},status:row.status,revision:row.revision||1,publicSlug:row.public_slug||undefined,publicStatus:row.public_status||undefined,publishedAt:row.published_at||undefined,createdAt:row.created_at,updatedAt:row.updated_at };
}

function jsonText(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function currentUser(req: Request, res: Response): string | null {
  try {
    return getUserId(req);
  } catch {
    res.status(401).json({ error: '未登录或登录已过期' });
    return null;
  }
}

function resourceId(req: Request, res: Response): string | null {
  const id = req.params.id;
  if (!uuidPattern.test(id)) {
    res.status(400).json({ error: '无效的数据 ID' });
    return null;
  }
  return id;
}

router.get('/resumes', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  try {
    const sql = getSql();
    const rows = await sql`SELECT * FROM resumes WHERE user_id = ${userId} ORDER BY uploaded_at DESC`;
    res.json({ resumes: rows.map(mapResume) });
  } catch (error) {
    console.error('[Data resumes list]', error);
    res.status(500).json({ error: '读取简历失败' });
  }
});

router.post('/resumes', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  const body = bodyObject(req);
  const type = body.type === 'customized' ? 'customized' : body.type === 'original' ? 'original' : '';
  if (!type || !body.resume || typeof body.name !== 'string') {
    res.status(400).json({ error: '简历数据不完整' });
    return;
  }
  try {
    const sql = getSql();
    const id = typeof body.id === 'string' && uuidPattern.test(body.id) ? body.id : null;
    if (body.isCurrent === true && type === 'original') {
      await sql`UPDATE resumes SET is_current = false WHERE user_id = ${userId}`;
    }
    const values = {
      name: body.name,
      type,
      resume: jsonText(body.resume),
      originalText: typeof body.originalText === 'string' ? body.originalText : null,
      fileName: typeof body.fileName === 'string' ? body.fileName : null,
      fileData: typeof body.sourceFileData === 'string' ? body.sourceFileData : null,
      fileMime: typeof body.sourceMimeType === 'string' ? body.sourceMimeType : null,
      isCurrent: body.isCurrent === true,
      sourceIds: jsonText(Array.isArray(body.sourceIds) ? body.sourceIds : []),
      targetJob: jsonText(body.targetJob),
      version: typeof body.version === 'number' && body.version >= 1 ? Math.floor(body.version) : 1,
    };
    const rows = id
      ? await sql`
        INSERT INTO resumes (id, user_id, name, type, resume, original_text, file_name, file_data, file_mime, is_current, source_ids, target_job, version)
        VALUES (${id}, ${userId}, ${values.name}, ${values.type}, ${values.resume}::jsonb, ${values.originalText}, ${values.fileName}, ${values.fileData}, ${values.fileMime}, ${values.isCurrent}, ${values.sourceIds}::jsonb, ${values.targetJob}::jsonb, ${values.version})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, resume = EXCLUDED.resume, original_text = EXCLUDED.original_text, file_name = EXCLUDED.file_name, file_data = EXCLUDED.file_data, file_mime = EXCLUDED.file_mime, is_current = EXCLUDED.is_current, source_ids = EXCLUDED.source_ids, target_job = EXCLUDED.target_job, version = EXCLUDED.version
        WHERE resumes.user_id = ${userId}
        RETURNING *
      `
      : await sql`
        INSERT INTO resumes (user_id, name, type, resume, original_text, file_name, file_data, file_mime, is_current, source_ids, target_job, version)
        VALUES (${userId}, ${values.name}, ${values.type}, ${values.resume}::jsonb, ${values.originalText}, ${values.fileName}, ${values.fileData}, ${values.fileMime}, ${values.isCurrent}, ${values.sourceIds}::jsonb, ${values.targetJob}::jsonb, ${values.version})
        RETURNING *
      `;
    res.status(201).json({ resume: mapResume(rows[0]) });
  } catch (error) {
    console.error('[Data resume create]', error);
    res.status(500).json({ error: '保存简历失败' });
  }
});

router.patch('/resumes/:id', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  const id = resourceId(req, res);
  if (!id) return;
  const body = bodyObject(req);
  try {
    const sql = getSql();
    if (body.isCurrent === true) {
      await sql`UPDATE resumes SET is_current = false WHERE user_id = ${userId} AND type = 'original'`;
    }
    const rows = await sql`
      UPDATE resumes SET
        name = COALESCE(${typeof body.name === 'string' ? body.name.trim() : null}, name),
        resume = COALESCE(${jsonText(body.resume)}::jsonb, resume),
        version = COALESCE(${typeof body.version === 'number' && body.version >= 1 ? Math.floor(body.version) : null}, version),
        is_current = COALESCE(${typeof body.isCurrent === 'boolean' ? body.isCurrent : null}, is_current)
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *
    `;
    if (!rows.length) {
      res.status(404).json({ error: '简历不存在' });
      return;
    }
    res.json({ resume: mapResume(rows[0]) });
  } catch (error) {
    console.error('[Data resume update]', error);
    res.status(500).json({ error: '更新简历失败' });
  }
});

router.delete('/resumes/:id', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  const id = resourceId(req, res);
  if (!id) return;
  try {
    const sql = getSql();
    await sql`DELETE FROM resumes WHERE id = ${id} AND user_id = ${userId}`;
    res.status(204).end();
  } catch (error) {
    console.error('[Data resume delete]', error);
    res.status(500).json({ error: '删除简历失败' });
  }
});

router.get('/jobs', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  try {
    const sql = getSql();
    const rows = await sql`SELECT * FROM jobs WHERE user_id = ${userId} ORDER BY saved_at DESC`;
    res.json({ jobs: rows.map(mapJob) });
  } catch (error) {
    console.error('[Data jobs list]', error);
    res.status(500).json({ error: '读取岗位失败' });
  }
});

router.post('/jobs', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  const body = bodyObject(req);
  if (!body.jd || !body.matchResult) {
    res.status(400).json({ error: '岗位数据不完整' });
    return;
  }
  try {
    const sql = getSql();
    const id = typeof body.id === 'string' && uuidPattern.test(body.id) ? body.id : null;
    const values = {
      sequenceNumber: typeof body.sequenceNumber === 'number' ? body.sequenceNumber : null,
      jobName: typeof body.jobName === 'string' ? body.jobName : null,
      company: typeof body.company === 'string' ? body.company : null,
      intendedPosition: typeof body.intendedPosition === 'string' ? body.intendedPosition : null,
      matchScore: typeof body.matchScore === 'number' ? body.matchScore : null,
      status: typeof body.status === 'string' ? body.status : 'analyzed',
      jd: jsonText(body.jd),
      matchResult: jsonText(body.matchResult),
      resumeSnapshot: jsonText(body.resumeSnapshot),
      generatedResume: jsonText(body.generatedResume),
      supplementedGaps: jsonText(Array.isArray(body.supplementedGaps) ? body.supplementedGaps : []),
      sourceResumeIds: jsonText(Array.isArray(body.sourceResumeIds) ? body.sourceResumeIds : []),
      analyzedResumeId: typeof body.analyzedResumeId === 'string' && uuidPattern.test(body.analyzedResumeId) ? body.analyzedResumeId : null,
      analyzedResumeVersion: typeof body.analyzedResumeVersion === 'number' ? Math.floor(body.analyzedResumeVersion) : null,
      scoringVersion: typeof body.scoringVersion === 'string' ? body.scoringVersion : null,
      inputHash: typeof body.inputHash === 'string' ? body.inputHash : null,
      savedAt: typeof body.savedAt === 'string' ? body.savedAt : null,
      analyzedAt: typeof body.analyzedAt === 'string' ? body.analyzedAt : null,
    };
    const rows = id
      ? await sql`
        INSERT INTO jobs (id, user_id, sequence_number, job_name, company, intended_position, match_score, status, jd, match_result, resume_snapshot, generated_resume, supplemented_gaps, source_resume_ids, analyzed_resume_id, analyzed_resume_version, scoring_version, input_hash, saved_at, analyzed_at)
        VALUES (${id}, ${userId}, ${values.sequenceNumber}, ${values.jobName}, ${values.company}, ${values.intendedPosition}, ${values.matchScore}, ${values.status}, ${values.jd}::jsonb, ${values.matchResult}::jsonb, ${values.resumeSnapshot}::jsonb, ${values.generatedResume}::jsonb, ${values.supplementedGaps}::jsonb, ${values.sourceResumeIds}::jsonb, ${values.analyzedResumeId}, ${values.analyzedResumeVersion}, ${values.scoringVersion}, ${values.inputHash}, COALESCE(${values.savedAt}::timestamptz, now()), ${values.analyzedAt}::timestamptz)
        ON CONFLICT (id) DO UPDATE SET sequence_number = EXCLUDED.sequence_number, job_name = EXCLUDED.job_name, company = EXCLUDED.company, intended_position = EXCLUDED.intended_position, match_score = EXCLUDED.match_score, status = EXCLUDED.status, jd = EXCLUDED.jd, match_result = EXCLUDED.match_result, resume_snapshot = EXCLUDED.resume_snapshot, generated_resume = EXCLUDED.generated_resume, supplemented_gaps = EXCLUDED.supplemented_gaps, source_resume_ids = EXCLUDED.source_resume_ids, analyzed_resume_id = EXCLUDED.analyzed_resume_id, analyzed_resume_version = EXCLUDED.analyzed_resume_version, scoring_version = EXCLUDED.scoring_version, input_hash = EXCLUDED.input_hash, saved_at = EXCLUDED.saved_at, analyzed_at = EXCLUDED.analyzed_at, updated_at = now()
        WHERE jobs.user_id = ${userId}
        RETURNING *
      `
      : await sql`
        INSERT INTO jobs (user_id, sequence_number, job_name, company, intended_position, match_score, status, jd, match_result, resume_snapshot, generated_resume, supplemented_gaps, source_resume_ids, analyzed_resume_id, analyzed_resume_version, scoring_version, input_hash, saved_at, analyzed_at)
        VALUES (${userId}, ${values.sequenceNumber}, ${values.jobName}, ${values.company}, ${values.intendedPosition}, ${values.matchScore}, ${values.status}, ${values.jd}::jsonb, ${values.matchResult}::jsonb, ${values.resumeSnapshot}::jsonb, ${values.generatedResume}::jsonb, ${values.supplementedGaps}::jsonb, ${values.sourceResumeIds}::jsonb, ${values.analyzedResumeId}, ${values.analyzedResumeVersion}, ${values.scoringVersion}, ${values.inputHash}, COALESCE(${values.savedAt}::timestamptz, now()), ${values.analyzedAt}::timestamptz)
        RETURNING *
      `;
    res.status(201).json({ job: mapJob(rows[0]) });
  } catch (error) {
    console.error('[Data job create]', error);
    res.status(500).json({ error: '保存岗位失败' });
  }
});

router.patch('/jobs/:id', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  const id = resourceId(req, res);
  if (!id) return;
  const body = bodyObject(req);
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE jobs SET
        sequence_number = COALESCE(${typeof body.sequenceNumber === 'number' ? body.sequenceNumber : null}, sequence_number),
        job_name = COALESCE(${typeof body.jobName === 'string' ? body.jobName : null}, job_name),
        company = COALESCE(${typeof body.company === 'string' ? body.company : null}, company),
        intended_position = COALESCE(${typeof body.intendedPosition === 'string' ? body.intendedPosition : null}, intended_position),
        match_score = COALESCE(${typeof body.matchScore === 'number' ? body.matchScore : null}, match_score),
        status = COALESCE(${typeof body.status === 'string' ? body.status : null}, status),
        jd = COALESCE(${jsonText(body.jd)}::jsonb, jd),
        match_result = COALESCE(${jsonText(body.matchResult)}::jsonb, match_result),
        resume_snapshot = COALESCE(${jsonText(body.resumeSnapshot)}::jsonb, resume_snapshot),
        generated_resume = COALESCE(${jsonText(body.generatedResume)}::jsonb, generated_resume),
        supplemented_gaps = COALESCE(${jsonText(body.supplementedGaps)}::jsonb, supplemented_gaps),
        source_resume_ids = COALESCE(${jsonText(body.sourceResumeIds)}::jsonb, source_resume_ids),
        analyzed_resume_id = COALESCE(${typeof body.analyzedResumeId === 'string' && uuidPattern.test(body.analyzedResumeId) ? body.analyzedResumeId : null}::uuid, analyzed_resume_id),
        analyzed_resume_version = COALESCE(${typeof body.analyzedResumeVersion === 'number' ? Math.floor(body.analyzedResumeVersion) : null}, analyzed_resume_version),
        scoring_version = COALESCE(${typeof body.scoringVersion === 'string' ? body.scoringVersion : null}, scoring_version),
        input_hash = COALESCE(${typeof body.inputHash === 'string' ? body.inputHash : null}, input_hash),
        updated_at = now()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *
    `;
    if (!rows.length) {
      res.status(404).json({ error: '岗位不存在' });
      return;
    }
    res.json({ job: mapJob(rows[0]) });
  } catch (error) {
    console.error('[Data job update]', error);
    res.status(500).json({ error: '更新岗位失败' });
  }
});

router.delete('/jobs/:id', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  const id = resourceId(req, res);
  if (!id) return;
  try {
    const sql = getSql();
    await sql`DELETE FROM jobs WHERE id = ${id} AND user_id = ${userId}`;
    res.status(204).end();
  } catch (error) {
    console.error('[Data job delete]', error);
    res.status(500).json({ error: '删除岗位失败' });
  }
});

router.get('/preparations',async(req,res)=>{const userId=currentUser(req,res);if(!userId)return;try{const sql=getSql();const rows=await sql`SELECT p.*,pub.slug AS public_slug,pub.status AS public_status,pub.published_at FROM job_preparations p LEFT JOIN published_portfolios pub ON pub.preparation_id=p.id WHERE p.user_id=${userId} ORDER BY p.updated_at DESC`;res.json({preparations:rows.map(mapPreparation)});}catch(error){console.error(error);res.status(500).json({error:'读取求职准备失败'});}});

router.post('/preparations',async(req,res)=>{const userId=currentUser(req,res);if(!userId)return;const body=bodyObject(req);if(!['targeted','general'].includes(body.mode)||typeof body.name!=='string'||typeof body.careerDirection!=='string'||!body.sourceResumeSnapshot||!body.document){res.status(400).json({error:'求职准备数据不完整'});return;}let document;let themeId;try{document=validatePortfolioDocument(body.document);themeId=validateThemeId(body.themeId||'clean-professional');}catch(error){res.status(400).json({error:error instanceof Error?error.message:'求职主页数据无效'});return;}try{const sql=getSql();const sourceJobId=typeof body.sourceJobId==='string'&&uuidPattern.test(body.sourceJobId)?body.sourceJobId:null;const sourceResumeId=typeof body.sourceResumeId==='string'&&uuidPattern.test(body.sourceResumeId)?body.sourceResumeId:null;const [row]=await sql`INSERT INTO job_preparations (user_id,mode,name,career_direction,source_job_id,source_resume_id,source_resume_version,source_resume_snapshot,job_snapshot,match_result_snapshot,document,content_suggestions,theme_id,theme_config,status) VALUES (${userId},${body.mode},${body.name.trim()},${body.careerDirection.trim()},${sourceJobId},${sourceResumeId},${typeof body.sourceResumeVersion==='number'?Math.floor(body.sourceResumeVersion):null},${jsonText(body.sourceResumeSnapshot)}::jsonb,${jsonText(body.jobSnapshot)}::jsonb,${jsonText(body.matchResultSnapshot)}::jsonb,${jsonText(document)}::jsonb,${jsonText(body.contentSuggestions||[])}::jsonb,${themeId},${jsonText(body.themeConfig||{})}::jsonb,'draft') RETURNING *`;res.status(201).json({preparation:mapPreparation(row)});}catch(error){console.error(error);res.status(500).json({error:'保存求职准备失败'});}});

router.get('/preparations/:id',async(req,res)=>{const userId=currentUser(req,res);if(!userId)return;const id=resourceId(req,res);if(!id)return;try{const sql=getSql();const [row]=await sql`SELECT p.*,pub.slug AS public_slug,pub.status AS public_status,pub.published_at FROM job_preparations p LEFT JOIN published_portfolios pub ON pub.preparation_id=p.id WHERE p.id=${id} AND p.user_id=${userId}`;if(!row){res.status(404).json({error:'求职准备不存在'});return;}res.json({preparation:mapPreparation(row)});}catch{res.status(500).json({error:'读取求职准备失败'});}});

router.patch('/preparations/:id',async(req,res)=>{const userId=currentUser(req,res);if(!userId)return;const id=resourceId(req,res);if(!id)return;const body=bodyObject(req);if(typeof body.baseRevision!=='number'){res.status(400).json({error:'缺少草稿版本'});return;}let document:string|null=null;let themeId:string|null=null;try{if(body.document)document=jsonText(validatePortfolioDocument(body.document));if(body.themeId!==undefined)themeId=validateThemeId(body.themeId);}catch(error){res.status(400).json({error:error instanceof Error?error.message:'求职主页数据无效'});return;}try{const sql=getSql();const [row]=await sql`UPDATE job_preparations SET name=COALESCE(${typeof body.name==='string'?body.name.trim():null},name),career_direction=COALESCE(${typeof body.careerDirection==='string'?body.careerDirection.trim():null},career_direction),document=COALESCE(${document}::jsonb,document),content_suggestions=COALESCE(${jsonText(body.contentSuggestions)}::jsonb,content_suggestions),theme_id=COALESCE(${themeId},theme_id),theme_config=COALESCE(${jsonText(body.themeConfig)}::jsonb,theme_config),status=COALESCE(${typeof body.status==='string'?body.status:null},status),revision=revision+1,updated_at=now() WHERE id=${id} AND user_id=${userId} AND revision=${Math.floor(body.baseRevision)} RETURNING *`;if(!row){res.status(409).json({error:'草稿已在其他页面更新，请选择要保留的版本'});return;}res.json({preparation:mapPreparation(row)});}catch(error){console.error(error);res.status(500).json({error:'保存求职准备失败'});}});

router.delete('/preparations/:id',async(req,res)=>{const userId=currentUser(req,res);if(!userId)return;const id=resourceId(req,res);if(!id)return;try{const sql=getSql();await sql`DELETE FROM job_preparations WHERE id=${id} AND user_id=${userId}`;res.status(204).end();}catch{res.status(500).json({error:'删除求职准备失败'});}});

router.get('/preparations/:id/interview',async(req,res)=>{const userId=currentUser(req,res);if(!userId)return;const id=resourceId(req,res);if(!id)return;try{const sql=getSql();const [row]=await sql`SELECT * FROM interview_kits WHERE preparation_id=${id} AND user_id=${userId}`;res.json({interviewKit:row?{preparationId:row.preparation_id,questions:row.questions||[],generationBasisHash:row.generation_basis_hash,createdAt:row.created_at,updatedAt:row.updated_at}:null});}catch{res.status(500).json({error:'读取面试准备失败'});}});

router.put('/preparations/:id/interview',async(req,res)=>{const userId=currentUser(req,res);if(!userId)return;const id=resourceId(req,res);if(!id)return;const body=bodyObject(req);let questions;try{questions=validateInterviewQuestions(body.questions||[]);}catch(error){res.status(400).json({error:error instanceof Error?error.message:'面试问题数据无效'});return;}try{const sql=getSql();const [owned]=await sql`SELECT id FROM job_preparations WHERE id=${id} AND user_id=${userId}`;if(!owned){res.status(404).json({error:'求职准备不存在'});return;}const [row]=await sql`INSERT INTO interview_kits (preparation_id,user_id,questions,generation_basis_hash) VALUES (${id},${userId},${jsonText(questions)}::jsonb,${typeof body.generationBasisHash==='string'?body.generationBasisHash.slice(0,200):''}) ON CONFLICT (preparation_id) DO UPDATE SET questions=EXCLUDED.questions,generation_basis_hash=EXCLUDED.generation_basis_hash,updated_at=now() WHERE interview_kits.user_id=${userId} RETURNING *`;res.json({interviewKit:{preparationId:row.preparation_id,questions:row.questions||[],generationBasisHash:row.generation_basis_hash,createdAt:row.created_at,updatedAt:row.updated_at}});}catch{res.status(500).json({error:'保存面试准备失败'});}});

const slugAlphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const makeSlug=()=>Array.from(crypto.randomBytes(16),byte=>slugAlphabet[byte%slugAlphabet.length]).join('');
const safeUrl=(value:unknown)=>{if(typeof value!=='string'||!(/^(https?:\/\/|mailto:|tel:)/i.test(value)))return '';try{const url=new URL(value);return ['http:','https:','mailto:','tel:'].includes(url.protocol)?value:'';}catch{return '';}};
const stripSourceReferences=(value:any):any=>Array.isArray(value)?value.map(stripSourceReferences):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['sourceId','sourceRefs','sourceReference'].includes(key)).map(([key,item])=>[key,stripSourceReferences(item)])):value;
const makePublicDocument=(value:any)=>{const document=stripSourceReferences(JSON.parse(JSON.stringify(value||{})));document.contacts=Array.isArray(document.contacts)?document.contacts.filter((item:any)=>{if(item?.public!==true||typeof item.value!=='string'||!item.value.trim())return false;if(['website','github','linkedin'].includes(item.kind))return /^https?:\/\//i.test(item.value);if(item.kind==='email')return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item.value);return true;}):[];if(document.primaryAction?.href)document.primaryAction.href=safeUrl(document.primaryAction.href);if(document.primaryAction?.contactId&&!document.contacts.some((item:any)=>item.id===document.primaryAction.contactId))document.primaryAction={label:'联系我'};return document;};

router.post('/preparations/:id/publish',async(req,res)=>{const userId=currentUser(req,res);if(!userId)return;const id=resourceId(req,res);if(!id)return;try{const sql=getSql();const [prep]=await sql`SELECT * FROM job_preparations WHERE id=${id} AND user_id=${userId}`;if(!prep){res.status(404).json({error:'求职准备不存在'});return;}const document=makePublicDocument(prep.document);if(!document.contacts.length&&!safeUrl(document.primaryAction?.href)){res.status(400).json({error:'发布前请至少公开一种联系方式或配置一个有效行动按钮'});return;}const [existing]=await sql`SELECT slug FROM published_portfolios WHERE preparation_id=${id}`;let slug=existing?.slug;for(let tries=0;!slug&&tries<5;tries+=1){const candidate=makeSlug();const found=await sql`SELECT slug FROM published_portfolios WHERE slug=${candidate}`;if(!found.length)slug=candidate;}if(!slug)throw new Error('slug');const [row]=await sql`INSERT INTO published_portfolios (preparation_id,user_id,slug,published_document,theme_id,theme_config,status,noindex) VALUES (${id},${userId},${slug},${jsonText(document)}::jsonb,${prep.theme_id},${jsonText(prep.theme_config||{})}::jsonb,'published',true) ON CONFLICT (preparation_id) DO UPDATE SET published_document=EXCLUDED.published_document,theme_id=EXCLUDED.theme_id,theme_config=EXCLUDED.theme_config,status='published',published_at=now(),updated_at=now() RETURNING *`;await sql`UPDATE job_preparations SET status='published',updated_at=now() WHERE id=${id}`;res.json({slug:row.slug,status:row.status,publishedAt:row.published_at});}catch(error){console.error(error);res.status(500).json({error:'发布失败，请重试'});}});

router.post('/preparations/:id/unpublish',async(req,res)=>{const userId=currentUser(req,res);if(!userId)return;const id=resourceId(req,res);if(!id)return;try{const sql=getSql();await sql`UPDATE published_portfolios SET status='unpublished',updated_at=now() WHERE preparation_id=${id} AND user_id=${userId}`;await sql`UPDATE job_preparations SET status='draft',updated_at=now() WHERE id=${id} AND user_id=${userId}`;res.status(204).end();}catch{res.status(500).json({error:'下线失败，请重试'});}});

router.get('/draft', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  try {
    const sql = getSql();
    const [row] = await sql`SELECT user_id, data, updated_at FROM workflow_drafts WHERE user_id = ${userId}`;
    res.json({ draft: row ? { id: row.user_id, updatedAt: row.updated_at, data: row.data } : null });
  } catch (error) {
    console.error('[Data draft get]', error);
    res.status(500).json({ error: '读取流程草稿失败' });
  }
});

router.put('/draft', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  const body = bodyObject(req);
  if (!body.data) {
    res.status(400).json({ error: '草稿数据不能为空' });
    return;
  }
  const clientUpdatedAt = typeof body.updatedAt === 'string' && !Number.isNaN(Date.parse(body.updatedAt)) ? body.updatedAt : null;
  if (!clientUpdatedAt) {
    res.status(400).json({ error: '草稿更新时间无效，请刷新页面后重试' });
    return;
  }
  try {
    const sql = getSql();
    const [row] = await sql`
      INSERT INTO workflow_drafts (user_id, data, client_updated_at, updated_at)
      VALUES (${userId}, ${jsonText(body.data)}::jsonb, ${clientUpdatedAt}::timestamptz, now())
      ON CONFLICT (user_id) DO UPDATE SET
        data = EXCLUDED.data,
        client_updated_at = EXCLUDED.client_updated_at,
        updated_at = now()
      RETURNING user_id, data, updated_at
    `;
    if (!row) {
      res.status(409).json({ error: '该草稿早于最近一次放弃操作，已忽略旧数据' });
      return;
    }
    res.json({ draft: { id: row.user_id, updatedAt: row.updated_at, data: row.data } });
  } catch (error) {
    console.error('[Data draft put]', error);
    res.status(500).json({ error: '保存流程草稿失败' });
  }
});

router.delete('/draft', async (req, res) => {
  const userId = currentUser(req, res);
  if (!userId) return;
  try {
    const sql = getSql();
    await sql`
      WITH marked AS (
        INSERT INTO workflow_draft_tombstones (user_id, deleted_at)
        VALUES (${userId}, now())
        ON CONFLICT (user_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at
        RETURNING user_id
      )
      DELETE FROM workflow_drafts
      WHERE user_id = (SELECT user_id FROM marked)
    `;
    res.status(204).end();
  } catch (error) {
    console.error('[Data draft delete]', error);
    res.status(500).json({ error: '删除流程草稿失败' });
  }
});

export default router;
