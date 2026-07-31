# 更新日志

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
