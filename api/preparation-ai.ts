import type { VercelRequest,VercelResponse } from '@vercel/node';
import { resolveApiKey } from './_lib/apiKey';
import { getUserId } from './_lib/auth';
import { generatePortfolioDocument,generatePortfolioInterview,optimizePortfolioBlock,proposePortfolioSupplement } from '../server/src/services/deepseekService';

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='POST'){res.status(405).json({error:'Method Not Allowed'});return;}
  try{
    if(!req.headers['x-deepseek-key']){try{getUserId(req);}catch{res.status(401).json({error:'未登录或登录已过期'});return;}}
    const key=await resolveApiKey(req);if(!key){res.status(400).json({error:'未配置 DeepSeek API Key'});return;}
    const body=req.body||{};const action=Array.isArray(req.query.action)?req.query.action[0]:req.query.action;
    if(action==='generate'){if(!body.resume||!body.direction){res.status(400).json({error:'缺少简历或求职方向'});return;}res.json({document:await generatePortfolioDocument(key,body.resume,body.direction,body.jobDescription,body.matchResult)});return;}
    if(action==='optimize'){res.json(await optimizePortfolioBlock(key,body.block,body.direction,body.instruction||'让表达更清晰、更有说服力',body.resume));return;}
    if(action==='suggest'){if(!body.userFacts){res.status(400).json({error:'请先填写真实经历'});return;}res.json(await proposePortfolioSupplement(key,body.block,body.direction,body.suggestion||'',body.userFacts));return;}
    if(action==='interview'){res.json({questions:await generatePortfolioInterview(key,body.direction,body.document,body.jobDescription,body.matchResult)});return;}
    res.status(404).json({error:'AI 接口不存在'});
  }catch(error){res.status(500).json({error:`AI 处理失败: ${error instanceof Error?error.message:String(error)}`});}
}
