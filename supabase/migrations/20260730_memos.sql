-- Run this migration in the Supabase SQL editor before deploying the memo feature.

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.schedule_events(id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  content text not null default '' check (char_length(content) <= 5000),
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memos_user_updated_idx on public.memos (user_id, updated_at desc);
create index if not exists memos_event_idx on public.memos (event_id);

alter table public.memos enable row level security;
drop policy if exists "Users manage their own memos" on public.memos;
create policy "Users manage their own memos"
  on public.memos for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memo-attachments', 'memo-attachments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'])
on conflict (id) do nothing;

drop policy if exists "Users manage their own memo attachments" on storage.objects;
create policy "Users manage their own memo attachments"
  on storage.objects for all to authenticated
  using (bucket_id = 'memo-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'memo-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
