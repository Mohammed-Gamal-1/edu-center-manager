-- Durable history for every successfully replaced center snapshot.
-- This migration is additive and never deletes production data.

create table if not exists public.center_state_history (
  id bigint generated always as identity primary key,
  state_id smallint not null,
  data jsonb not null,
  version bigint not null,
  archived_at timestamptz not null default now()
);

create index if not exists center_state_history_state_version_idx
  on public.center_state_history (state_id, version desc);

alter table public.center_state_history enable row level security;

create or replace function public.archive_previous_center_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.center_state_history (state_id, data, version, archived_at)
  values (old.id, old.data, old.version, now());
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'archive_center_state_before_update'
      and tgrelid = 'public.center_state'::regclass
      and not tgisinternal
  ) then
    create trigger archive_center_state_before_update
      before update on public.center_state
      for each row
      execute function public.archive_previous_center_state();
  end if;
end;
$$;
