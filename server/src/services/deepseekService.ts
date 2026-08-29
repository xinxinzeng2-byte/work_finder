import type {
  DeepSeekRequest,
  DeepSeekMessage,
  ParsedResume,
  ParsedJobDescription,
  MatchResult,
  GeneratedResume,
  AtomicExperience,
  AtomicSkill,
  JobRequirement,
  MatchItem,
} from '../types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

/**
 * 调用 DeepSeek API
 */
async function callDeepSeek(
  apiKey: string,
  messages: DeepSeekMessage[],
  options?: { temperature?: number; jsonMode?: boolean }
): Promise<string> {
  const body: DeepSeekRequest = {
    model: MODEL,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: 4096,
  };

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API 调用失败 (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || '';
}

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// 功能 1：简历原子化解析
// ============================================================

/**
 * 将简历文本解析为原子能力和原子经历
 */
export async function parseResume(
  apiKey: string,
  resumeText: string,
  fileName?: string
): Promise<ParsedResume> {
  const systemPrompt = `你是一个专业的简历分析师。你的任务是将简历内容拆解为"原子能力"和"原子经历"。

原子能力：简历中体现的最小能力单元，如"数据分析"、"项目管理"、"用户调研"等。
原子经历：简历中每段工作/项目经历，提炼出关键成就。

规则：
1. 能力要拆得足够细，不要笼统说"能力强"
2. 每个能力要标注来源（哪段经历证明了这个能力）
3. 经历要提炼关键成就，用大白话描述，保留具体数字和事实
4. 公司、职位、时间、数字等硬性事实必须如实保留，不得修改或编造
5. 输出必须是合法 JSON`;

  const userPrompt = `请分析以下简历内容${fileName ? `（来自文件：${fileName}）` : ''}，拆解为原子能力和原子经历。

简历内容：
---
${resumeText}
---

请输出以下 JSON 格式（严格遵循，不要输出其他内容）：
{
  "skills": [
    {
      "category": "能力分类（如：技术/管理/沟通/行业知识/工具）",
      "name": "能力名称",
      "level": "熟练度（了解/熟悉/精通）",
      "evidence": "这个能力从哪段经历体现出来的"
    }
  ],
  "experiences": [
    {
      "company": "公司名",
      "role": "职位",
      "period": "时间段",
      "achievements": ["关键成就1（带数字）", "关键成就2"],
      "rawText": "这段经历的原始描述"
    }
  ],
  "basicInfo": {
    "name": "姓名（如有）",
    "phone": "电话（如有）",
    "email": "邮箱（如有）",
    "education": "最高学历（如有）",
    "yearsOfExperience": 工作年限数字（如有，否则为0）,
    "city": "期望城市或当前城市（如有）"
  }
}`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.2, jsonMode: true }
  );

  try {
    const parsed = JSON.parse(content);
    // 补充 ID
    const skills: AtomicSkill[] = (Array.isArray(parsed.skills) ? parsed.skills : []).map((s: Omit<AtomicSkill, 'id'>) => ({
      category: typeof s.category === 'string' ? s.category : '',
      name: typeof s.name === 'string' ? s.name : '',
      level: typeof s.level === 'string' ? s.level : '',
      evidence: typeof s.evidence === 'string' ? s.evidence : '',
      id: generateId('skill'),
    }));
    const experiences: AtomicExperience[] = (Array.isArray(parsed.experiences) ? parsed.experiences : []).map(
      (e: Omit<AtomicExperience, 'id' | 'skillsUsed'>) => ({
        company: typeof e.company === 'string' ? e.company : '',
        role: typeof e.role === 'string' ? e.role : '',
        period: typeof e.period === 'string' ? e.period : '',
        achievements: Array.isArray(e.achievements) ? e.achievements.filter((item): item is string => typeof item === 'string') : [],
        rawText: typeof e.rawText === 'string' ? e.rawText : '',
        id: generateId('exp'),
        skillsUsed: [],
      })
    );

    if (skills.length === 0 && experiences.length === 0) {
      throw new Error('AI 未从简历中提取出能力或经历，请检查简历文本后重试');
    }

    return {
      skills,
      experiences,
      basicInfo: parsed.basicInfo && typeof parsed.basicInfo === 'object' && !Array.isArray(parsed.basicInfo) ? parsed.basicInfo : {},
      rawText: resumeText,
    };
  } catch (error) {
    throw new Error(`简历解析结果格式化失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================
// 功能 2：JD 解析
// ============================================================

/**
 * 解析岗位描述，提取结构化要求
 */
export async function parseJobDescription(
  apiKey: string,
  jdText: string
): Promise<ParsedJobDescription> {
  const systemPrompt = `你是一个招聘分析师。你的任务是解析岗位描述（JD），提取结构化的岗位要求。

规则：
1. 区分"硬性条件"（学历、年限、城市、证书等）和"能力要求"（技能、经验、软素质）
2. 每个要求项要具体、可验证
3. 输出必须是合法 JSON`;

  const userPrompt = `请解析以下岗位描述，提取结构化要求。

岗位描述：
---
${jdText}
---

请输出以下 JSON 格式：
{
  "company": "公司名（如有）",
  "position": "职位名（如有）",
  "salary": "薪资范围（如有）",
  "city": "城市（如有）",
  "requirements": [
    {
      "category": "分类（硬性条件/能力要求/加分项）",
      "item": "具体要求项",
      "isHard": true或false
    }
  ]
}`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.2, jsonMode: true }
  );

  try {
    const parsed = JSON.parse(content);
    return {
      company: parsed.company,
      position: parsed.position,
      salary: parsed.salary,
      city: parsed.city,
      requirements: (parsed.requirements || []) as JobRequirement[],
      rawText: jdText,
    };
  } catch (error) {
    throw new Error(`JD 解析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================
// 功能 3：匹配分析
// ============================================================

/**
 * 对比简历与 JD，进行差异化分析
 */
export async function analyzeMatch(
  apiKey: string,
  resume: ParsedResume,
  jobDescription: ParsedJobDescription
): Promise<MatchResult> {
  const systemPrompt = `你是一个资深招聘顾问。你的任务是对比求职者的简历和岗位要求，进行差异化分析。

规则：
1. 硬性条件（学历、年限、城市等）逐条核查是否符合
2. 能力要求：逐条比对简历中是否有对应能力，并给出证据（来自哪段经历）
3. 缺口：岗位要求但简历中没有的，标记为缺口
4. 匹配分数：0-100 分，综合评估。75 分以上为良好匹配
5. 证据要具体，引用简历中的真实经历
6. 输出必须是合法 JSON`;

  // 构造简历摘要
  const resumeSummary = {
    基本信息: resume.basicInfo,
    能力列表: resume.skills.map((s) => ({
      分类: s.category,
      能力: s.name,
      熟练度: s.level,
      证据: s.evidence,
    })),
    经历列表: resume.experiences.map((e) => ({
      公司: e.company,
      职位: e.role,
      时间: e.period,
      成就: e.achievements,
    })),
  };

  // 构造 JD 摘要
  const jdSummary = {
    岗位: jobDescription.position,
    公司: jobDescription.company,
    要求列表: jobDescription.requirements.map((r) => ({
      分类: r.category,
      要求: r.item,
      是否硬性: r.isHard,
    })),
  };

  const userPrompt = `请对比以下简历和岗位要求，进行差异化分析。

【简历数据】
${JSON.stringify(resumeSummary, null, 2)}

【岗位要求】
${JSON.stringify(jdSummary, null, 2)}

请输出以下 JSON 格式：
{
  "score": 匹配分数（0-100 的整数）,
  "hardConditionCheck": [
    {
      "requirement": "要求项",
      "matched": true或false,
      "evidence": "符合/不符合的说明",
      "isHard": true
    }
  ],
  "skillMatch": [
    {
      "requirement": "能力要求项",
      "matched": true或false,
      "evidence": "简历中的对应证据（如有）",
      "isHard": false
    }
  ],
  "gaps": [
    {
      "requirement": "缺口项",
      "matched": false,
      "evidence": "简历中暂无对应经历",
      "isHard": true或false
    }
  ],
  "summary": "总体评价（2-3 句话，说明匹配情况和主要差距）"
}`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, jsonMode: true }
  );

  try {
    const parsed = JSON.parse(content);
    return {
      score: parsed.score,
      hardConditionCheck: (parsed.hardConditionCheck || []) as MatchItem[],
      skillMatch: (parsed.skillMatch || []) as MatchItem[],
      gaps: (parsed.gaps || []) as MatchItem[],
      summary: parsed.summary,
    };
  } catch (error) {
    throw new Error(`匹配分析失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================
// 功能 4：经历补录引导
// ============================================================

/**
 * 引导用户补录经历 - 根据 AI 返回引导问题
 */
export async function generateFollowUpQuestions(
  apiKey: string,
  gap: string,
  existingResume: ParsedResume
): Promise<string> {
  const systemPrompt = `你是一个温和的面试官。用户在求职时发现简历缺少某个能力/经历，你要引导用户回忆相关经历。

规则：
1. 用大白话提问，像聊天一样
2. 鼓励用户回忆间接相关的经历（如兼职、学校项目、帮朋友做事等）
3. 不要让用户觉得有压力
4. 只输出引导问题本身，不要输出其他内容`;

  const userPrompt = `用户缺少的能力/经历是：${gap}

用户已有的经历背景（帮助判断问什么）：
${existingResume.experiences.map((e) => `- ${e.company} ${e.role}：${e.achievements.join('；')}`).join('\n')}

请生成一段引导问题，帮助用户回忆和这个缺口相关的经历。`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.7 }
  );

  return content.trim();
}

/**
 * 将用户的大白话补录整理为正式经历
 */
export async function formatFollowUpExperience(
  apiKey: string,
  userResponse: string,
  gap: string
): Promise<AtomicExperience> {
  const systemPrompt = `你是一个简历优化师。用户用大白话描述了一段经历，你要将其整理为正式的经历条目。

规则：
1. 公司、职位、时间、数字必须来自用户描述，不得编造
2. 提炼关键成就，用正式但通俗的语言
3. 标注这段经历体现的能力
4. 输出必须是合法 JSON`;

  const userPrompt = `用户缺少的能力/经历是：${gap}

用户的大白话描述：
---
${userResponse}
---

请整理为以下 JSON 格式：
{
  "company": "公司或项目名",
  "role": "担任的角色",
  "period": "时间段（如不确定写'不详'）",
  "achievements": ["关键成就1", "关键成就2"],
  "rawText": "用户原始描述"
}`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, jsonMode: true }
  );

  try {
    const parsed = JSON.parse(content);
    return {
      id: generateId('exp'),
      company: parsed.company || '',
      role: parsed.role || '',
      period: parsed.period || '',
      achievements: parsed.achievements || [],
      skillsUsed: [],
      rawText: userResponse,
    };
  } catch (error) {
    throw new Error(`经历格式化失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================
// 功能 5：定制简历生成
// ============================================================

/**
 * 针对特定岗位生成定制简历
 */
export async function generateTailoredResume(
  apiKey: string,
  resume: ParsedResume,
  jobDescription: ParsedJobDescription,
  matchResult?: MatchResult
): Promise<GeneratedResume> {
  const systemPrompt = `你是一个资深简历顾问。你的任务是根据求职者的经历库，针对特定岗位生成一份定制的简历。

【铁律 - 绝对不可违反】
1. 公司、职位、时间、数字等硬性事实必须来自经历库，不得编造
2. 你只能做"提炼"和"重组"：把最相关的经历排到前面，把不相关的经历改写为能体现可迁移能力的说法
3. 不得添加经历库中不存在的内容
4. 不得夸大或改变事实

【优化原则】
1. 根据岗位要求，从经历库中挑选最相关的内容
2. 按相关性排序，最相关的放最前面
3. 将通用表述改写为岗位导向的说法（但不改变事实）
4. 突出与岗位匹配的能力
5. 生成一段简短的打招呼话术

输出必须是合法 JSON。`;

  const resumeData = {
    基本信息: resume.basicInfo,
    能力列表: resume.skills,
    经历列表: resume.experiences,
  };

  const jdData = {
    岗位: jobDescription.position,
    公司: jobDescription.company,
    要求: jobDescription.requirements,
  };

  const matchData = matchResult
    ? {
        匹配分数: matchResult.score,
        主要缺口: matchResult.gaps.map((g) => g.requirement),
      }
    : null;

  const userPrompt = `请根据以下数据，针对该岗位生成定制简历。

【经历库】
${JSON.stringify(resumeData, null, 2)}

【目标岗位】
${JSON.stringify(jdData, null, 2)}

${matchData ? `【匹配分析】\n${JSON.stringify(matchData, null, 2)}` : ''}

请输出以下 JSON 格式：
{
  "summary": "个人简介（2-3 句话，针对该岗位定制，突出核心优势）",
  "skillsHighlight": ["核心技能亮点1", "核心技能亮点2", "核心技能亮点3"],
  "experiences": [
    {
      "company": "公司名",
      "role": "职位",
      "period": "时间段",
      "description": "针对该岗位改写后的经历描述（2-3 句话）",
      "highlights": ["关键成就1", "关键成就2"]
    }
  ],
  "coverLetter": "简短的打招呼话术（1-2 句话，提及对该岗位的兴趣和核心匹配点）"
}`;

  const content = await callDeepSeek(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.4, jsonMode: true }
  );

  try {
    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || '',
      skillsHighlight: parsed.skillsHighlight || [],
      experiences: (parsed.experiences || []).map(
        (e: { company: string; role: string; period: string; description: string; highlights: string[] }) => ({
          company: e.company,
          role: e.role,
          period: e.period,
          description: e.description,
          highlights: e.highlights || [],
        })
      ),
      coverLetter: parsed.coverLetter || '',
    };
  } catch (error) {
    throw new Error(`简历生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 测试 API Key 是否有效
 */
export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 10,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
