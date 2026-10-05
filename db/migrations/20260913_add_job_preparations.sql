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
