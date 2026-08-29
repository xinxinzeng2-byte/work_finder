# 数据库表结构说明（Neon Postgres）

> 求职助手多用户存储层的数据字典。配套总体方案见 `DATABASE_PLAN.md`。
> 数据库：Neon Postgres（免费层），访问方式：`postgres.js` 直连，Vercel serverless 函数内查询。

---

## 总览

共 4 张表，全部业务数据通过 `user_id` 做用户级隔离：

```
users (1)
 ├──< resumes (N)          一个人多份简历（原始 + 定制）
 ├──< jobs (N)             一个人多条岗位分析记录
 └─── workflow_drafts (1)  一个人最多一条流程草稿
```

| 表名 | 存什么 | 对应原 localStorage 键 |
|---|---|---|
| `users` | 注册账号 | 无（新增） |
| `resumes` | 简历（原始 + 定制） | `wf_resumes` |
| `jobs` | 岗位分析记录 | `wf_saved_jobs` |
| `workflow_drafts` | 未完成的岗位分析流程草稿 | `wf_workflow_draft` |

---

## 1. users —— 用户账号表

| 字段 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY，默认 `gen_random_uuid()` | 用户唯一标识，其他表通过它关联归属 |
| `email` | TEXT | UNIQUE NOT NULL | 登录邮箱，一个邮箱只能注册一个账号 |
| `password_hash` | TEXT | NOT NULL | bcrypt 哈希后的密码，不存明文 |
| `created_at` | TIMESTAMPTZ | NOT NULL，默认 `now()` | 注册时间 |

---

## 2. resumes —— 简历表（原始 + 定制共用）

| 字段 | 类型 | 约束 | 含义 | 对应前端类型 |
|---|---|---|---|---|
| `id` | UUID | PK，默认生成 | 简历唯一标识 | `ResumeItem.id` |
| `user_id` | UUID | NOT NULL，FK → users，级联删除 | 归属用户 | — |
| `name` | TEXT | NOT NULL | 简历显示名（重命名改的就是它） | `ResumeItem.name` |
| `type` | TEXT | NOT NULL，CHECK：`original` / `customized` | 原始简历 / 定制简历 | `ResumeItem.type` |
| `resume` | JSONB | NOT NULL | 解析后的结构化内容：能力列表、经历列表、基本信息 | `ResumeItem.resume`（ParsedResume） |
| `original_text` | TEXT | 可空 | 手动粘贴文本导入时的原文 | `ResumeItem.originalText` |
| `file_name` | TEXT | 可空 | 上传的原始文件名 | `ResumeItem.fileName` |
| `file_data` | TEXT | 可空 | 简历原件 base64（用于预览/下载；起步方案） | `ResumeItem.sourceFileData` |
| `file_mime` | TEXT | 可空 | 文件 MIME 类型（pdf/docx 等），配合 file_data 还原 | `ResumeItem.sourceMimeType` |
| `is_current` | BOOLEAN | NOT NULL，默认 false | 是否为「默认来源简历」 | `ResumeItem.isCurrent` |
| `source_ids` | JSONB | 默认 `'[]'` | 定制简历的来源：由哪几份原始简历生成 | `ResumeItem.sourceIds` |
| `target_job` | JSONB | 可空 | 定制简历的目标岗位 `{position, company, matchScore}` | `ResumeItem.targetJob` |
| `uploaded_at` | TIMESTAMPTZ | NOT NULL，默认 `now()` | 导入时间，列表按它倒序 | `ResumeItem.uploadedAt` |

索引：`idx_resumes_user (user_id, uploaded_at DESC)` —— 覆盖「取某用户的简历列表、按时间倒序」。

---

## 3. jobs —— 岗位记录表（每次岗位分析一条）

