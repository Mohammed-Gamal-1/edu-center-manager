-- Keep the normalized Supabase tables in sync with the atomic operational
-- snapshot. The snapshot remains the offline-safe source of truth while every
-- entity is also queryable from its dedicated relational table.

create unique index if not exists audit_log_center_state_event_unique
  on public.audit_log (entity_type, entity_id)
  where entity_type = 'center_state';

create or replace function public.sync_center_state_to_relational()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot jsonb := new.data;
begin
  -- Stages and the editable subject catalog.
  insert into public.stages (name, sort_order, active)
  select catalog.key,
         case catalog.key
           when 'المرحلة الابتدائية' then 1
           when 'المرحلة الإعدادية' then 2
           when 'المرحلة الثانوية' then 3
           else 99
         end,
         true
  from jsonb_each(coalesce(snapshot -> 'subjectCatalog', '{}'::jsonb)) as catalog
  on conflict (name) do update set active = true, sort_order = excluded.sort_order;

  insert into public.subjects (stage_id, name, active)
  select stage_row.id, subject_name.value, true
  from jsonb_each(coalesce(snapshot -> 'subjectCatalog', '{}'::jsonb)) as catalog
  join public.stages as stage_row on stage_row.name = catalog.key
  cross join lateral jsonb_array_elements_text(catalog.value) as subject_name(value)
  on conflict (stage_id, name) do update set active = true;

  -- Ensure every grade referenced anywhere in the operational state exists.
  with grade_refs as (
    select item ->> 'stage' as stage_name, item ->> 'grade' as grade_name
    from jsonb_array_elements(coalesce(snapshot -> 'students', '[]'::jsonb)) as item
    union
    select assignment ->> 'stage', assignment ->> 'grade'
    from jsonb_array_elements(coalesce(snapshot -> 'teachers', '[]'::jsonb)) as teacher
    cross join lateral jsonb_array_elements(coalesce(teacher -> 'assignments', '[]'::jsonb)) as assignment
    union
    select item ->> 'stage', item ->> 'grade'
    from jsonb_array_elements(coalesce(snapshot -> 'pricing', '[]'::jsonb)) as item
    union
    select item ->> 'stage', item ->> 'grade'
    from jsonb_array_elements(coalesce(snapshot -> 'bookings', '[]'::jsonb)) as item
    union
    select item ->> 'stage', item ->> 'grade'
    from jsonb_array_elements(coalesce(snapshot -> 'sessions', '[]'::jsonb)) as item
  )
  insert into public.grades (stage_id, name, sort_order, active)
  select stage_row.id,
         grade_refs.grade_name,
         case grade_refs.grade_name
           when 'الصف الأول' then 1
           when 'الصف الثاني' then 2
           when 'الصف الثالث' then 3
           when 'الصف الرابع' then 4
           when 'الصف الخامس' then 5
           when 'الصف السادس' then 6
           else 99
         end,
         true
  from grade_refs
  join public.stages as stage_row on stage_row.name = grade_refs.stage_name
  where nullif(grade_refs.grade_name, '') is not null
  on conflict (stage_id, name) do update set active = true, sort_order = excluded.sort_order;

  -- Rooms remain addressable even after removal so historical references stay valid.
  -- Supabase's Data API enables a safe-update guard, so even an intentional
  -- whole-table refresh must carry an explicit predicate.
  update public.rooms set active = false where true;
  insert into public.rooms (name, active)
  select room_name.value, true
  from jsonb_array_elements_text(coalesce(snapshot -> 'rooms', '[]'::jsonb)) as room_name(value)
  on conflict (name) do update set active = true;

  -- Students keep the same numeric IDs shown in the application.
  insert into public.students (id, full_name, phone, grade_id, active, archived_at)
  overriding system value
  select (item ->> 'id')::bigint,
         item ->> 'name',
         item ->> 'phone',
         grade_row.id,
         coalesce((item ->> 'active')::boolean, true),
         case when coalesce((item ->> 'active')::boolean, true) then null else now() end
  from jsonb_array_elements(coalesce(snapshot -> 'students', '[]'::jsonb)) as item
  join public.stages as stage_row on stage_row.name = item ->> 'stage'
  join public.grades as grade_row on grade_row.stage_id = stage_row.id and grade_row.name = item ->> 'grade'
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        grade_id = excluded.grade_id,
        active = excluded.active,
        archived_at = excluded.archived_at,
        updated_at = now();

  -- Teachers and all of their stage/grade/subject assignments.
  insert into public.teachers (id, full_name, phone, active, archived_at)
  overriding system value
  select (item ->> 'id')::bigint,
         item ->> 'name',
         item ->> 'phone',
         coalesce((item ->> 'active')::boolean, true),
         case when coalesce((item ->> 'active')::boolean, true) then null else now() end
  from jsonb_array_elements(coalesce(snapshot -> 'teachers', '[]'::jsonb)) as item
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        active = excluded.active,
        archived_at = excluded.archived_at,
        updated_at = now();

  delete from public.teacher_assignments where true;
  insert into public.teacher_assignments (teacher_id, grade_id, subject_id, active)
  select (teacher ->> 'id')::bigint,
         grade_row.id,
         subject_row.id,
         true
  from jsonb_array_elements(coalesce(snapshot -> 'teachers', '[]'::jsonb)) as teacher
  cross join lateral jsonb_array_elements(coalesce(teacher -> 'assignments', '[]'::jsonb)) as assignment
  join public.stages as stage_row on stage_row.name = assignment ->> 'stage'
  join public.grades as grade_row on grade_row.stage_id = stage_row.id and grade_row.name = assignment ->> 'grade'
  join public.subjects as subject_row on subject_row.stage_id = stage_row.id and subject_row.name = assignment ->> 'subject'
  on conflict (teacher_id, grade_id, subject_id) do update set active = true;

  -- Price rules are relational while lesson sessions retain their own price snapshots.
  insert into public.price_rules (grade_id, subject_id, student_price, teacher_fee_per_student, effective_from, effective_to, active)
  select grade_row.id,
         subject_row.id,
         (item ->> 'studentPrice')::numeric,
         (item ->> 'teacherFee')::numeric,
         current_date,
         null,
         true
  from jsonb_array_elements(coalesce(snapshot -> 'pricing', '[]'::jsonb)) as item
  join public.stages as stage_row on stage_row.name = item ->> 'stage'
  join public.grades as grade_row on grade_row.stage_id = stage_row.id and grade_row.name = item ->> 'grade'
  join public.subjects as subject_row on subject_row.stage_id = stage_row.id and subject_row.name = item ->> 'subject'
  on conflict (grade_id, subject_id) where active = true do update
    set student_price = excluded.student_price,
        teacher_fee_per_student = excluded.teacher_fee_per_student,
        effective_to = null;

  update public.price_rules as rule
  set active = false, effective_to = current_date
  where rule.active
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(snapshot -> 'pricing', '[]'::jsonb)) as item
      join public.stages as stage_row on stage_row.name = item ->> 'stage'
      join public.grades as grade_row on grade_row.stage_id = stage_row.id and grade_row.name = item ->> 'grade'
      join public.subjects as subject_row on subject_row.stage_id = stage_row.id and subject_row.name = item ->> 'subject'
      where grade_row.id = rule.grade_id and subject_row.id = rule.subject_id
    );

  -- Advance bookings, including their fee and archive state.
  insert into public.advance_bookings (id, student_id, teacher_id, grade_id, subject_id, booking_fee, active, archived_at, created_at)
  overriding system value
  select (item ->> 'id')::bigint,
         (item ->> 'studentId')::bigint,
         (item ->> 'teacherId')::bigint,
         grade_row.id,
         subject_row.id,
         coalesce((item ->> 'bookingFee')::numeric, 0),
         coalesce((item ->> 'active')::boolean, true),
         case when coalesce((item ->> 'active')::boolean, true) then null else now() end,
         coalesce((item ->> 'createdAt')::date, current_date)::timestamptz
  from jsonb_array_elements(coalesce(snapshot -> 'bookings', '[]'::jsonb)) as item
  join public.stages as stage_row on stage_row.name = item ->> 'stage'
  join public.grades as grade_row on grade_row.stage_id = stage_row.id and grade_row.name = item ->> 'grade'
  join public.subjects as subject_row on subject_row.stage_id = stage_row.id and subject_row.name = item ->> 'subject'
  on conflict (id) do update
    set student_id = excluded.student_id,
        teacher_id = excluded.teacher_id,
        grade_id = excluded.grade_id,
        subject_id = excluded.subject_id,
        booking_fee = excluded.booking_fee,
        active = excluded.active,
        archived_at = excluded.archived_at;

  -- Lesson lifecycle, price snapshots, room, and timestamps.
  insert into public.lesson_sessions (
    id, teacher_id, grade_id, subject_id, room_id, scheduled_at, started_at,
    ended_at, status, student_price_snapshot, teacher_fee_snapshot
  )
  overriding system value
  select (item ->> 'id')::bigint,
         (item ->> 'teacherId')::bigint,
         grade_row.id,
         subject_row.id,
         room_row.id,
         ((item ->> 'date') || ' ' || (item ->> 'scheduledTime'))::timestamp at time zone 'Africa/Cairo',
         case when nullif(item ->> 'startedAt', '') is null then null
              else ((item ->> 'date') || ' ' || (item ->> 'startedAt'))::timestamp at time zone 'Africa/Cairo' end,
         case when nullif(item ->> 'endedAt', '') is null then null
              else ((item ->> 'date') || ' ' || (item ->> 'endedAt'))::timestamp at time zone 'Africa/Cairo' end,
         (item ->> 'status')::public.session_status,
         coalesce((item ->> 'studentPrice')::numeric, 0),
         coalesce((item ->> 'teacherFee')::numeric, 0)
  from jsonb_array_elements(coalesce(snapshot -> 'sessions', '[]'::jsonb)) as item
  join public.stages as stage_row on stage_row.name = item ->> 'stage'
  join public.grades as grade_row on grade_row.stage_id = stage_row.id and grade_row.name = item ->> 'grade'
  join public.subjects as subject_row on subject_row.stage_id = stage_row.id and subject_row.name = item ->> 'subject'
  join public.rooms as room_row on room_row.name = item ->> 'room'
  on conflict (id) do update
    set teacher_id = excluded.teacher_id,
        grade_id = excluded.grade_id,
        subject_id = excluded.subject_id,
        room_id = excluded.room_id,
        scheduled_at = excluded.scheduled_at,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        status = excluded.status,
        student_price_snapshot = excluded.student_price_snapshot,
        teacher_fee_snapshot = excluded.teacher_fee_snapshot,
        updated_at = now();

  -- Attendance is rebuilt from the authoritative list on every snapshot save.
  delete from public.session_attendance where true;
  insert into public.session_attendance (session_id, student_id, paid_cash, attended_at)
  select (session_item ->> 'id')::bigint,
         student_id.value::bigint,
         coalesce((session_item ->> 'studentPrice')::numeric, 0),
         coalesce(session_row.started_at, session_row.scheduled_at)
  from jsonb_array_elements(coalesce(snapshot -> 'sessions', '[]'::jsonb)) as session_item
  cross join lateral jsonb_array_elements_text(coalesce(session_item -> 'studentIds', '[]'::jsonb)) as student_id(value)
  join public.lesson_sessions as session_row on session_row.id = (session_item ->> 'id')::bigint
  join public.students as student_row on student_row.id = student_id.value::bigint
  on conflict (session_id, student_id) do update
    set paid_cash = excluded.paid_cash,
        attended_at = excluded.attended_at;

  -- Center expenses.
  insert into public.center_expenses (id, category, amount, expense_date, description)
  overriding system value
  select (item ->> 'id')::bigint,
         item ->> 'category',
         (item ->> 'amount')::numeric,
         (item ->> 'date')::date,
         item ->> 'description'
  from jsonb_array_elements(coalesce(snapshot -> 'expenses', '[]'::jsonb)) as item
  on conflict (id) do update
    set category = excluded.category,
        amount = excluded.amount,
        expense_date = excluded.expense_date,
        description = excluded.description,
        updated_at = now();

  -- Application audit entries retain their numeric timestamp ID as entity_id.
  insert into public.audit_log (action, entity_type, entity_id, new_values, created_at)
  select item ->> 'action',
         'center_state',
         item ->> 'id',
         jsonb_build_object('details', item ->> 'details', 'tone', item ->> 'tone', 'time', item ->> 'time'),
         now()
  from jsonb_array_elements(coalesce(snapshot -> 'audit', '[]'::jsonb)) as item
  on conflict (entity_type, entity_id) where entity_type = 'center_state' do update
    set action = excluded.action,
        new_values = excluded.new_values;

  -- Remove records that the authoritative state deleted, after dependants sync.
  delete from public.advance_bookings as booking
  where not exists (
    select 1 from jsonb_array_elements(coalesce(snapshot -> 'bookings', '[]'::jsonb)) as item
    where (item ->> 'id')::bigint = booking.id
  );

  delete from public.lesson_sessions as lesson
  where not exists (
    select 1 from jsonb_array_elements(coalesce(snapshot -> 'sessions', '[]'::jsonb)) as item
    where (item ->> 'id')::bigint = lesson.id
  );

  delete from public.center_expenses as expense
  where not exists (
    select 1 from jsonb_array_elements(coalesce(snapshot -> 'expenses', '[]'::jsonb)) as item
    where (item ->> 'id')::bigint = expense.id
  );

  delete from public.students as student
  where not exists (
    select 1 from jsonb_array_elements(coalesce(snapshot -> 'students', '[]'::jsonb)) as item
    where (item ->> 'id')::bigint = student.id
  );

  delete from public.teachers as teacher
  where not exists (
    select 1 from jsonb_array_elements(coalesce(snapshot -> 'teachers', '[]'::jsonb)) as item
    where (item ->> 'id')::bigint = teacher.id
  );

  delete from public.audit_log as log
  where log.entity_type = 'center_state'
    and not exists (
      select 1 from jsonb_array_elements(coalesce(snapshot -> 'audit', '[]'::jsonb)) as item
      where item ->> 'id' = log.entity_id
    );

  -- Keep identity sequences ahead of the numeric IDs used by the application.
  perform setval(pg_get_serial_sequence('public.students', 'id'), coalesce((select max(id) from public.students), 1), exists(select 1 from public.students));
  perform setval(pg_get_serial_sequence('public.teachers', 'id'), coalesce((select max(id) from public.teachers), 1), exists(select 1 from public.teachers));
  perform setval(pg_get_serial_sequence('public.advance_bookings', 'id'), coalesce((select max(id) from public.advance_bookings), 1), exists(select 1 from public.advance_bookings));
  perform setval(pg_get_serial_sequence('public.lesson_sessions', 'id'), coalesce((select max(id) from public.lesson_sessions), 1), exists(select 1 from public.lesson_sessions));
  perform setval(pg_get_serial_sequence('public.center_expenses', 'id'), coalesce((select max(id) from public.center_expenses), 1), exists(select 1 from public.center_expenses));

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'center_state_sync_relational'
  ) then
    create trigger center_state_sync_relational
    after insert or update of data on public.center_state
    for each row execute function public.sync_center_state_to_relational();
  end if;
end;
$$;

-- Backfill the current operational state immediately when this migration runs.
update public.center_state set data = data where id = 1;
