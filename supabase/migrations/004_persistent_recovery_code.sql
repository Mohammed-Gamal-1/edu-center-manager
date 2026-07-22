-- Keep the emergency recovery code valid until the administrator explicitly
-- generates a replacement. It acts as a long-lived backup key.
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
