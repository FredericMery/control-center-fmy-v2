-- Conversation store for dashboard AI assistant

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  allow_internet boolean not null default false,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  ended_at timestamptz,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  message_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_conversations_user_id on public.ai_conversations(user_id);
create index if not exists idx_ai_conversations_status on public.ai_conversations(status);
create index if not exists idx_ai_messages_conversation on public.ai_conversation_messages(conversation_id, created_at desc);
create index if not exists idx_ai_messages_user on public.ai_conversation_messages(user_id);

alter table public.ai_conversations enable row level security;
alter table public.ai_conversation_messages enable row level security;

-- Users can only read/write their own conversation rows.
drop policy if exists "ai_conversations_select_own" on public.ai_conversations;
create policy "ai_conversations_select_own"
  on public.ai_conversations for select
  using (auth.uid() = user_id);

drop policy if exists "ai_conversations_insert_own" on public.ai_conversations;
create policy "ai_conversations_insert_own"
  on public.ai_conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "ai_conversations_update_own" on public.ai_conversations;
create policy "ai_conversations_update_own"
  on public.ai_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ai_messages_select_own" on public.ai_conversation_messages;
create policy "ai_messages_select_own"
  on public.ai_conversation_messages for select
  using (auth.uid() = user_id);

drop policy if exists "ai_messages_insert_own" on public.ai_conversation_messages;
create policy "ai_messages_insert_own"
  on public.ai_conversation_messages for insert
  with check (auth.uid() = user_id);
