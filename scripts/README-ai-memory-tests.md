# AI Memory API Smoke Tests

## Purpose
Quick validation of critical endpoints:
- `/api/settings/subscription`
- `/api/memory/cards`
- `/api/memory/search`
- `/api/memory/ask`
- `/api/memory/ingest` (optional if image provided)

## Requirements
- Local app running (`npm run dev`) or deployed URL
- Valid Supabase access token for target user
- AI validation code (`AI_VALIDATION_CODE`)

## Run
```bash
BASE_URL=http://localhost:3000 \
TEST_AUTH_TOKEN=<supabase_access_token> \
AI_VALIDATION_CODE=050100 \
node scripts/smoke-ai-memory-api.mjs
```

## Optional OCR ingest
Add `TEST_IMAGE_BASE64` (data URL or raw base64):
```bash
BASE_URL=http://localhost:3000 \
TEST_AUTH_TOKEN=<supabase_access_token> \
AI_VALIDATION_CODE=050100 \
TEST_IMAGE_BASE64='<base64>' \
node scripts/smoke-ai-memory-api.mjs
```

## Notes
- This script triggers real AI calls on `search`, `ask`, `ingest` and logs usage costs.
- For privileged full-access users, subscription stays forced to `PRO` even if the script tries to set `BASIC`.
