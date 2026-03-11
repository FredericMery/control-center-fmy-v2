-- Add feedback and memory tracking for assistant conversations

alter table public.ai_conversations
  add column if not exists liked boolean,
  add column if not exists summary_memory_id uuid;

create index if not exists idx_ai_conversations_liked
  on public.ai_conversations (user_id, liked, last_message_at desc);
