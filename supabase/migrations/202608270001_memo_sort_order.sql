-- Keep a user-defined order for memos inside each folder.
alter table public.memos
  add column if not exists sort_order bigint;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, folder_id
      order by updated_at desc, created_at desc, id
    ) - 1 as position
  from public.memos
)
update public.memos as memo
set sort_order = ranked.position
from ranked
where memo.id = ranked.id
  and memo.sort_order is null;

alter table public.memos
  alter column sort_order set default 0,
  alter column sort_order set not null;

create index if not exists memos_user_folder_sort_idx
  on public.memos (user_id, folder_id, sort_order, updated_at desc);
