CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  deepseek_api_key_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS deepseek_api_key_encrypted TEXT;

CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('original','customized')),
  resume JSONB NOT NULL,
  original_text TEXT,
  file_name TEXT,
  file_data TEXT,
  file_mime TEXT,
  is_current BOOLEAN NOT NULL DEFAULT false,
  source_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_job JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sequence_number INTEGER,
  job_name TEXT,
  company TEXT,
  intended_position TEXT,
  match_score INTEGER,
  status TEXT NOT NULL DEFAULT 'analyzed',
  jd JSONB NOT NULL,
  match_result JSONB NOT NULL,
  resume_snapshot JSONB,
  generated_resume JSONB,
  supplemented_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_resume_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  analyzed_resume_id UUID,
  analyzed_resume_version INTEGER,
  scoring_version TEXT,
  input_hash TEXT,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS analyzed_resume_id UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS analyzed_resume_version INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scoring_version TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS input_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS job_preparations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('targeted','general')),
  name TEXT NOT NULL,
  career_direction TEXT NOT NULL,
  source_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  source_resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
  source_resume_version INTEGER,
  source_resume_snapshot JSONB NOT NULL,
  job_snapshot JSONB,
  match_result_snapshot JSONB,
  document JSONB NOT NULL,
  document_schema_version INTEGER NOT NULL DEFAULT 1,
  content_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  theme_id TEXT NOT NULL DEFAULT 'clean-professional',
  theme_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('generating','draft','published')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_preparations_user ON job_preparations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_preparations_job ON job_preparations(source_job_id);

CREATE TABLE IF NOT EXISTS interview_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id UUID NOT NULL UNIQUE REFERENCES job_preparations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  generation_basis_hash TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interview_kits_user ON interview_kits(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS published_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id UUID NOT NULL UNIQUE REFERENCES job_preparations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  published_document JSONB NOT NULL,
  theme_id TEXT NOT NULL,
  theme_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','unpublished')),
  noindex BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_published_portfolios_slug ON published_portfolios(slug);
CREATE INDEX IF NOT EXISTS idx_published_portfolios_user ON published_portfolios(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS workflow_drafts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  client_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workflow_drafts ADD COLUMN IF NOT EXISTS client_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS workflow_draft_tombstones (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 阻止仍打开的旧版页面在用户放弃分析后继续把草稿写回来。
-- 新版客户端必须携带 client_updated_at；创建时间晚于删除标记的新草稿可正常保存。
CREATE OR REPLACE FUNCTION guard_workflow_draft_write()
RETURNS trigger AS $$
DECLARE
  tombstone_at TIMESTAMPTZ;
BEGIN
  IF NEW.client_updated_at IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT deleted_at INTO tombstone_at
  FROM workflow_draft_tombstones
  WHERE user_id = NEW.user_id;

  IF tombstone_at IS NOT NULL THEN
    IF NEW.client_updated_at <= tombstone_at THEN
      RETURN NULL;
    END IF;
    DELETE FROM workflow_draft_tombstones WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflow_draft_write_guard ON workflow_drafts;
CREATE TRIGGER workflow_draft_write_guard
BEFORE INSERT OR UPDATE ON workflow_drafts
FOR EACH ROW EXECUTE FUNCTION guard_workflow_draft_write();
