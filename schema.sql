-- Route42 — Supabase Schema
-- Supabase → SQL Editor に全部貼って実行する。何度実行しても安全（既にある表・関数はそのまま／置き換え）。
--
-- 書き込みはすべて関数（rpc）経由。関数の中で権限を確認し、履歴（logs）を同じ処理で残す。
-- 表への直接の書き込みは許可しない。
-- 一般向けは get_public_status()（入力者名なし）だけを匿名で呼べる。

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 表
-- ---------------------------------------------------------------------------

-- 職員名簿（ログインに使うメールアドレスで登録する）
create table if not exists staff (
    email text primary key check (email = lower(email) and position('@' in email) > 1),
    name text not null check (char_length(name) between 1 and 40),
    role text not null check (role in ('owner', 'staff')),
    created_at timestamptz not null default now()
);

-- 全体の状況（1行だけ）
create table if not exists status (
    id int primary key default 1 check (id = 1),
    mode text not null default 'normal' check (mode in ('normal', 'launch')),
    launch_state text not null default 'scheduled'
        check (launch_state in ('scheduled', 'countdown', 'delayed', 'scrubbed', 'launched')),
    launch_time text not null default ''
        check (launch_time = '' or launch_time ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
    launch_note text not null default '' check (char_length(launch_note) <= 80),
    notice_text text check (notice_text is null or char_length(notice_text) between 1 and 500),
    notice_at timestamptz,
    notice_by text,
    updated_at timestamptz not null default now()
);
insert into status (id) values (1) on conflict (id) do nothing;

-- スポットの混雑度（0:空き 1:普通 2:やや混雑 3:混雑・満員）
create table if not exists spot_levels (
    spot_id text primary key check (spot_id ~ '^[a-z0-9-]{1,64}$'),
    level smallint not null check (level between 0 and 3),
    updated_at timestamptz not null default now(),
    updated_by text not null
);

-- 道路の状況（区間×方向。0:順調 1:混雑 2:渋滞 3:通行止め）。road_key = <区間ID>__<方向番号>
create table if not exists road_levels (
    road_key text primary key check (road_key ~ '^[a-z0-9-]{1,64}__[01]$'),
    level smallint not null check (level between 0 and 3),
    updated_at timestamptz not null default now(),
    updated_by text not null
);

-- 現場報告（職員のみ閲覧）
create table if not exists reports (
    id uuid primary key default gen_random_uuid(),
    text text not null check (char_length(text) between 1 and 300),
    lng double precision check (lng between -180 and 180),
    lat double precision check (lat between -90 and 90),
    created_by text not null,
    created_at timestamptz not null default now(),
    resolved boolean not null default false,
    resolved_by text,
    resolved_at timestamptz
);
create index if not exists reports_open_idx on reports (created_at desc) where not resolved;

-- 入力履歴（追記のみ）
create table if not exists logs (
    id bigint generated always as identity primary key,
    at timestamptz not null default now(),
    actor text not null,
    action text not null,
    target text not null default '',
    value text not null default ''
);
create index if not exists logs_at_idx on logs (at desc);

-- ---------------------------------------------------------------------------
-- 権限の判定
-- ---------------------------------------------------------------------------

create or replace function current_email() returns text
language sql stable as $$
    select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from staff where email = current_email())
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from staff where email = current_email() and role = 'owner')
$$;

-- 職員でなければ例外。職員なら名簿の行を返す
create or replace function require_staff(p_owner boolean default false) returns staff
language plpgsql stable security definer set search_path = public as $$
declare
    s staff;
begin
    select * into s from staff where email = current_email();
    if s.email is null then
        raise exception '権限がありません' using errcode = '42501';
    end if;
    if p_owner and s.role <> 'owner' then
        raise exception 'オーナーのみ操作できます' using errcode = '42501';
    end if;
    return s;
end;
$$;

