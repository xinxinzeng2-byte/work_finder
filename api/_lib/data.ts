import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserId } from './auth';
import { sql } from './db';

export function jsonValue(value: unknown, fallback: unknown): string {
  return JSON.stringify(value ?? fallback);
}

export function requireId(req: VercelRequest, res: VercelResponse): { userId: string; id: string } | null {
  try {
    const userId = getUserId(req);
    const id = req.query.id;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ error: '无效的数据 ID' });
      return null;
    }
    return { userId, id };
  } catch {
    res.status(401).json({ error: '未登录或登录已过期' });
    return null;
  }
}

export async function currentUser(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  try { return getUserId(req); }
  catch { res.status(401).json({ error: '未登录或登录已过期' }); return null; }
}

export function mapResume(row: Record<string, unknown>) {
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
    uploadedAt: row.uploaded_at,
  };
}

export function mapJob(row: Record<string, unknown>) {
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
    savedAt: row.saved_at,
    analyzedAt: row.analyzed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export { sql };
