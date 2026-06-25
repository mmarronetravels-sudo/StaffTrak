-- 040_profiles_employment_status.sql
-- Probationary vs. permanent staff status.
--
-- Design (Session 67+, per Melanie):
--   * profiles.hire_date already exists and is populated for 74/78 staff.
--   * Add an explicit OVERRIDE column `employment_status`.
--   * Effective status = override when set; otherwise DERIVE from hire_date
--     using a 3-year rule: probationary for the first 3 years of service,
--     permanent thereafter. NULL hire_date + no override = unknown.
--   * Editable by admins/HR (same tenant) AND a staff member's assigned
--     evaluator (profiles.evaluator_id), via a SECURITY DEFINER RPC.
--
-- Pure additive migration. Safe to re-run (idempotent where practical).

begin;

-- 1. Override column. NULL means "no override -> derive from hire_date".
alter table public.profiles
  add column if not exists employment_status text;

alter table public.profiles
  drop constraint if exists profiles_employment_status_check;
alter table public.profiles
  add constraint profiles_employment_status_check
  check (employment_status in ('probationary', 'permanent'));

comment on column public.profiles.employment_status is
  'Explicit probationary/permanent override. NULL = derive from hire_date via effective_employment_status() (3-year rule).';

-- 2. Resolver used by the app/reports. Override wins; else 3-year hire_date
--    rule; else NULL (unknown). STABLE (depends on current_date), not IMMUTABLE,
--    so it cannot back a generated column - callers compute it on read.
create or replace function public.effective_employment_status(
  p_hire_date date,
  p_employment_status text
) returns text
language sql
stable
as $$
  select case
    when p_employment_status is not null then p_employment_status
    when p_hire_date is null then null
    when p_hire_date > (current_date - interval '3 years') then 'probationary'
    else 'permanent'
  end;
$$;

comment on function public.effective_employment_status(date, text) is
  'Resolves probationary/permanent: override wins, else first-3-years-of-service rule from hire_date.';

-- 3. RPC to set or clear the override.
--    Authorized: admin/HR in the target''s tenant, OR the assigned evaluator.
--    SECURITY DEFINER so an evaluator (who has no direct UPDATE policy on
--    other profiles) can set this one field through a controlled path.
create or replace function public.set_employment_status(
  p_staff_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := auth.uid();
  v_allowed boolean;
begin
  if p_status is not null and p_status not in ('probationary', 'permanent') then
    raise exception 'invalid employment_status: %', p_status
      using errcode = '22023';
  end if;

  select
    (public.is_admin_hr() and p.tenant_id = public.get_my_tenant_id())
    or (p.evaluator_id = v_caller)
  into v_allowed
  from public.profiles p
  where p.id = p_staff_id;

  if v_allowed is distinct from true then
    raise exception 'not authorized to set employment status for %', p_staff_id
      using errcode = '42501';
  end if;

  update public.profiles
    set employment_status = p_status
    where id = p_staff_id;
end;
$$;

comment on function public.set_employment_status(uuid, text) is
  'Set/clear probationary|permanent override. Allowed for admin/HR (same tenant) or the staff member''s assigned evaluator.';

grant execute on function public.effective_employment_status(date, text) to authenticated;
grant execute on function public.set_employment_status(uuid, text) to authenticated;

commit;
