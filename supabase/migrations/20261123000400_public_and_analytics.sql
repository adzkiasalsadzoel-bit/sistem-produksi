-- =====================================================================
-- Lacak publik, rate limit, ringkasan, TV, analisa, order ulang
-- =====================================================================

-- ---------- Lacak: HANYA kolom yang aman untuk customer ----------
create or replace function public.track_lookup(p_code text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'code',       o.track_code,
    'no',         o.no,
    'product',    o.product,
    'qty',        o.qty,
    'unit',       o.unit,
    'status',     o.status,
    'has_issue',  o.issue is not null,
    'deadline',   o.deadline,
    'created_at', o.created_at,
    'done_at',    o.done_at,
    'resi',       o.resi,
    'courier',    o.courier,
    'entered',    coalesce((
        select jsonb_object_agg(e.to_status, e.at)
          from (select to_status, max(at) as at
                  from public.order_events
                 where order_id = o.id and kind in ('create', 'status') and to_status is not null
                 group by to_status) e), '{}'::jsonb)
  )
  from public.orders o
  where o.track_code = upper(trim(p_code));
$$;

-- No. order + 4 digit terakhir WA
create or replace function public.track_lookup_by_order(p_no text, p_wa_last4 text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select public.track_lookup(o.track_code)
    from public.orders o
    join public.customers c on c.id = o.customer_id
   where upper(trim(o.no)) = upper(trim(p_no))
     and length(regexp_replace(coalesce(p_wa_last4, ''), '\D', '', 'g')) = 4
     and right(c.wa_norm, 4) = regexp_replace(p_wa_last4, '\D', '', 'g')
   limit 1;
$$;

-- Rate limit: true = boleh, false = melebihi batas
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql volatile security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- serialisasi per key agar hitungan akurat saat paralel
  perform pg_advisory_xact_lock(hashtext('rl:' || p_key));
  select count(*) into n from public.rate_limits
   where key = p_key and at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then
    return false;
  end if;
  insert into public.rate_limits (key) values (p_key);
  if random() < 0.02 then
    delete from public.rate_limits where at < now() - interval '1 day';
  end if;
  return true;
end;
$$;

-- Pengaturan yang boleh tampil di halaman publik
create or replace function public.public_settings()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from public.settings where key in ('wa_bisnis', 'banner_lacak', 'nama_usaha');
$$;

-- ---------- Ringkasan untuk semua staf (agregat saja, tanpa data pribadi) ----------
create or replace function public.dashboard_summary()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  res jsonb;
begin
  if not public.is_staff() then raise exception 'Anda tidak punya akses' using errcode = '42501'; end if;
  select jsonb_build_object(
    'aktif',          count(*) filter (where status <> 'selesai'),
    'telat',          count(*) filter (where status <> 'selesai' and deadline < today),
    'deadline_hari_ini', count(*) filter (where status <> 'selesai' and deadline = today),
    'kendala',        count(*) filter (where status <> 'selesai' and issue is not null),
    'selesai_7_hari', count(*) filter (where status = 'selesai' and done_at >= now() - interval '7 days'),
    'lead_time_jam',  round((avg(extract(epoch from done_at - created_at) / 3600)
                        filter (where status = 'selesai' and done_at >= now() - interval '30 days'))::numeric, 1),
    'per_tahap', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
                    from (select status::text s, count(*) n from public.orders
                           where status <> 'selesai' group by status) t)
  ) into res
  from public.orders;
  return res;
end;
$$;

-- ---------- Tampilan TV (nama depan saja) ----------
create or replace function public.tv_board()
returns table (id uuid, no text, nama text, product text, qty integer, unit text,
               status public.order_status, deadline date, priority public.order_priority,
               has_issue boolean, status_changed_at timestamptz)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Anda tidak punya akses' using errcode = '42501'; end if;
  return query
    select o.id, o.no, split_part(trim(o.customer_name), ' ', 1), o.product, o.qty, o.unit,
           o.status, o.deadline, o.priority, o.issue is not null, o.status_changed_at
      from public.orders o
     where o.status not in ('baru', 'selesai')
     order by (o.priority = 'urgent') desc, o.deadline nulls last, o.created_at;
end;
$$;

