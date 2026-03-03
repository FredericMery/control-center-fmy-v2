# 📚 Memory Module - SQL Deployment Guide

## Quick Deploy via Supabase UI

1. Go to: https://app.supabase.com/project/[YOUR_PROJECT_ID]/sql/new
2. Paste the entire content from `/migrations/memory-schema.sql`
3. Click "Run" and confirm

## What Gets Created

✅ `memory_sections` - Templates and user section instances
✅ `memory_fields` - Field definitions for each section
✅ `memory_items` - Entries in a section
✅ `memory_item_values` - Field values for items
✅ Row-Level Security policies on all 4 tables
✅ Performance indexes on foreign keys

## Quick Verify

After running the migration, verify in Supabase:

```sql
-- Check table creation
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'memory_%';

-- Check RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename LIKE 'memory_%';
```

## Next Steps

1. ✅ Database schema deployed
2. 🟡 Initialize templates with `/api/memory/init-templates`
3. 🟡 Start using the Memory module in `/dashboard/memoire`

---

**Created by GitHub Copilot** - Memory Module Complete Rebuild
