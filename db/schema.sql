CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS workflow_drafts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