-- ---------- Analisa (admin & order) ----------
create or replace function public.analytics(p_days integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  r public.app_role := public.my_role();
  since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  today date := (now() at time zone 'Asia/Jakarta')::date;
  res jsonb;
begin
  if r is null or r not in ('admin', 'order') then
    raise exception 'Analisa hanya untuk admin & tim order' using errcode = '42501';
  end if;

  with
  o as (
    select *,
      (deadline is not null and (
         (done_at is not null and (done_at at time zone 'Asia/Jakarta')::date > deadline)
         or (done_at is null and deadline < today))) as late
    from public.orders
    where created_at >= since
  ),
  ev as (
    select e.order_id, e.to_status, e.at,
           lead(e.at) over (partition by e.order_id order by e.at, e.id) as left_at
      from public.order_events e
     where e.kind in ('create', 'status') and e.to_status is not null
  ),
  stage_hours as (
    select to_status::text s,
           round((avg(extract(epoch from left_at - at) / 3600))::numeric, 1) jam,
           round((percentile_cont(0.8) within group (order by extract(epoch from left_at - at) / 3600))::numeric, 1) p80,
           count(*) n
      from ev
     where left_at is not null and at >= since and to_status <> 'selesai'
     group by to_status
  ),
  thr as (
    select to_char((e.at at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD') hari,
           public.stage_owner(e.from_status)::text tim,
           count(*) n
      from public.order_events e
     where e.kind = 'status' and e.from_status is not null
       and public.status_index(e.to_status) > public.status_index(e.from_status)
       and e.at >= greatest(since, now() - interval '14 days')
     group by 1, 2
  ),
  cust as (
    select customer_id, count(*) n, max(created_at) last_at
      from public.orders where customer_id is not null group by customer_id
  )
  select jsonb_build_object(
    'days', p_days,
    'wip', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) from
              (select status::text s, count(*) n from public.orders where status <> 'selesai' group by status) t),
    'stage_hours', (select coalesce(jsonb_agg(jsonb_build_object('status', s, 'jam', jam, 'p80', p80, 'n', n)), '[]'::jsonb) from stage_hours),
    'throughput', (select coalesce(jsonb_agg(jsonb_build_object('hari', hari, 'tim', tim, 'n', n) order by hari), '[]'::jsonb) from thr),
    'channels', (select coalesce(jsonb_agg(x order by (x->>'orders')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('channel', channel::text, 'orders', count(*), 'units', sum(qty),
               'late_pct', round(100.0 * count(*) filter (where late) / nullif(count(*) filter (where deadline is not null), 0), 1),
               'selesai', count(*) filter (where status = 'selesai')) x
          from o group by channel) t),
    'products', (select coalesce(jsonb_agg(x order by (x->>'units')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('product', product, 'orders', count(*), 'units', sum(qty)) x
          from o group by product) t),
    'weekly', (select coalesce(jsonb_agg(x order by x->>'minggu'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'minggu', to_char(date_trunc('week', created_at at time zone 'Asia/Jakarta'), 'YYYY-MM-DD'),
                 'orders', count(*), 'units', sum(qty)) x
          from public.orders where created_at >= now() - interval '12 weeks'
         group by date_trunc('week', created_at at time zone 'Asia/Jakarta')) t),
    'totals', (select jsonb_build_object(
          'orders', count(*), 'units', coalesce(sum(qty), 0),
          'late_pct', round(100.0 * count(*) filter (where late) / nullif(count(*) filter (where deadline is not null), 0), 1),
          'reorders', count(*) filter (where reorder_of is not null)) from o),
    'repeat', (select jsonb_build_object(
          'customers', count(*) filter (where n >= 2),
          'all_customers', count(*),
          'orders_from_repeat_pct', round(100.0 * sum(n) filter (where n >= 2) / nullif(sum(n), 0), 1)) from cust),
    'top_repeat', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('name', c.name, 'orders', cu.n,
               'last', to_char(cu.last_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD')) x
          from cust cu join public.customers c on c.id = cu.customer_id
         where cu.n >= 2 order by cu.n desc, cu.last_at desc limit 10) t)
  ) into res;
  return res;
end;
$$;

-- ---------- Repeat customer untuk export (INVOKER → RLS customers berlaku) ----------
create or replace function public.repeat_customers(p_min integer default 2)
returns table (name text, wa text, email text, orders bigint, units bigint,
               last_order date, channels text, products text)
language sql stable security invoker
set search_path = public
as $$
  select c.name, c.wa, c.email, count(o.id), sum(o.qty)::bigint,
         max((o.created_at at time zone 'Asia/Jakarta')::date),
         string_agg(distinct o.channel::text, ', '),
         string_agg(distinct o.product, ', ')
    from public.customers c
    join public.orders o on o.customer_id = c.id
   group by c.id
  having count(o.id) >= p_min
   order by count(o.id) desc, max(o.created_at) desc;
$$;

-- ---------- Order ulang satu klik (INVOKER → hanya admin/order lolos RLS) ----------
create or replace function public.reorder_order(p_order uuid, p_deadline date default null, p_qty integer default null)
returns uuid
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  src public.orders;
  new_id uuid;
  lead_days integer;
begin
  if public.my_role() is null or public.my_role() not in ('admin', 'order') then
    raise exception 'Order ulang hanya untuk tim order' using errcode = '42501';
  end if;
  select * into src from public.orders where id = p_order;
  if not found then raise exception 'Order tidak ditemukan' using errcode = 'P0002'; end if;

  select coalesce((value #>> '{}')::integer, 3) into lead_days from public.settings where key = 'lead_time_default_hari';

  insert into public.orders (customer_id, customer_name, channel, product, material, size,
                             print_width_cm, qty, unit, deadline, priority, note_production, reorder_of)
  values (src.customer_id, src.customer_name, src.channel, src.product, src.material, src.size,
          src.print_width_cm, coalesce(p_qty, src.qty), src.unit,
          coalesce(p_deadline, (now() at time zone 'Asia/Jakarta')::date + coalesce(lead_days, 3)),
          'normal', src.note_production, src.id)
  returning id into new_id;

  insert into public.designs (order_id, file_no, version, is_active, file_name, original_name, mime,
                              size_bytes, width_px, height_px, ok_4k, dpi, dpi_status,
                              drive_file_id, drive_url, preview_path, copied_from, uploaded_by)
  select new_id, d.file_no, 1, true, d.file_name, d.original_name, d.mime,
         d.size_bytes, d.width_px, d.height_px, d.ok_4k, d.dpi, d.dpi_status,
         d.drive_file_id, d.drive_url, d.preview_path, d.id, auth.uid()
    from public.designs d
   where d.order_id = src.id and d.is_active
   order by d.file_no;

  return new_id;
end;
$$;

-- =====================================================================
-- Hak eksekusi fungsi (default Postgres: PUBLIC boleh eksekusi → dicabut)
-- =====================================================================
revoke execute on all functions in schema public from public, anon;

grant execute on function public.my_role()                     to authenticated;
grant execute on function public.is_staff()                    to authenticated;
grant execute on function public.status_index(public.order_status) to authenticated;
grant execute on function public.stage_owner(public.order_status)  to authenticated;
grant execute on function public.status_index_to_status(integer)   to authenticated;
grant execute on function public.next_design_slot(uuid, smallint)  to authenticated;
grant execute on function public.change_order_status(uuid, public.order_status, text, text, text) to authenticated;
grant execute on function public.set_order_issue(uuid, text)   to authenticated;
grant execute on function public.set_order_resi(uuid, text, text) to authenticated;
grant execute on function public.log_audit(text, uuid, jsonb)  to authenticated;
grant execute on function public.get_order_customer(uuid)      to authenticated;
grant execute on function public.dashboard_summary()           to authenticated;
grant execute on function public.tv_board()                    to authenticated;
grant execute on function public.analytics(integer)            to authenticated;
grant execute on function public.repeat_customers(integer)     to authenticated;
grant execute on function public.reorder_order(uuid, date, integer) to authenticated;

-- Fungsi trigger & internal: dipakai trigger (berjalan sebagai owner), tidak perlu grant.
-- Fungsi publik dipanggil server Next.js dengan service_role SETELAH rate limit.
grant execute on function public.track_lookup(text)                 to service_role;
grant execute on function public.track_lookup_by_order(text, text)  to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.public_settings()                  to service_role;

-- =====================================================================
-- Realtime & Storage (hanya bila berjalan di Supabase)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.order_events, public.designs;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'storage' and c.relname = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('previews', 'previews', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- service_role (server Next.js) boleh memanggil semua fungsi
grant execute on all functions in schema public to service_role;
