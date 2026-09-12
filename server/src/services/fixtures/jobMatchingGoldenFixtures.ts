import type { CapabilityEvidenceItem } from '../../types';

export interface JobMatchingGoldenFixture {
  id: string;
  title: string;
  purpose: string;
  jdText: string;
  resumeText: string;
  evidence: CapabilityEvidenceItem[];
  expectedBusiness: string[];
  equivalenceGroup?: string;
}

const item = (
  id: string,
  requirement: string,
  dimension: CapabilityEvidenceItem['dimension'],
  importance: CapabilityEvidenceItem['importance'],
  requiredDepth: CapabilityEvidenceItem['requiredDepth'],
  jobEvidence: string,
  resumeEvidenceLevel: CapabilityEvidenceItem['resumeEvidenceLevel'],
  relevance: CapabilityEvidenceItem['relevance'],
  resumeEvidence?: string,
  isHard = false,
): CapabilityEvidenceItem => ({
  id,
  requirement,
  dimension,
  isHard,
  importance,
  requiredDepth,
  jobEvidence,
  resumeEvidenceLevel,
  relevance,
  resumeEvidence,
});

export const jobMatchingGoldenFixtures: JobMatchingGoldenFixture[] = [
  {
    id: 'single-skill-exact',
    title: '单一技能完全匹配',
    purpose: '验证只有一个评分维度时的权重和满覆盖结果',
    jdText: '能够独立使用 TypeScript 完成前端项目。',
    resumeText: '独立负责 TypeScript 前端项目开发并上线。',
    evidence: [item('req_ts', 'TypeScript 项目实践', 'skill', 'core', 'practical', '独立使用 TypeScript 完成前端项目', 'owned', 'exact', '独立负责 TypeScript 前端项目开发并上线')],
    expectedBusiness: ['TypeScript 为可评分技能要求', '单项要求覆盖度应为 100%', '目标算法中技能权重应为 100%'],
  },
  {
    id: 'single-skill-missing',
    title: '单一技能无证据',
    purpose: '验证未发现证据不会被解释为候选人一定不会',
    jdText: '熟悉 Kubernetes。',
    resumeText: '负责 React 管理后台开发。',
    evidence: [item('req_k8s', 'Kubernetes', 'skill', 'important', 'familiar', '熟悉 Kubernetes', 'none', 'none')],
    expectedBusiness: ['技能要求可评分', '简历证据强度为 0', '状态语义为简历未发现证据'],
  },
  {
    id: 'two-dimensions',
    title: '两个评分维度',
    purpose: '验证少维度场景的权重必须完整归一化',
    jdText: '熟练使用 React；本科及以上学历。',
    resumeText: '使用 React 开发三个项目；本科学历。',
    evidence: [
      item('req_react', 'React', 'skill', 'core', 'practical', '熟练使用 React', 'used', 'exact', '使用 React 开发三个项目'),
      item('req_degree', '本科学历', 'education', 'important', 'basic', '本科及以上学历', 'mentioned', 'exact', '本科学历', true),
    ],
    expectedBusiness: ['目标算法中两个维度权重合计 100%', '学历是否评分须由阶段 1 人工确认'],
  },
  {
    id: 'all-six-dimensions',
    title: '六维均有要求',
    purpose: '验证六维排序、聚合和总分边界',
    jdText: '要求 TypeScript、三年经验、独立交付项目、量化成果、本科相关专业及电商经验。',
    resumeText: '负责 TypeScript 项目两年，独立上线系统；本科信息管理专业。',
    evidence: [
      item('req_6_skill', 'TypeScript', 'skill', 'core', 'practical', '要求 TypeScript', 'owned', 'exact', '负责 TypeScript 项目'),
      item('req_6_exp', '三年经验', 'experience', 'important', 'practical', '三年经验', 'used', 'high', '相关工作两年'),
      item('req_6_project', '独立交付', 'project', 'important', 'practical', '独立交付项目', 'achieved', 'exact', '独立上线系统'),
      item('req_6_result', '量化成果', 'achievement', 'normal', 'familiar', '有量化成果', 'none', 'none'),
      item('req_6_edu', '相关专业', 'education', 'normal', 'basic', '本科相关专业', 'mentioned', 'partial', '本科信息管理专业'),
      item('req_6_industry', '电商经验', 'industry', 'bonus', 'familiar', '电商经验优先', 'none', 'none'),
    ],
    expectedBusiness: ['六维固定顺序', '所有有效维度权重合计 100%', '总分处于 0—100'],
  },
  {
    id: 'core-gap-with-bonuses',
    title: '核心要求缺失但加分项满足',
    purpose: '验证核心缺口不能被多个加分项掩盖',
    jdText: '必须具备 Node.js 服务端经验；会 Docker、Figma、英语者优先。',
    resumeText: '熟悉 Docker、Figma，英语可作为工作语言。',
    evidence: [
      item('req_core_node', 'Node.js 服务端经验', 'skill', 'core', 'practical', '必须具备 Node.js 服务端经验', 'none', 'none', undefined, true),
      item('req_bonus_docker', 'Docker', 'skill', 'bonus', 'familiar', '会 Docker 优先', 'used', 'exact', '使用 Docker 部署'),
      item('req_bonus_figma', 'Figma', 'skill', 'bonus', 'basic', '会 Figma 优先', 'used', 'exact', '使用 Figma 设计原型'),
      item('req_bonus_en', '工作英语', 'skill', 'bonus', 'familiar', '英语好优先', 'owned', 'exact', '英语可作为工作语言'),
    ],
    expectedBusiness: ['必须暴露核心缺口', '维度不得显示为完全匹配'],
  },
  {
    id: 'core-met-bonuses-missing',
    title: '核心满足但加分项缺失',
    purpose: '验证加分项缺失不会等同核心失败',
    jdText: '必须精通 React；会 Flutter、Three.js、Rust 者优先。',
    resumeText: '主导 React 大型项目架构与交付。',
    evidence: [
      item('req_core_react', 'React', 'skill', 'core', 'expert', '必须精通 React', 'achieved', 'exact', '主导 React 大型项目架构与交付', true),
      item('req_bonus_flutter', 'Flutter', 'skill', 'bonus', 'basic', '会 Flutter 优先', 'none', 'none'),
      item('req_bonus_three', 'Three.js', 'skill', 'bonus', 'basic', '会 Three.js 优先', 'none', 'none'),
      item('req_bonus_rust', 'Rust', 'skill', 'bonus', 'basic', '会 Rust 优先', 'none', 'none'),
    ],
    expectedBusiness: ['核心技能明确满足', '加分项缺失应与核心缺口区分'],
  },
  {
    id: 'hard-not-scoreable-location',
    title: '硬性地点条件不评分',
    purpose: '验证硬性条件和评分准入相互独立',
    jdText: '必须常驻上海办公。',
    resumeText: '当前居住杭州。',
    evidence: [item('req_shanghai', '上海办公', 'other', 'core', 'basic', '必须常驻上海办公', 'mentioned', 'exact', '当前居住杭州', true)],
    expectedBusiness: ['属于硬性条件', '不参与六维能力评分', '应单独核查是否满足或待确认'],
  },
  {
    id: 'hard-scoreable-skill',
    title: '硬性技能同时参与评分',
    purpose: '验证 isHard 与 isScoreable 可以同时为 true',
    jdText: '必须能够独立使用 Python 开发数据服务。',
    resumeText: '独立负责 Python 数据服务并持续维护。',
    evidence: [item('req_python', 'Python 数据服务', 'skill', 'core', 'practical', '必须独立使用 Python 开发数据服务', 'owned', 'exact', '独立负责 Python 数据服务并持续维护', true)],
    expectedBusiness: ['既属于硬性条件又属于技能评分项', '单项要求覆盖度应为 100%'],
  },
  {
    id: 'duplicate-requirement',
    title: '同一能力重复描述',
    purpose: '验证同义要求不得重复增加权重',
    jdText: '熟练掌握 React。具备 React 项目开发能力。',
    resumeText: '使用 React 开发多个业务系统。',
    evidence: [item('req_react_merged', 'React 项目开发', 'skill', 'core', 'practical', '熟练掌握 React；具备 React 项目开发能力', 'used', 'exact', '使用 React 开发多个业务系统')],
    expectedBusiness: ['两句同义要求合并为一个计权项', '保留两处岗位原文来源'],
  },
  {
    id: 'alternative-tools',
    title: '选择型技术要求',
    purpose: '验证 A/B 任一即可不能当成两个必须项',
    jdText: '熟悉 React 或 Vue 任一前端框架。',
    resumeText: '使用 Vue 独立交付后台系统。',
    evidence: [item('req_frontend_framework', 'React 或 Vue', 'skill', 'important', 'familiar', '熟悉 React 或 Vue 任一前端框架', 'owned', 'exact', '使用 Vue 独立交付后台系统')],
    expectedBusiness: ['作为一个选择型要求计权一次', '满足任一选项即可形成有效证据'],
  },
  {
    id: 'compound-independent',
    title: '复合独立要求',
    purpose: '验证一句话中可独立判断的能力需要拆分',
    jdText: '负责需求分析、原型设计，并推动项目上线。',
    resumeText: '独立完成需求分析和原型设计。',
    evidence: [
      item('req_analysis', '需求分析', 'skill', 'important', 'practical', '负责需求分析', 'owned', 'exact', '独立完成需求分析'),
      item('req_prototype', '原型设计', 'skill', 'important', 'practical', '原型设计', 'owned', 'exact', '独立完成原型设计'),
      item('req_delivery', '推动上线', 'project', 'important', 'practical', '推动项目上线', 'none', 'none'),
    ],
    expectedBusiness: ['三项可独立判断的要求分别建项', '每项共享原句来源但只贡献自身重要度'],
  },
  {
    id: 'mentioned-without-practice',
    title: '技能列表提及但无实践证据',
    purpose: '验证仅提及与实际使用的证据等级差异',
    jdText: '能够在项目中使用 Redis。',
    resumeText: '技能：Redis、MySQL、Git。',
    evidence: [item('req_redis', 'Redis 实践', 'skill', 'important', 'practical', '在项目中使用 Redis', 'mentioned', 'exact', '技能：Redis')],
    expectedBusiness: ['只能判为 mentioned', '不能因关键词完全一致推断为实际使用'],
  },
  {
    id: 'transferable-experience',
    title: '高度相关的迁移经验',
    purpose: '用于校准证据等级乘相关度是否惩罚过重',
    jdText: '具备 B2B SaaS 产品设计经验。',
    resumeText: '独立负责企业内部管理系统的产品设计和上线。',
    evidence: [item('req_b2b_saas', 'B2B SaaS 产品设计', 'industry', 'important', 'practical', '具备 B2B SaaS 产品设计经验', 'owned', 'high', '独立负责企业内部管理系统的产品设计和上线')],
    expectedBusiness: ['属于高度相关但非完全对应', '用于人工比较乘法结果是否符合直觉'],
  },
  {
    id: 'supplement-before',
    title: '补录前缺少证据',
    purpose: '验证补录前后的证据变化和岗位权重稳定',
    jdText: '具备 A/B 测试设计与复盘经验。',
    resumeText: '负责产品需求分析。',
    evidence: [item('req_ab_test', 'A/B 测试', 'achievement', 'important', 'practical', '具备 A/B 测试设计与复盘经验', 'none', 'none')],
    expectedBusiness: ['补录前为简历未发现证据', '与补录后样本使用同一岗位要求和重要度'],
    equivalenceGroup: 'supplement-ab-test',
  },
  {
    id: 'supplement-after',
    title: '补录后发现成果证据',
    purpose: '验证补录后重新证据对齐并完整重算',
    jdText: '具备 A/B 测试设计与复盘经验。',
    resumeText: '设计并复盘 A/B 测试，使注册转化率提升 12%。',
    evidence: [item('req_ab_test', 'A/B 测试', 'achievement', 'important', 'practical', '具备 A/B 测试设计与复盘经验', 'achieved', 'exact', '设计并复盘 A/B 测试，使注册转化率提升 12%')],
    expectedBusiness: ['补录后证据升级为 achieved', '岗位要求、重要度和权重不变', '分数和状态需要重新计算'],
    equivalenceGroup: 'supplement-ab-test',
  },
];

