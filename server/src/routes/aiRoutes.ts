import { Router } from 'express';
import { upload } from '../services/fileService';
import {
  handleTestApiKey,
  handleParseResume,
  handleParseJobDescription,
  handleAnalyzeMatch,
  handleGenerateFollowUpQuestion,
  handleFormatFollowUpExperience,
  handleGenerateResume,
} from '../controllers/aiController';
import { handleAnalyzeMatchV2 } from '../controllers/matchControllerV2';

const router = Router();

// 测试 API Key
router.post('/test-key', handleTestApiKey);

// 解析简历（支持文件上传或文本输入）
router.post('/parse-resume', upload.single('file'), handleParseResume);

// 解析岗位描述
router.post('/parse-jd', handleParseJobDescription);

// 现有页面继续使用 radar-v1；radar-v2 通过独立入口验收。
router.post('/analyze-match', handleAnalyzeMatch);
router.post('/analyze-match-v2', handleAnalyzeMatchV2);

// 补录引导 - 生成引导问题
router.post('/followup/question', handleGenerateFollowUpQuestion);

// 补录引导 - 格式化用户经历
router.post('/followup/format', handleFormatFollowUpExperience);

// 生成定制简历
router.post('/generate-resume', handleGenerateResume);

export default router;
