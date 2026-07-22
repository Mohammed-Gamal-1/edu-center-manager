-- Partial lesson payments and later debt settlements.
-- Teacher compensation remains attendance-based and is never reduced by shortages.

create table if not exists public.student_debt_payments (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.lesson_sessions(id) on delete cascade,
  student_id bigint not null references public.students(id),
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists student_debt_payments_student_idx
  on public.student_debt_payments (student_id, paid_at desc);
create index if not exists student_debt_payments_session_idx
  on public.student_debt_payments (session_id);

alter table public.student_debt_payments enable row level security;

-- This trigger runs after the existing normalized-state trigger. It replaces
-- the old full-payment attendance assumption with the amount captured by the UI
-- and mirrors later settlements into their own immutable-purpose table.
create or replace function public.sync_center_state_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot jsonb := new.data;
begin
  delete from public.session_attendance where true;

  insert into public.session_attendance (session_id, student_id, paid_cash, attended_at)
  select (session_item ->> 'id')::bigint,
         student_id.value::bigint,
         least(
           coalesce((session_item ->> 'studentPrice')::numeric, 0),
           greatest(
             0,
             coalesce(
               nullif(session_item -> 'studentPayments' ->> student_id.value, '')::numeric,
               coalesce((session_item ->> 'studentPrice')::numeric, 0)
             )
           )
         ),
         coalesce(session_row.started_at, session_row.scheduled_at)
  from jsonb_array_elements(coalesce(snapshot -> 'sessions', '[]'::jsonb)) as session_item
  cross join lateral jsonb_array_elements_text(coalesce(session_item -> 'studentIds', '[]'::jsonb)) as student_id(value)
  join public.lesson_sessions as session_row on session_row.id = (session_item ->> 'id')::bigint
  join public.students as student_row on student_row.id = student_id.value::bigint
  on conflict (session_id, student_id) do update
    set paid_cash = excluded.paid_cash,
        attended_at = excluded.attended_at;

  delete from public.student_debt_payments where true;

  insert into public.student_debt_payments (id, session_id, student_id, amount, paid_at, note)
  overriding system value
  select (item ->> 'id')::bigint,
         (item ->> 'sessionId')::bigint,
         (item ->> 'studentId')::bigint,
         (item ->> 'amount')::numeric,
         coalesce((item ->> 'date')::date, current_date),
         nullif(item ->> 'note', '')
  from jsonb_array_elements(coalesce(snapshot -> 'debtPayments', '[]'::jsonb)) as item
  join public.lesson_sessions as session_row on session_row.id = (item ->> 'sessionId')::bigint
  join public.students as student_row on student_row.id = (item ->> 'studentId')::bigint;

  perform setval(
    pg_get_serial_sequence('public.student_debt_payments', 'id'),
    coalesce((select max(id) from public.student_debt_payments), 1),
    exists(select 1 from public.student_debt_payments)
  );

  -- Keep direct database inserts aligned with the public ID rule as well.
  if not exists (select 1 from public.students) then
    perform setval(pg_get_serial_sequence('public.students', 'id'), 99, true);
  elsif (select max(id) from public.students) < 100 then
    perform setval(pg_get_serial_sequence('public.students', 'id'), 99, true);
  end if;

  return new;
end;
$$;

drop trigger if exists zz_center_state_sync_payments on public.center_state;
create trigger zz_center_state_sync_payments
after insert or update of data on public.center_state
for each row execute function public.sync_center_state_payments();

drop view if exists public.session_financial_summary;
create view public.session_financial_summary as
select
  s.id,
  s.status,
  count(a.id)::integer as attendance_count,
  count(a.id) * s.student_price_snapshot as gross_value,
  coalesce(sum(a.paid_cash), 0) as collected_cash,
  count(a.id) * s.student_price_snapshot - coalesce(sum(a.paid_cash), 0) as shortages,
  count(a.id) * s.teacher_fee_snapshot as teacher_due,
  coalesce(sum(a.paid_cash), 0) - count(a.id) * s.teacher_fee_snapshot as center_net_profit
from public.lesson_sessions s
left join public.session_attendance a on a.session_id = s.id
group by s.id;

-- Four characters is the single-admin minimum chosen for this installation.
create or replace function public.recover_admin_password(p_username text, p_recovery_code text, p_new_password text)
returns table (id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
declare
  recovered_id uuid;
begin
  if char_length(p_recovery_code) < 16 or char_length(p_new_password) < 4 then
    return;
  end if;

  update public.admin_accounts as account
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12)),
      password_salt = 'pgcrypto-bcrypt',
      password_iterations = 100000,
      updated_at = now()
  where account.active
    and account.username = p_username::citext
    and account.recovery_hash is not null
    and account.recovery_hash = extensions.crypt(p_recovery_code, account.recovery_hash)
  returning account.id into recovered_id;

  if recovered_id is null then
    return;
  end if;

  return query
  select account.id, account.username::text
  from public.admin_accounts as account
  where account.id = recovered_id
  limit 1;
end;
$$;

revoke all on function public.recover_admin_password(text, text, text) from public, anon, authenticated;
grant execute on function public.recover_admin_password(text, text, text) to service_role;

-- Backfill the existing snapshot without changing its version number.
update public.center_state set data = data where id = 1;

