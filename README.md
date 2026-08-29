# AI 求职助手 (Worker Finder)

基于 DeepSeek AI 的简历智能优化与岗位匹配工具。

## 核心功能

1. **简历导入解析** - 支持 PDF/HTML，AI 拆解为原子能力与原子经历
2. **岗位匹配分析** - 简历 vs JD 差异化分析，给出匹配分数与缺口
3. **经历补录** - 根据缺口引导用户补充相关经历
4. **定制简历生成** - 针对特定岗位生成最对口的简历

## 技术栈

- **前端**: React + Vite + TailwindCSS
- **后端**: Express + TypeScript
- **AI**: DeepSeek API
- **PDF 解析**: pdf-parse

## 快速开始

```bash
# 安装所有依赖
npm run install:all

# 启动开发环境（前后端同时启动）
npm run dev
```

前端运行在 http://localhost:5173
后端运行在 http://localhost:3000

### 本地与 Preview 数据模式

- 执行 `npm run dev` 时使用本地模式：不强制登录，简历、岗位和流程草稿保存在浏览器 `localStorage`，因此不依赖 Neon 数据库。
- Vercel Preview/生产构建使用云端模式：启用邮箱登录，并将数据同步到 Neon 数据库。
- 如需手动覆盖模式，可设置 `VITE_DATA_MODE=local` 或 `VITE_DATA_MODE=cloud`。
- Preview/生产环境的 DeepSeek API Key 按用户使用 AES-256-GCM 加密后保存到数据库；数据库只保存密文。

## 使用流程

1. 在设置页填入 DeepSeek API Key
2. 导入简历（PDF/HTML）
3. 复制 Boss 直聘岗位 JD 到平台
4. 查看匹配分数与差异点
5. 根据缺口补录经历
6. 生成针对该岗位的定制简历
