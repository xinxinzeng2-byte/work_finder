import type { VercelRequest, VercelResponse } from '@vercel/node';
import { executeMatchV2 } from '../server/src/controllers/matchControllerV2';
import { matchAnalysisErrorResponse } from '../server/src/services/matchAnalysisV2';
import { resolveApiKey } from './_lib/apiKey';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const apiKey = await resolveApiKey(req);
    const result = await executeMatchV2(apiKey, req.body);
    res.json(result);
  } catch (error) {
    const failure = matchAnalysisErrorResponse(error);
    res.status(failure.status).json({ error: failure.message, code: failure.code });
  }
}
