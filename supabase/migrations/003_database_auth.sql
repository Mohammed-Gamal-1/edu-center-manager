-- Password verification stays inside PostgreSQL using pgcrypto bcrypt.
-- Only the service role used by the application backend can execute these functions.

alter table public.admin_accounts
  add column if not exists recovery_hash text,
  add column if not exists recovery_updated_at timestamptz;

create or replace function public.verify_admin_credentials(p_username text, p_password text)
returns table (id uuid, username text)
language sql
stable
security definer
set search_path = public
as $$
  select account.id, account.username::text
  from public.admin_accounts as account
  where account.active
    and account.username = p_username::citext
    and account.password_hash = extensions.crypt(p_password, account.password_hash)
  limit 1;
$$;

create or replace function public.bootstrap_admin_account(p_username text, p_password text)
returns table (id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_username <> 'admin' or p_password <> '12345678' then
    return;
  end if;

  insert into public.admin_accounts (username, password_hash, password_salt, password_iterations, active)
  select p_username, extensions.crypt(p_password, extensions.gen_salt('bf', 12)), 'pgcrypto-bcrypt', 100000, true
  where not exists (select 1 from public.admin_accounts);

  return query
  select account.id, account.username::text
  from public.admin_accounts as account
  where account.active
    and account.username = p_username::citext
    and account.password_hash = extensions.crypt(p_password, account.password_hash)
  limit 1;
end;
$$;

create or replace function public.update_admin_credentials(p_admin_id uuid, p_username text, p_new_password text default null)
returns table (id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_accounts as account
  set username = p_username::citext,
      password_hash = case when nullif(p_new_password, '') is null then account.password_hash else extensions.crypt(p_new_password, extensions.gen_salt('bf', 12)) end,
      password_salt = case when nullif(p_new_password, '') is null then account.password_salt else 'pgcrypto-bcrypt' end,
      password_iterations = case when nullif(p_new_password, '') is null then account.password_iterations else 100000 end,
      updated_at = now()
  where account.id = p_admin_id
    and account.active;

  return query
  select account.id, account.username::text
  from public.admin_accounts as account
  where account.id = p_admin_id
    and account.active;
end;
$$;

create or replace function public.set_admin_recovery_code(p_admin_id uuid, p_recovery_code text)
returns table (id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(p_recovery_code) < 16 then
    return;
  end if;

  update public.admin_accounts as account
  set recovery_hash = extensions.crypt(p_recovery_code, extensions.gen_salt('bf', 12)),
      recovery_updated_at = now(),
      updated_at = now()
  where account.id = p_admin_id
    and account.active;

  return query
  select account.id, account.username::text
  from public.admin_accounts as account
  where account.id = p_admin_id
    and account.active;
end;
$$;

create or replace function public.recover_admin_password(p_username text, p_recovery_code text, p_new_password text)
returns table (id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
declare
  recovered_id uuid;
begin
  if char_length(p_recovery_code) < 16 or char_length(p_new_password) < 8 then
    return;
  end if;

  update public.admin_accounts as account
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12)),
      password_salt = 'pgcrypto-bcrypt',
      password_iterations = 100000,
      recovery_hash = null,
      recovery_updated_at = null,
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

revoke all on function public.verify_admin_credentials(text, text) from public, anon, authenticated;
revoke all on function public.bootstrap_admin_account(text, text) from public, anon, authenticated;
revoke all on function public.update_admin_credentials(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_admin_recovery_code(uuid, text) from public, anon, authenticated;
revoke all on function public.recover_admin_password(text, text, text) from public, anon, authenticated;

grant execute on function public.verify_admin_credentials(text, text) to service_role;
grant execute on function public.bootstrap_admin_account(text, text) to service_role;
grant execute on function public.update_admin_credentials(uuid, text, text) to service_role;
grant execute on function public.set_admin_recovery_code(uuid, text) to service_role;
grant execute on function public.recover_admin_password(text, text, text) to service_role;