export interface RealRecordValidationFixture {
  id: string;
  title: string;
  source: 'dev-database-redacted';
  privacyNote: string;
  jdRequirements: string[];
  resumeEvidence: string[];
  expectedBusiness: string[];
}

export const realRecordValidationFixtures: RealRecordValidationFixture[] = [
  {
    id: 'real-agent-fullstack-detailed',
    title: '智能体应用全栈岗位（真实记录脱敏）',
    source: 'dev-database-redacted',
    privacyNote: '仅保留岗位能力要求与概括后的证据关系；不含姓名、联系方式、公司名、文件名和完整简历原文。',
    jdRequirements: [
      '本科及以上学历',
      '3—5 年工作经验',
      '具备前后端开发能力，掌握 Python、JavaScript/TypeScript、Node.js、FastAPI、React、Vue 中的一项或多项',
      '熟悉大模型应用开发，理解 Agent、RAG、知识库、向量数据库、Tool Calling 和工作流编排',
      '具备 API 集成、权限控制、日志记录、用户反馈与异常处理能力',
      '能从真实使用场景出发设计可用、可迭代的产品体验',
      '能快速搭建 MVP 并持续迭代',
    ],
    resumeEvidence: [
      '学历和工作年限有明确结构化信息',
      '有 Python 业务算法与 Vibe Coding 前后端接入经历，但没有传统前端语言/框架或后端服务/框架的明确开发证据',
      '有从 0 到 1 产品重构、原型、PRD 和迭代经历',
      '有 MVP 交付证据',
      '旧记录未发现 Agent、RAG 和完整工程治理的明确证据',
    ],
    expectedBusiness: [
      '学历与最低年限作为硬性条件核查；能力性内容另行评分',
      '“一项或多项”只影响同类技术列表的选择；前端能力与后端能力仍需拆成两条独立要求',
      'Vibe Coding 前后端接入只能证明架构衔接、系统集成或工程化思维，不能证明熟悉传统前端或后端开发',
      'Python 业务算法可证明 Python 使用，但没有服务端、API 或后端框架实现时不能算后端开发',
      '大模型应用与工程治理缺少明确证据时应进入简历未发现证据',
      '产品化与 MVP 交付证据可进入项目或经验评分',
    ],
  },
  {
    id: 'real-agent-fullstack-compact',
    title: 'Agent 全栈岗位（真实记录脱敏）',
    source: 'dev-database-redacted',
    privacyNote: '仅保留岗位能力要求与概括后的证据关系；不含姓名、联系方式、公司名、文件名和完整简历原文。',
    jdRequirements: [
      '本科及以上学历',
      '3—5 年工作经验',
      '前后端能力，熟悉 Python、JavaScript/TypeScript、Node.js、FastAPI、React、Vue 中至少一项',
      '了解 Agent、RAG、知识库、向量数据库、Tool Calling 与工作流编排',
      '具备 API 集成、权限和日志等工程化能力',
      '计算机、软件工程、AI、信息系统或数据科学相关专业优先',
    ],
    resumeEvidence: [
      '学历和年限有明确结构化信息',
      'Python 业务算法和 Vibe Coding 接入有证据，但不等同传统前端或后端开发',
      '有 Python 业务算法、Vibe Coding 前端接入和测试验证经历，但没有传统前端编码或后端服务开发证据，API、权限、日志证据也未明确',
      '专业背景不属于岗位列举专业',
      '旧记录未发现大模型应用相关经历',
    ],
    expectedBusiness: [
      '技术栈要求按“至少一项”在同类技术内选择，但前端能力和后端能力必须分别核查',
      'Vibe Coding 和前后端接入可支持工程化或集成能力，不直接支持传统前后端开发能力',
      '工程化能力不得仅凭相邻开发经历推断为完全匹配',
      '相关专业属于教育专业加分项，不应被当作最低学历硬门槛',
      '未发现大模型应用证据时保持无证据，不进行常识补全',
    ],
  },
  {
    id: 'real-ai-product-manager',
    title: 'AI 产品经理岗位（真实记录脱敏）',
    source: 'dev-database-redacted',
    privacyNote: '仅保留岗位能力要求与概括后的证据关系；不含姓名、联系方式、公司名、文件名和完整简历原文。',
    jdRequirements: [
      '本科及以上学历',
      '1—3 年工作经验，并要求一定 AI 产品经理经验',
      '具备需求分析、意图拆解、逻辑设计、原型设计和 PRD 撰写能力',
      '熟悉大模型、智能体或机器学习等基础原理，并能与算法和研发协作',
      '计算机、AI 或能源相关专业优先',
      '有数据中台产品经验者优先',
      '有市场敏感度和抗压性',
      '责任心强，具备 Owner 意识，能主动跨过职责边界解决问题',
      '有平台化思维和业务闭环意识，愿意深入一线了解业务痛点',
    ],
    resumeEvidence: [
      '学历、工作年限和产品工作有明确结构化信息',
      '有需求管理、原型设计、PRD 和产品重构证据',
      '有 Python 业务算法和研发协作证据，但没有直接的大模型或智能体原理证据',
      '专业背景与岗位列举方向存在部分领域关联，但不是直接专业匹配',
      '未发现数据中台经验',
      '有市场竞品调研、深入现场分析问题的明确行为证据，但抗压性不能由此直接推断',
      '有独立主导重构、主动提案和推动需求上线关闭的证据',
      '有统一产品框架、模块化、标准化、需求跟踪和上线闭环证据',
    ],
    expectedBusiness: [
      '产品能力证据可高覆盖，但不能自动证明具备 AI 产品经理岗位经历',
      '算法开发和研发协作不能直接等同熟悉大模型或智能体原理',
      '相关专业优先属于教育专业加分项并允许部分相关',
      '数据中台经验未发现时应明确为简历未发现证据',
      '最低年限与经历能力深度分开处理，不能重复计权',
      '市场敏感度、Owner 意识和平台化思维应归入可评分能力，不得归为其他硬性条件',
      '通用能力必须引用具体行为证据；其中抗压性证据不足时保持不确定，不与市场敏感度一并高评',
    ],
  },
];

export const equivalentJdFixtures = [
  {
    id: 'equivalent-jd-paragraph',
    equivalenceGroup: 'frontend-product-role',
    jdText: '必须熟练使用 TypeScript 和 React，能够独立完成需求分析与原型设计；有 AI 产品经验者优先。',
  },
  {
    id: 'equivalent-jd-bullets',
    equivalenceGroup: 'frontend-product-role',
    jdText: '岗位要求：\n1. 必须熟练使用 TypeScript 和 React；\n2. 独立完成需求分析与原型设计；\n3. AI 产品经验优先。',
  },
  {
    id: 'equivalent-jd-reordered',
    equivalenceGroup: 'frontend-product-role',
    jdText: 'AI 产品经验优先。需要独立完成原型设计和需求分析，并且必须熟练使用 React、TypeScript。',
  },
];

if (jobMatchingGoldenFixtures.length !== 15) {
  throw new Error(`阶段 1 黄金样本数量应为 15，实际为 ${jobMatchingGoldenFixtures.length}`);
}

if (realRecordValidationFixtures.length !== 3) {
  throw new Error(`阶段 1 真实脱敏样本数量应为 3，实际为 ${realRecordValidationFixtures.length}`);
}
