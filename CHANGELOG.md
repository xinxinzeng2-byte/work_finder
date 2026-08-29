# 更新日志

## 完善本地数据库开发模式与岗位工作流草稿同步可靠性修复（2026-08-29）

- 本地数据库开发模式成为默认，新增离线本地预览模式；同时补充数据库健康检查，并使用 Neon HTTPS 驱动避免本地网络无法访问 PostgreSQL 5432 端口。
- 修复岗位工作流草稿删除后被旧写入自动恢复的问题：增加草稿客户端时间戳、删除墓碑和迁移脚本，并让放弃操作等待云端删除，失败时恢复本地状态供重试。
- 区分本地和云端 API Key 存储，统一简历导入的 Key 检查；同时修复工作流初始化持续重渲染和历史草稿空结果无限重试。
- 补充本地数据库开发说明、Neon 依赖、类型声明和服务端 `/health/db` 连通性接口。

### 涉及文件

- `CHANGELOG.md`
- `README.md`
- `api/data/[...path].ts`
- `client/package.json`
- `client/src/components/SettingsModal.tsx`
- `client/src/components/views/JobApplicationsView.tsx`
- `client/src/components/views/JobsWorkflowView.tsx`
- `client/src/components/views/ResumeManagerView.tsx`
- `client/src/services/api.ts`
- `client/src/utils/storage.ts`
- `client/src/vite-env.d.ts`
- `db/migrations/20260829_workflow_draft_tombstones.sql`
- `db/schema.sql`
- `package.json`
- `server/package-lock.json`
- `server/package.json`
- `server/src/index.ts`
- `server/src/routes/dataRoutes.ts`
- `server/src/services/database.ts`

## 简历AI提取修复、API key云端存储、草稿刷新前后一致性修复（2026-08-29）

- 修复岗位详情页生成定制简历后未清理工作流草稿的问题，等待云端草稿删除完成，避免刷新后重新出现旧提醒。
- 防止已完成生成的工作流通过“保存并退出”再次写入草稿，并兼容 Preview 中的历史简历、岗位和草稿数据。
- 修复当前简历状态缺失时点击“分析详情”出现空白的问题，增加岗位简历快照兜底和明确的异常提示。
- “分析详情”统一展示已保存的 AI 匹配分析结果，岗位分析成功后先持久化结果再清理草稿，后续进入详情不重复调用 AI。
- 完善简历 AI 能力提取：正常导入只提取一次；历史记录缺少结构化能力和经历但保留原文时自动补提取并回写，失败时不保存空结果。
- 将 Preview/生产环境的 DeepSeek API Key 按用户使用 AES-256-GCM 加密保存到数据库，补充 API、迁移脚本、环境变量和部署说明。

### 涉及文件

- `DATABASE_PLAN.md`
- `DATABASE_SCHEMA.md`
- `DEPLOY.md`
- `README.md`
- `api/_lib/apiKey.ts`
- `api/auth/[action].ts`
- `api/generate.ts`
- `api/match.ts`
- `api/parse-jd.ts`
- `api/parse.ts`
- `api/supplement.ts`
- `api/test-key.ts`
- `client/src/App.tsx`
- `client/src/components/SettingsModal.tsx`
- `client/src/components/views/AnalyzeView.tsx`
- `client/src/components/views/JobApplicationsView.tsx`
- `client/src/components/views/JobsWorkflowView.tsx`
- `client/src/services/api.ts`
- `client/src/utils/storage.ts`
- `db/migrations/002_add_encrypted_api_key.sql`
- `db/schema.sql`
- `server/.env.example`
- `server/src/controllers/aiController.ts`
- `server/src/routes/authRoutes.ts`
- `server/src/services/deepseekService.ts`
- `server/src/services/userApiKeyService.ts`

## 完善 Preview 历史数据兼容并修复页面白屏（2026-08-29）

- 统一规范化简历、岗位和流程草稿中的历史数据格式。
- 兼容缺失或非数组的能力、经历、岗位要求、匹配结果和来源字段，修复能力库与“继续分析”页面白屏。
- 为历史数据补齐安全默认值，避免单条异常记录阻断整个账号的数据加载。

### 涉及文件

