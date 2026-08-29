import type { VercelRequest, VercelResponse } from '@vercel/node';
import { allowMethods, bodyObject } from '../_lib/http';
import { currentUser, jsonValue, mapJob, mapResume, requireId, sql } from '../_lib/data';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  const parts = Array.isArray(req.query.path) ? req.query.path : typeof req.query.path === 'string' ? req.query.path.split('/') : [];
  const [resource, id] = parts;
  if (resource === 'draft') return draft(req, res);
  if (resource === 'resumes') return id ? resumeItem(req, res, id) : resumes(req, res);
  if (resource === 'jobs') return id ? jobItem(req, res, id) : jobs(req, res);
  res.status(404).json({ error: '数据接口不存在' });
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
    const values = [body.name.trim(), body.type, jsonValue(body.resume, {}), body.originalText || null, body.fileName || null, body.sourceFileData || null, body.sourceMimeType || null, body.isCurrent === true, jsonValue(body.sourceIds, []), body.targetJob == null ? null : jsonValue(body.targetJob, null)];
    const [row] = id
      ? await sql`INSERT INTO resumes (id,user_id,name,type,resume,original_text,file_name,file_data,file_mime,is_current,source_ids,target_job) VALUES (${id},${userId},${values[0]},${values[1]},${values[2]}::jsonb,${values[3]},${values[4]},${values[5]},${values[6]},${values[7]},${values[8]}::jsonb,${values[9]}::jsonb) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,type=EXCLUDED.type,resume=EXCLUDED.resume,original_text=EXCLUDED.original_text,file_name=EXCLUDED.file_name,file_data=EXCLUDED.file_data,file_mime=EXCLUDED.file_mime,is_current=EXCLUDED.is_current,source_ids=EXCLUDED.source_ids,target_job=EXCLUDED.target_job WHERE resumes.user_id=${userId} RETURNING *`
      : await sql`INSERT INTO resumes (user_id,name,type,resume,original_text,file_name,file_data,file_mime,is_current,source_ids,target_job) VALUES (${userId},${values[0]},${values[1]},${values[2]}::jsonb,${values[3]},${values[4]},${values[5]},${values[6]},${values[7]},${values[8]}::jsonb,${values[9]}::jsonb) RETURNING *`;
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
      const [row] = await sql`UPDATE resumes SET resume=${jsonValue(body.resume,{})}::jsonb WHERE id=${identity.id} AND user_id=${identity.userId} RETURNING *`;
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
    const values = [body.sequenceNumber ?? null, body.jobName || null, body.company || null, body.intendedPosition || null, body.matchScore ?? null, body.status || 'analyzed', jsonValue(body.jd, {}), jsonValue(body.matchResult, {}), body.resumeSnapshot == null ? null : jsonValue(body.resumeSnapshot, null), body.generatedResume == null ? null : jsonValue(body.generatedResume, null), jsonValue(body.supplementedGaps, []), jsonValue(body.sourceResumeIds, []), body.savedAt || null, body.analyzedAt || null, body.createdAt || null, body.updatedAt || null];
    const [row] = id ? await sql`INSERT INTO jobs (id,user_id,sequence_number,job_name,company,intended_position,match_score,status,jd,match_result,resume_snapshot,generated_resume,supplemented_gaps,source_resume_ids,saved_at,analyzed_at,created_at,updated_at) VALUES (${id},${userId},${values[0]},${values[1]},${values[2]},${values[3]},${values[4]},${values[5]},${values[6]}::jsonb,${values[7]}::jsonb,${values[8]}::jsonb,${values[9]}::jsonb,${values[10]}::jsonb,${values[11]}::jsonb,COALESCE(${values[12]},now()),${values[13]},COALESCE(${values[14]},now()),COALESCE(${values[15]},now())) ON CONFLICT (id) DO UPDATE SET sequence_number=EXCLUDED.sequence_number,job_name=EXCLUDED.job_name,company=EXCLUDED.company,intended_position=EXCLUDED.intended_position,match_score=EXCLUDED.match_score,status=EXCLUDED.status,jd=EXCLUDED.jd,match_result=EXCLUDED.match_result,resume_snapshot=EXCLUDED.resume_snapshot,generated_resume=EXCLUDED.generated_resume,supplemented_gaps=EXCLUDED.supplemented_gaps,source_resume_ids=EXCLUDED.source_resume_ids,saved_at=EXCLUDED.saved_at,analyzed_at=EXCLUDED.analyzed_at,updated_at=now() WHERE jobs.user_id=${userId} RETURNING *` : await sql`INSERT INTO jobs (user_id,sequence_number,job_name,company,intended_position,match_score,status,jd,match_result,resume_snapshot,generated_resume,supplemented_gaps,source_resume_ids,saved_at,analyzed_at,created_at,updated_at) VALUES (${userId},${values[0]},${values[1]},${values[2]},${values[3]},${values[4]},${values[5]},${values[6]}::jsonb,${values[7]}::jsonb,${values[8]}::jsonb,${values[9]}::jsonb,${values[10]}::jsonb,${values[11]}::jsonb,COALESCE(${values[12]},now()),${values[13]},COALESCE(${values[14]},now()),COALESCE(${values[15]},now())) RETURNING *`;
    res.status(201).json({ job: mapJob(row) });
  } catch { res.status(500).json({ error: '保存岗位失败' }); }
}

async function jobItem(req: VercelRequest, res: VercelResponse, id: string) {
  req.query.id = id; if (!allowMethods(req, res, ['PATCH', 'DELETE'])) return;
  const identity = requireId(req, res); if (!identity) return;
  try {
    if (req.method === 'DELETE') { await sql`DELETE FROM jobs WHERE id=${identity.id} AND user_id=${identity.userId}`; res.status(204).end(); return; }
    const body = bodyObject(req);
    const [row] = await sql`UPDATE jobs SET status=COALESCE(${body.status ?? null},status),job_name=COALESCE(${body.jobName ?? null},job_name),company=COALESCE(${body.company ?? null},company),intended_position=COALESCE(${body.intendedPosition ?? null},intended_position),match_score=COALESCE(${body.matchScore ?? null},match_score),jd=COALESCE(${body.jd ? jsonValue(body.jd,{}) : null}::jsonb,jd),match_result=COALESCE(${body.matchResult ? jsonValue(body.matchResult,{}) : null}::jsonb,match_result),resume_snapshot=COALESCE(${body.resumeSnapshot ? jsonValue(body.resumeSnapshot,{}) : null}::jsonb,resume_snapshot),generated_resume=COALESCE(${body.generatedResume ? jsonValue(body.generatedResume,{}) : null}::jsonb,generated_resume),supplemented_gaps=COALESCE(${body.supplementedGaps ? jsonValue(body.supplementedGaps,[]) : null}::jsonb,supplemented_gaps),source_resume_ids=COALESCE(${body.sourceResumeIds ? jsonValue(body.sourceResumeIds,[]) : null}::jsonb,source_resume_ids),updated_at=now() WHERE id=${identity.id} AND user_id=${identity.userId} RETURNING *`;
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
