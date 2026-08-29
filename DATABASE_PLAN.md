# 数据库接入实施计划（Neon Postgres 多用户版）

> 目标：把当前「纯 localStorage 存储」改造为「Neon Postgres + 邮箱密码登录」的多用户架构，
> 部署形态不变（Vercel serverless + 静态前端），全部使用免费额度。

---

## 一、目标架构

```
浏览器 (React + Vite)
  │  fetch + Bearer Token
  ▼
Vercel Serverless Functions (api/*.ts，已有，新增数据 API)
  │  postgres.js 连接池
  ▼
Neon Postgres（你现有账号，新建 Project）
  ├─ users            用户
  ├─ resumes          简历（原始 + 定制）
  ├─ jobs             岗位记录
  └─ workflow_drafts  流程草稿
```

- **数据隔离**：所有业务表带 `user_id`，每个接口按登录用户过滤，用户只能读写自己的数据。
- **保留在 localStorage 的只有两项**：登录 token、DeepSeek API Key（按既定决策）。
- **server/ 目录**（本地 Express）继续用于本地调试 AI 能力，不参与线上数据链路。

---

## 二、数据库表结构（Neon 中执行）

### users
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### resumes（对应现在 localStorage 的 `wf_resumes`）
```sql
CREATE TABLE resumes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('original','customized')),
  resume       JSONB NOT NULL,            -- ParsedResume（能力/经历/基本信息）
  original_text TEXT,                     -- 粘贴导入的原文
  file_name    TEXT,
  file_data    TEXT,                      -- 简历原件 base64（起步方案，0.5GB 内够用）
  file_mime    TEXT,
  is_current   BOOLEAN NOT NULL DEFAULT false,
  source_ids   JSONB DEFAULT '[]',        -- 定制简历 ← 原始简历 来源关系
  target_job   JSONB,                     -- {position, company, matchScore}
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_resumes_user ON resumes(user_id, uploaded_at DESC);
```

### jobs（对应 `wf_saved_jobs`）
```sql
CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sequence_number   INTEGER,
  job_name          TEXT,
  company           TEXT,
  intended_position TEXT,
  match_score       INTEGER,
  status            TEXT NOT NULL DEFAULT 'analyzed',
  jd                JSONB NOT NULL,
  match_result      JSONB NOT NULL,
  resume_snapshot   JSONB,               -- 分析时的简历快照
  generated_resume  JSONB,               -- 生成的定制简历
  supplemented_gaps JSONB DEFAULT '[]',  -- 已补录缺口（不再重复提示）
  source_resume_ids JSONB DEFAULT '[]',
  saved_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_user ON jobs(user_id, saved_at DESC);
```