create or replace function touch_status_and_log(p_actor text, p_action text, p_target text, p_value text) returns void
language sql security definer set search_path = public as $$
    update status set updated_at = now() where id = 1;
    insert into logs (actor, action, target, value) values (p_actor, p_action, coalesce(p_target, ''), coalesce(p_value, ''));
$$;

-- ---------------------------------------------------------------------------
-- 書き込み（職員）
-- ---------------------------------------------------------------------------

create or replace function set_spot_level(p_spot text, p_level int) returns void
language plpgsql security definer set search_path = public as $$
declare
    s staff := require_staff();
begin
    if p_level is null or p_level not between 0 and 3 then
        raise exception '不正な値です' using errcode = '22023';
    end if;
    insert into spot_levels (spot_id, level, updated_at, updated_by)
    values (p_spot, p_level, now(), s.name)
    on conflict (spot_id) do update
        set level = excluded.level, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
    perform touch_status_and_log(s.name, 'level', p_spot, p_level::text);
end;
$$;

create or replace function set_road_level(p_road text, p_dir int, p_level int) returns void
language plpgsql security definer set search_path = public as $$
declare
    s staff := require_staff();
    k text := p_road || '__' || p_dir;
begin
    if p_level is null or p_level not between 0 and 3 or p_dir is null or p_dir not in (0, 1) then
        raise exception '不正な値です' using errcode = '22023';
    end if;
    insert into road_levels (road_key, level, updated_at, updated_by)
    values (k, p_level, now(), s.name)
    on conflict (road_key) do update
        set level = excluded.level, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
    perform touch_status_and_log(s.name, 'road', k, p_level::text);
end;
$$;

