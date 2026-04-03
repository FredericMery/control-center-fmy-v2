-- Migration: add ai_category column to tasks
-- Run in Supabase SQL Editor

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_category text;

-- Index for fast filtering by category
CREATE INDEX IF NOT EXISTS tasks_ai_category_idx ON tasks (ai_category);

-- Optional: verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks'
  AND column_name = 'ai_category';