### workflow_drafts（对应 `wf_workflow_draft`，每用户最多一条）
```sql
CREATE TABLE workflow_drafts (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> 说明：`resume_snapshot`、`match_result` 这类大 JSON 用 JSONB 存储，结构灵活，
> 与现有 TypeScript 类型一一对应，不需要为字段拆列。

---

## 三、认证设计（自写，无第三方依赖）

### 注册 `POST /api/auth/register`
- 入参 `{ email, password }`；校验邮箱格式 + 密码 ≥ 8 位
- `bcryptjs` 哈希（cost 10）后插入 users；邮箱已存在返回 409
- 返回 `{ token, user: { id, email } }`

### 登录 `POST /api/auth/login`
- 校验哈希 → 签发 JWT 返回

### 会话机制
- JWT（HS256，`jsonwebtoken`），有效期 7 天，载荷 `{ sub: userId }`
- 前端存 localStorage（key: `auth_token`），所有数据请求带 `Authorization: Bearer <token>`
- 服务端公共函数 `getUserFromReq(req)`：校验签名 → 返回 userId；无 token/失效统一 401
- 密钥：环境变量 `JWT_SECRET`（随机 64 位，Vercel + 本地 `.env` 各配一份）

---

## 四、数据 API 清单（全部走 user_id 鉴权）

| 方法 | 路径（经 vercel.json rewrite） | 作用 | 对应现 storage.ts 函数 |
|---|---|---|---|
| GET | `/api/data/resumes` | 列表（含解析结果） | `loadResumes()` |
| POST | `/api/data/resumes` | 新建（原始/定制导入） | `saveResume()` / `saveCustomizedResume()` |
| PATCH | `/api/data/resumes/:id` | 改名 / 设为默认 | `renameResume()` / `setCurrentResume()` |
| DELETE | `/api/data/resumes/:id` | 删除（级联不影响 jobs） | `deleteResume()` |
| GET | `/api/data/jobs` | 岗位列表 | `loadSavedJobs()` |
| POST | `/api/data/jobs` | 新建岗位记录 | `saveJob()` |
| PATCH | `/api/data/jobs/:id` | 更新状态/快照/已补缺口 | `updateJob()` |
| DELETE | `/api/data/jobs/:id` | 删除岗位 | `removeJob()` |
| GET | `/api/data/draft` | 读草稿 | `loadWorkflowDraft()` |
| PUT | `/api/data/draft` | 写/覆盖草稿 | `saveWorkflowDraft()` |
| DELETE | `/api/data/draft` | 清草稿 | `clearWorkflowDraft()` |

新增文件：
```
api/_lib/db.ts          postgres.js 连接（serverless 复用连接池）
api/_lib/auth.ts        JWT 签发/校验 + getUserFromReq
api/auth/register.ts
api/auth/login.ts
api/auth/me.ts
api/data/resumes.ts     + api/data/resumes/[id].ts
api/data/jobs.ts        + api/data/jobs/[id].ts
api/data/draft.ts
db/schema.sql           建表脚本（也可在 Neon SQL Editor 直接执行）
```

`vercel.json` rewrites 追加：
```json
{ "source": "/api/auth/register", "destination": "/api/auth/register" },
{ "source": "/api/auth/login",    "destination": "/api/auth/login" },
{ "source": "/api/auth/me",       "destination": "/api/auth/me" },
{ "source": "/api/data/resumes/:id", "destination": "/api/data/resumes/[id]" },
{ "source": "/api/data/jobs/:id",    "destination": "/api/data/jobs/[id]" },
{ "source": "/api/data/resumes",  "destination": "/api/data/resumes" },
{ "source": "/api/data/jobs",     "destination": "/api/data/jobs" },
{ "source": "/api/data/draft",    "destination": "/api/data/draft" }
```

新依赖（根 package.json）：`postgres`（postgres.js，serverless 友好）、`bcryptjs`（纯 JS，免原生编译）、`jsonwebtoken` + `@types/*`。

---

## 五、前端改造点

### 1. 新增登录/注册页 + 路由守卫
- `client/src/components/views/AuthView.tsx`：登录/注册二合一表单
- `App.tsx`：启动时 `GET /api/auth/me` 校验 token；无效 → 强制进入 AuthView
- 顶栏加「退出登录」（清 token 回登录页）

### 2. storage.ts 改造（核心工作量）
- 所有函数保持**同名同参数**，但内部改为 `fetch` 数据 API，函数变 **async**
- ⚠️ 关键影响：现在多个视图用同步调用初始化 state
  （`useState(loadResumes())`、`useState(hasValidDraft())`），
  变 async 后需要改成 **useEffect 加载模式**，涉及视图：
  - `ResumeManagerView`（resumes）
  - `JobApplicationsView`（jobs + draft 状态）
  - `JobsWorkflowView`（resumes + draft）
  - `App.tsx`（当前简历）
- 兜底策略：加一个轻量 `DataContext`（登录后统一拉取 resumes/jobs，视图从 context 取 + 局部刷新函数），避免每个视图各写一套 loading

### 3. 旧数据迁移（一次性）
- 登录后若检测到旧 localStorage 里有 `wf_resumes` / `wf_saved_jobs`，顶栏提示「发现本机旧数据，一键导入云端」
- 导入 = 逐条 POST 到数据 API → 成功后清除旧 key（API Key 与 token 保留）
- 不想导入也可跳过，旧数据继续留在本机不碍事

---

## 六、环境变量

| 变量 | 哪里配 | 值 |
|---|---|---|
| `DATABASE_URL` | Vercel 项目 Settings → Environment Variables + 本地 `.env` | Neon 连接串（带 `?sslmode=require`） |
| `JWT_SECRET` | 同上 | `openssl rand -hex 32` 生成 |

---

## 七、实施步骤（建议顺序）

| 阶段 | 内容 | 产出 |
|---|---|---|
| **P0 准备**（你操作） | Neon 控制台 → New Project（名字如 `worker-finder`）→ 复制连接串 → 配 Vercel 环境变量 + 发我一份配本地 `.env` | 数据库就绪 |
| **P1 后端基建** | 建 `db/schema.sql` 并执行；装依赖；`db.ts` / `auth.ts` | 连库可跑 |
| **P2 认证** | register / login / me 三个接口 + 前端 AuthView + 路由守卫 | 能注册登录 |
| **P3 数据 API** | resumes / jobs / draft 全套 CRUD | 接口齐 |
| **P4 前端切换** | storage.ts → async API；DataContext；四个视图加载模式调整 | 全功能走云端 |
| **P5 收尾** | 旧数据一键导入；`npm run build` + 部署 + 线上注册/导入/分析全流程回归 | 上线 |

预计总工作量：一次性完成约一个工作日；P0–P2 先行的话，当天即可上线登录能力。

---

## 八、风险与取舍

| 风险 | 影响 | 对策 |
|---|---|---|
| Vercel serverless 请求体上限 **4.5MB** | 超大 PDF 简历上传会 413 | 起步阶段可接受；后续量级上来换 Vercel Blob 分片直传 |
| storage.ts 同步→async 改造波及多个视图 | 改动面大，容易漏 | 用 DataContext 统一收口；每改一个视图即回归该页 |
| Neon 免费层闲置 5 分钟休眠 | 首次请求慢 1-2 秒 | 可接受；将来 Pro 档 $19/月消除 |
| JWT 存 localStorage 有 XSS 面 | token 被脚本窃取 | 本应用无第三方脚本注入面；后续可升级 HttpOnly Cookie |
| 用户密码找回 | 自写 auth 无邮件服务 | 忘记密码 = 重新注册（早期可接受）；后续接 Resend 发信 |
