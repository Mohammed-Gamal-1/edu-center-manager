-- El Tafawoq Center cloud database schema for Supabase PostgreSQL.
-- The browser never receives the service-role key. All writes go through the app backend.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  username citext not null unique,
  password_hash text not null,
  password_salt text not null,
  password_iterations integer not null default 310000 check (password_iterations >= 100000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order smallint not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages(id),
  name text not null,
  sort_order smallint not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (stage_id, name)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages(id),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (stage_id, name)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.students (
  id bigint generated always as identity primary key,
  full_name text not null check (char_length(trim(full_name)) >= 3),
  phone text not null,
  grade_id uuid not null references public.grades(id),
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index students_name_search_idx on public.students using gin (to_tsvector('simple', full_name));
create index students_phone_idx on public.students(phone);
create index students_grade_idx on public.students(grade_id);

create table public.teachers (
  id bigint generated always as identity primary key,
  full_name text not null check (char_length(trim(full_name)) >= 3),
  phone text not null,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index teachers_name_search_idx on public.teachers using gin (to_tsvector('simple', full_name));

create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id bigint not null references public.teachers(id),
  grade_id uuid not null references public.grades(id),
  subject_id uuid not null references public.subjects(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (teacher_id, grade_id, subject_id)
);

create table public.price_rules (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.grades(id),
  subject_id uuid not null references public.subjects(id),
  student_price numeric(12,2) not null check (student_price >= 0),
  teacher_fee_per_student numeric(12,2) not null check (teacher_fee_per_student >= 0),
  effective_from date not null default current_date,
  effective_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (teacher_fee_per_student <= student_price),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index one_active_price_per_grade_subject
  on public.price_rules (grade_id, subject_id)
  where active = true;

create table public.advance_bookings (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id),
  teacher_id bigint not null references public.teachers(id),
  grade_id uuid not null references public.grades(id),
  subject_id uuid not null references public.subjects(id),
  booking_fee numeric(12,2) not null default 0 check (booking_fee >= 0),
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, teacher_id, grade_id, subject_id)
);

create type public.session_status as enum ('scheduled', 'active', 'postponed', 'ended', 'cancelled');

create table public.lesson_sessions (
  id bigint generated always as identity primary key,
  teacher_id bigint not null references public.teachers(id),
  grade_id uuid not null references public.grades(id),
  subject_id uuid not null references public.subjects(id),
  room_id uuid not null references public.rooms(id),
  scheduled_at timestamptz not null,
  started_at timestamptz,
  ended_at timestamptz,
  status public.session_status not null default 'scheduled',
  student_price_snapshot numeric(12,2) not null check (student_price_snapshot >= 0),
  teacher_fee_snapshot numeric(12,2) not null check (teacher_fee_snapshot >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (teacher_fee_snapshot <= student_price_snapshot),
  check (ended_at is null or started_at is not null),
  check (ended_at is null or ended_at >= started_at)
);

create index lesson_sessions_date_idx on public.lesson_sessions(scheduled_at desc);
create index lesson_sessions_teacher_idx on public.lesson_sessions(teacher_id, scheduled_at);
create index lesson_sessions_room_idx on public.lesson_sessions(room_id, scheduled_at);
create index lesson_sessions_status_idx on public.lesson_sessions(status);

-- Defense in depth: exact-time bookings cannot share a room, and a room can
-- never contain two active sessions even when they were scheduled differently.
create unique index no_room_double_booking
  on public.lesson_sessions (room_id, scheduled_at)
  where status in ('scheduled', 'active', 'postponed');

create unique index one_active_session_per_room
  on public.lesson_sessions (room_id)
  where status = 'active';

create table public.session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id bigint not null references public.lesson_sessions(id),
  student_id bigint not null references public.students(id),
  paid_cash numeric(12,2) not null check (paid_cash >= 0),
  attended_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create index session_attendance_student_idx on public.session_attendance(student_id, attended_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references public.admin_accounts(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log(created_at desc);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger students_touch_updated_at before update on public.students
for each row execute function public.touch_updated_at();
create trigger teachers_touch_updated_at before update on public.teachers
for each row execute function public.touch_updated_at();
create trigger lesson_sessions_touch_updated_at before update on public.lesson_sessions
for each row execute function public.touch_updated_at();
create trigger admin_accounts_touch_updated_at before update on public.admin_accounts
for each row execute function public.touch_updated_at();

create or replace view public.session_financial_summary as
select
  s.id,
  s.status,
  count(a.id)::integer as attendance_count,
  count(a.id) * s.student_price_snapshot as gross_value,
  count(a.id) * s.teacher_fee_snapshot as teacher_due,
  count(a.id) * (s.student_price_snapshot - s.teacher_fee_snapshot) as center_net_profit
from public.lesson_sessions s
left join public.session_attendance a on a.session_id = s.id
group by s.id;

-- The application backend uses the service role. The public anon role gets no table policy.
alter table public.admin_accounts enable row level security;
alter table public.stages enable row level security;
alter table public.grades enable row level security;
alter table public.subjects enable row level security;
alter table public.rooms enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.price_rules enable row level security;
alter table public.advance_bookings enable row level security;
alter table public.lesson_sessions enable row level security;
alter table public.session_attendance enable row level security;
alter table public.audit_log enable row level security;

insert into public.rooms (name) values ('قاعة 1'), ('قاعة 2'), ('قاعة 3'), ('قاعة 4'), ('قاعة 5')
on conflict (name) do nothing;

insert into public.stages (name, sort_order) values
  ('المرحلة الابتدائية', 1),
  ('المرحلة الإعدادية', 2),
  ('المرحلة الثانوية', 3)
on conflict (name) do update set sort_order = excluded.sort_order;

insert into public.grades (stage_id, name, sort_order)
select s.id, g.name, g.sort_order
from public.stages s
join (values
  ('المرحلة الابتدائية', 'الصف الأول', 1),
  ('المرحلة الابتدائية', 'الصف الثاني', 2),
  ('المرحلة الابتدائية', 'الصف الثالث', 3),
  ('المرحلة الابتدائية', 'الصف الرابع', 4),
  ('المرحلة الابتدائية', 'الصف الخامس', 5),
  ('المرحلة الابتدائية', 'الصف السادس', 6),
  ('المرحلة الإعدادية', 'الصف الأول', 1),
  ('المرحلة الإعدادية', 'الصف الثاني', 2),
  ('المرحلة الإعدادية', 'الصف الثالث', 3),
  ('المرحلة الثانوية', 'الصف الأول', 1),
  ('المرحلة الثانوية', 'الصف الثاني', 2),
  ('المرحلة الثانوية', 'الصف الثالث', 3)
) as g(stage_name, name, sort_order) on g.stage_name = s.name
on conflict (stage_id, name) do update set sort_order = excluded.sort_order;

insert into public.subjects (stage_id, name)
select s.id, subject.name
from public.stages s
join (values
  ('المرحلة الابتدائية', 'اللغة العربية'),
  ('المرحلة الابتدائية', 'اللغة الإنجليزية'),
  ('المرحلة الابتدائية', 'الرياضيات'),
  ('المرحلة الابتدائية', 'العلوم'),
  ('المرحلة الابتدائية', 'الدراسات الاجتماعية'),
  ('المرحلة الإعدادية', 'اللغة العربية'),
  ('المرحلة الإعدادية', 'اللغة الإنجليزية'),
  ('المرحلة الإعدادية', 'الرياضيات'),
  ('المرحلة الإعدادية', 'العلوم'),
  ('المرحلة الإعدادية', 'الدراسات الاجتماعية'),
  ('المرحلة الثانوية', 'اللغة العربية'),
  ('المرحلة الثانوية', 'اللغة الإنجليزية'),
  ('المرحلة الثانوية', 'الرياضيات'),
  ('المرحلة الثانوية', 'الفيزياء'),
  ('المرحلة الثانوية', 'الكيمياء'),
  ('المرحلة الثانوية', 'الأحياء'),
  ('المرحلة الثانوية', 'التاريخ'),
  ('المرحلة الثانوية', 'الجغرافيا')
) as subject(stage_name, name) on subject.stage_name = s.name
on conflict (stage_id, name) do nothing;