- `CHANGELOG.md`
- `client/src/utils/storage.ts`

## 修复 Preview 历史数据格式导致的启动失败（2026-08-29）

- 兼容历史简历中的字符串来源 ID，避免启动迁移时调用 `.map()` 失败。
- 规范化简历来源、岗位来源和已补录缺口字段，确保旧数据可以正常加载和继续同步。

### 涉及文件

- `CHANGELOG.md`
- `client/src/utils/storage.ts`
- `api/_lib/data.ts`

## 修复 Preview 云端数据接口加载失败（2026-08-29）

- 修复 `api/data` 路由被通用 `data/` 忽略规则排除，导致 Preview 无法加载简历、岗位和草稿数据的问题。
- 为认证和用户数据接口增加禁止缓存响应，客户端请求禁用缓存，避免收到没有响应体的 `304` 响应。

### 涉及文件

- `.gitignore`
- `api/data/[...path].ts`
- `api/auth/[action].ts`
- `client/src/utils/storage.ts`
- `vercel.json`
- `CHANGELOG.md`

## 修复多用户云端数据隔离与同步可靠性（2026-08-29）

- 修复 Preview 云端已有简历但岗位为空时，本地岗位被空数据覆盖的问题。
- 切换账号或退出登录时清空旧账号界面状态，等待当前账号云端数据加载完成后再展示。
- 串行化简历、岗位和流程草稿的云端写入，并在退出登录前等待未完成的同步请求。
- 防止没有明确账号归属的旧本地数据自动迁移到其他用户，并保留本地备份。
- 新建数据使用标准 UUID，提升云端更新和幂等同步的可靠性。

### 涉及文件

- `CHANGELOG.md`
- `client/src/App.tsx`
- `client/src/utils/storage.ts`

## 接入邮箱登录与云端同步并完善岗位工作流（2026-08-29）

- 增加邮箱注册、登录与登录状态恢复，支持在不同设备继续使用。
- 接入 Neon 云端数据同步，保存简历、岗位和流程草稿；保留本地开发模式。
- 完善岗位工作流中的能力/经历提取、缺口补录预览与确认、流程草稿清理和简历管理。
- 在左侧栏设置下方增加登录用户头像，点击可查看登录邮箱。
- 补充 Vercel、数据库和本地开发相关配置与说明。

### 涉及文件

- `.gitignore`
- `README.md`
- `CHANGELOG.md`
- `client/src/App.tsx`
- `client/src/components/SettingsModal.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/components/views/AuthView.tsx`
- `client/src/components/views/JobsWorkflowView.tsx`
- `client/src/components/views/ResumeManagerView.tsx`
- `client/src/index.css`
- `client/src/types/index.ts`
- `client/src/utils/storage.ts`
- `client/src/vite-env.d.ts`
- `package.json`
- `package-lock.json`
- `vercel.json`
- `api/_lib/auth.ts`
- `api/_lib/data.ts`
- `api/_lib/db.ts`
- `api/_lib/email.ts`
- `api/_lib/http.ts`
- `api/auth/[action].ts`
- `db/schema.sql`
- `DATABASE_PLAN.md`
- `DATABASE_SCHEMA.md`
- `server/.env.example`
- `server/package.json`
- `server/package-lock.json`
- `server/src/index.ts`
- `server/src/routes/authRoutes.ts`
- `server/src/routes/dataRoutes.ts`
- `server/src/services/authService.ts`
- `server/src/services/database.ts`
- `server/src/services/emailValidation.ts`

## 修复 Vercel API 路由与函数构建（2026-07-31）

- 改用 Vercel 自动识别的 Serverless Functions 配置，修复线上 `/api/health` 等 API 路由返回 404 的问题。
- 增加 `/health` 到 `/api/health` 的兼容映射，并保留前端单页应用回退路由。
- 修复补录接口缺少简历数据校验导致的 TypeScript 编译错误。
- 将 Vercel 简历解析函数所需的文件解析逻辑和运行时依赖纳入根项目，确保生产构建可以完整打包。

### 涉及文件

- `vercel.json`
- `api/parse.ts`
- `api/supplement.ts`
- `api/_lib/fileService.ts`
- `package.json`
- `package-lock.json`
