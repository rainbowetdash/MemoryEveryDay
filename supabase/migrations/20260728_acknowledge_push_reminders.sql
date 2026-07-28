create or replace function public.acknowledge_push_reminder(target_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acknowledged boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.push_reminders
  set status = 'completed',
      updated_at = now()
  where event_id = target_event_id
    and user_id = auth.uid()
    and reminder_at <= now()
    and status in ('pending', 'reminding')
  returning true into acknowledged;

  return coalesce(acknowledged, false);
end;
$$;

revoke all on function public.acknowledge_push_reminder(uuid) from public;
grant execute on function public.acknowledge_push_reminder(uuid) to authenticated;