-- 空文字で消去
create or replace function set_notice(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
    s staff := require_staff();
    t text := nullif(btrim(coalesce(p_text, '')), '');
begin
    update status
       set notice_text = t,
           notice_at = case when t is null then null else now() end,
           notice_by = case when t is null then null else s.name end
     where id = 1;
    perform touch_status_and_log(s.name, 'notice', '', coalesce(t, ''));
end;
$$;

create or replace function add_report(p_text text, p_lng double precision, p_lat double precision) returns void
language plpgsql security definer set search_path = public as $$
declare
    s staff := require_staff();
    t text := btrim(coalesce(p_text, ''));
begin
    insert into reports (text, lng, lat, created_by) values (t, p_lng, p_lat, s.name);
    insert into logs (actor, action, target, value) values (s.name, 'report', '', t);
end;
$$;

create or replace function resolve_report(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
    s staff := require_staff();
    t text;
begin
    update reports set resolved = true, resolved_by = s.name, resolved_at = now()
     where id = p_id and not resolved
     returning text into t;
    if t is not null then
        insert into logs (actor, action, target, value) values (s.name, 'resolve', p_id::text, t);
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 書き込み（オーナー）
-- ---------------------------------------------------------------------------

create or replace function set_mode(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare
    s staff := require_staff(true);
begin
    update status set mode = p_mode where id = 1;
    perform touch_status_and_log(s.name, 'mode', '', p_mode);
end;
$$;

create or replace function set_launch(p_state text, p_time text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
    s staff := require_staff(true);
begin
    update status
       set launch_state = p_state, launch_time = coalesce(p_time, ''), launch_note = btrim(coalesce(p_note, ''))
     where id = 1;
    perform touch_status_and_log(s.name, 'launch', p_state, btrim(coalesce(p_time, '') || ' ' || coalesce(p_note, '')));
end;
$$;

create or replace function upsert_staff(p_email text, p_name text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
    s staff := require_staff(true);
begin
    insert into staff (email, name, role) values (lower(btrim(p_email)), btrim(p_name), p_role)
    on conflict (email) do update set name = excluded.name, role = excluded.role;
    insert into logs (actor, action, target, value) values (s.name, 'staff', lower(btrim(p_email)), p_role);
end;
$$;

create or replace function remove_staff(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
    s staff := require_staff(true);
begin
    if lower(btrim(p_email)) = s.email then
        raise exception '自分自身は削除できません' using errcode = '22023';
    end if;
    delete from staff where email = lower(btrim(p_email));
    insert into logs (actor, action, target, value) values (s.name, 'staff', lower(btrim(p_email)), 'removed');
end;
$$;

-- ---------------------------------------------------------------------------
-- 一般向け（匿名で呼べる。入力者名は含めない）
-- ---------------------------------------------------------------------------

create or replace function ms(t timestamptz) returns bigint
language sql immutable as $$
    select (extract(epoch from t) * 1000)::bigint
$$;

create or replace function get_public_status() returns jsonb
language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'mode', s.mode,
        'launch', jsonb_build_object('state', s.launch_state, 'time', s.launch_time, 'note', s.launch_note),
        'notice', case when s.notice_text is null then null
                       else jsonb_build_object('text', s.notice_text, 'at', ms(s.notice_at)) end,
        'spots', coalesce((select jsonb_object_agg(spot_id, jsonb_build_object('level', level, 'at', ms(updated_at))) from spot_levels), '{}'::jsonb),
        'roads', coalesce((select jsonb_object_agg(road_key, jsonb_build_object('level', level, 'at', ms(updated_at))) from road_levels), '{}'::jsonb),
        'updatedAt', ms(s.updated_at)
    )
    from status s where s.id = 1
$$;

-- ---------------------------------------------------------------------------
-- 読み取りの制限（RLS）。書き込みのポリシーは作らない（関数経由のみ）
-- ---------------------------------------------------------------------------

alter table staff enable row level security;
alter table status enable row level security;
alter table spot_levels enable row level security;
alter table road_levels enable row level security;
alter table reports enable row level security;
alter table logs enable row level security;

drop policy if exists staff_read on staff;
create policy staff_read on staff for select to authenticated using (email = current_email() or is_owner());

drop policy if exists status_read on status;
create policy status_read on status for select to authenticated using (is_staff());

drop policy if exists spot_levels_read on spot_levels;
create policy spot_levels_read on spot_levels for select to authenticated using (is_staff());

drop policy if exists road_levels_read on road_levels;
create policy road_levels_read on road_levels for select to authenticated using (is_staff());

drop policy if exists reports_read on reports;
create policy reports_read on reports for select to authenticated using (is_staff());

drop policy if exists logs_read on logs;
create policy logs_read on logs for select to authenticated using (is_staff());

-- ---------------------------------------------------------------------------
-- 関数の実行権限
-- ---------------------------------------------------------------------------

revoke all on function require_staff(boolean), touch_status_and_log(text, text, text, text) from public, anon, authenticated;
revoke all on function set_spot_level(text, int), set_road_level(text, int, int), set_notice(text),
    add_report(text, double precision, double precision), resolve_report(uuid),
    set_mode(text), set_launch(text, text, text), upsert_staff(text, text, text), remove_staff(text) from public, anon;
grant execute on function set_spot_level(text, int), set_road_level(text, int, int), set_notice(text),
    add_report(text, double precision, double precision), resolve_report(uuid),
    set_mode(text), set_launch(text, text, text), upsert_staff(text, text, text), remove_staff(text) to authenticated;
grant execute on function get_public_status() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 職員画面への即時反映（Supabase Realtime）
-- ---------------------------------------------------------------------------

do $$
declare
    t text;
begin
    foreach t in array array['status', 'spot_levels', 'road_levels', 'reports', 'logs'] loop
        if not exists (
            select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
        ) then
            execute format('alter publication supabase_realtime add table public.%I', t);
        end if;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 最初のオーナー（1回だけ。メールアドレスと名前を書き換えて実行）
-- insert into staff (email, name, role) values ('you@example.com', 'あなたの名前', 'owner')
--   on conflict (email) do update set role = 'owner';
-- ---------------------------------------------------------------------------
