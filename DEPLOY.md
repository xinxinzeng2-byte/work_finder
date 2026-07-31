# Vercel 部署指南

## 前置准备

1. 注册 [Vercel 账号](https://vercel.com)（用 GitHub 登录最快）
2. 把项目推送到 GitHub 仓库

## 部署步骤

### 方式一：通过 GitHub 自动部署（推荐）

1. 把项目推送到 GitHub
2. 登录 Vercel → 点击「New Project」→ 导入你的 GitHub 仓库
3. Vercel 会自动识别配置，点击「Deploy」即可
4. 等待 1-2 分钟构建完成，会得到一个 `xxx.vercel.app` 的链接

### 方式二：通过 Vercel CLI 手动部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 在项目根目录执行
vercel

# 首次会问几个问题，按默认即可
# 部署到生产环境
vercel --prod
```

## 配置说明

项目已包含以下 Vercel 配置文件：

- `vercel.json` - 路由配置：`/api/*` 走 Serverless 函数，其余走静态前端
- `api/index.ts` - Serverless 函数入口
- 根 `tsconfig.json` - 编译配置

## 常见问题

### Q: 部署后 API 报错怎么办？

检查 Vercel 的 Functions 日志：项目面板 → Logs。常见原因是依赖没装上。

### Q: pdf-parse 在 Vercel 上跑不起来？

`pdf-parse` 依赖较老，如遇问题可换成 `pdfjs-dist`（纯 JS 实现）。

### Q: API Key 安全吗？

用户的 DeepSeek API Key 保存在他们自己的浏览器 localStorage，通过请求头传给后端。后端不存储 Key，部署时也不需要在 Vercel 配置环境变量。

### Q: 免费额度够用吗？

Vercel 免费版：
- 100GB 带宽/月
- 100GB-Hours Serverless 执行/月
- 个人使用绰绰有余

### Q: 冷启动慢吗？

Serverless 函数闲置一段时间后首次请求会有 1-2 秒冷启动。日常使用感知不强。
