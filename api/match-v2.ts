import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ParsedJobDescription, ParsedResume } from '../server/src/types';
import { analyzeMatchV2, matchAnalysisErrorResponse } from '../server/src/services/matchAnalysisV2';
import { resolveApiKey } from './_lib/apiKey';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const apiKey = await resolveApiKey(req);
    const source = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body as Record<string, unknown>
      : {};
    const result = await analyzeMatchV2(
      apiKey,
      source.resume as ParsedResume,
      source.jobDescription as ParsedJobDescription,
    );
    res.json(result);
  } catch (error) {
    const failure = matchAnalysisErrorResponse(error);
    res.status(failure.status).json({ error: failure.message, code: failure.code });
  }
}