| 字段 | 类型 | 约束 | 含义 | 对应前端类型 |
|---|---|---|---|---|
| `id` | UUID | PK，默认生成 | 记录唯一标识 | `SavedJob.id` |
| `user_id` | UUID | NOT NULL，FK → users，级联删除 | 归属用户 | — |
| `sequence_number` | INTEGER | 可空 | 序号（列表展示的 1、2、3…） | `SavedJob.sequenceNumber` |
| `job_name` | TEXT | 可空 | 岗位名称 | `SavedJob.jobName` |
| `company` | TEXT | 可空 | 公司名 | `SavedJob.company` |
| `intended_position` | TEXT | 可空 | 意向职位 | `SavedJob.intendedPosition` |
| `match_score` | INTEGER | 可空 | 匹配度分数（列表直接展示） | `SavedJob.matchScore` |
| `status` | TEXT | NOT NULL，默认 `'analyzed'` | 流程状态：`analyzed` 已分析 / `supplementing` 补录中 / `generating` 生成中 / `completed` 已完成 | `SavedJob.status` |
| `jd` | JSONB | NOT NULL | 解析后的岗位描述（要求、职责等） | `SavedJob.jd` |
| `match_result` | JSONB | NOT NULL | AI 匹配完整结果：分数、逐条缺口、建议 | `SavedJob.matchResult` |
| `resume_snapshot` | JSONB | 可空 | 分析那一刻的简历快照（补录时更新） | `SavedJob.resumeSnapshot` |
| `generated_resume` | JSONB | 可空 | 最终生成的定制简历内容 | `SavedJob.generatedResume` |
| `supplemented_gaps` | JSONB | 默认 `'[]'` | 已补录缺口名单（补过的缺口不再重复提示） | `SavedJob.supplementedGaps` |
| `source_resume_ids` | JSONB | 默认 `'[]'` | 本次分析使用了哪几份原始简历 | `SavedJob.sourceResumeIds` |
| `saved_at` | TIMESTAMPTZ | NOT NULL，默认 `now()` | 保存时间 | `SavedJob.savedAt` |
| `analyzed_at` | TIMESTAMPTZ | 可空 | 分析完成时间 | `SavedJob.analyzedAt` |
| `created_at` | TIMESTAMPTZ | NOT NULL，默认 `now()` | 创建时间 | `SavedJob.createdAt` |
| `updated_at` | TIMESTAMPTZ | NOT NULL，默认 `now()` | 最后更新时间（补录/生成时刷新） | `SavedJob.updatedAt` |

索引：`idx_jobs_user (user_id, saved_at DESC)` —— 覆盖「取某用户的岗位列表、按时间倒序」。

---

## 4. workflow_drafts —— 流程草稿表

| 字段 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `user_id` | UUID | PRIMARY KEY，FK → users，级联删除 | 一人最多一条草稿：直接用 user_id 当主键，天然去重 |
| `data` | JSONB | NOT NULL | 草稿全部内容：进行到哪一步、选了哪些简历、JD 输入等 |
| `updated_at` | TIMESTAMPTZ | NOT NULL，默认 `now()` | 最后保存时间 |

> 入库后换浏览器 / 换设备都能续接上次的岗位分析流程；首页「有一个未完成的岗位分析」提示读的就是这张表。

---

## 建表 SQL（可直接在 Neon SQL Editor 执行）

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resumes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('original','customized')),
  resume        JSONB NOT NULL,
  original_text TEXT,
  file_name     TEXT,
  file_data     TEXT,
  file_mime     TEXT,
  is_current    BOOLEAN NOT NULL DEFAULT false,
  source_ids    JSONB DEFAULT '[]',
  target_job    JSONB,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_resumes_user ON resumes(user_id, uploaded_at DESC);

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
  resume_snapshot   JSONB,
  generated_resume  JSONB,
  supplemented_gaps JSONB DEFAULT '[]',
  source_resume_ids JSONB DEFAULT '[]',
  saved_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_user ON jobs(user_id, saved_at DESC);

CREATE TABLE workflow_drafts (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 设计要点

1. **JSONB 承载复杂结构**：`resume`、`match_result`、`resume_snapshot` 等与前端 TypeScript 接口一一对应，整体读写、无需为几十个小字段拆列；Postgres JSONB 支持按内部字段查询，将来要做跨记录检索也有出路。
2. **`ON DELETE CASCADE` 级联清理**：删除用户时，其简历、岗位记录、草稿一并删除，不留孤儿数据。
3. **每表双列索引**：`(user_id, 时间 DESC)` 恰好覆盖两个列表页的高频查询路径。
4. **文件起步存库**：简历原件 base64 存 `file_data` 字段（Neon 免费层 0.5GB 内够用）；量级上来后再迁移到对象存储（如 Vercel Blob），DB 只留 URL。
5. **camelCase ↔ snake_case 映射**：数据库列用 snake_case，前端 TS 字段保持 camelCase，由数据 API 层做映射，前端类型定义不用改。
