-- Keep an independent user-defined order for the all-memos view.
alter table public.memos
  add column if not exists all_sort_order bigint;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc, created_at desc, id
    ) - 1 as position
  from public.memos
)
update public.memos as memo
set all_sort_order = ranked.position
from ranked
where memo.id = ranked.id
  and memo.all_sort_order is null;

alter table public.memos
  alter column all_sort_order set default 0,
  alter column all_sort_order set not null;

create index if not exists memos_user_all_sort_idx
  on public.memos (user_id, all_sort_order, updated_at desc);
