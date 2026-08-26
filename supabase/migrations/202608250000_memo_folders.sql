-- Cloud-synced folders for organizing memos. Deleting a folder keeps its memos.

create table if not exists public.memo_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memo_folders_user_updated_idx
  on public.memo_folders (user_id, updated_at desc);

create unique index if not exists memo_folders_user_name_unique_idx
  on public.memo_folders (user_id, lower(btrim(name)));

alter table public.memo_folders enable row level security;

drop policy if exists "Users manage their own memo folders" on public.memo_folders;
create policy "Users manage their own memo folders"
  on public.memo_folders for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.memos
  add column if not exists folder_id uuid references public.memo_folders(id) on delete set null;

create index if not exists memos_folder_idx on public.memos (folder_id);
