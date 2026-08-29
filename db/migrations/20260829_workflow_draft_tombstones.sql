ALTER TABLE workflow_drafts
  ADD COLUMN IF NOT EXISTS client_updated_at TIMESTAMPTZ;

-- migration-break

CREATE TABLE IF NOT EXISTS workflow_draft_tombstones (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- migration-break

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

-- migration-break

DROP TRIGGER IF EXISTS workflow_draft_write_guard ON workflow_drafts;

-- migration-break

CREATE TRIGGER workflow_draft_write_guard
BEFORE INSERT OR UPDATE ON workflow_drafts
FOR EACH ROW EXECUTE FUNCTION guard_workflow_draft_write();
