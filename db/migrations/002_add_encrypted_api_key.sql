-- 为已有数据库增加用户级加密 API Key 字段。
ALTER TABLE users ADD COLUMN IF NOT EXISTS deepseek_api_key_encrypted TEXT;
