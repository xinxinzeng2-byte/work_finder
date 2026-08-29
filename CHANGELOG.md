# 更新日志

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
