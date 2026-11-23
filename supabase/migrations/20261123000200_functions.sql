-- =====================================================================
-- Fungsi inti: peran, penomoran, kode lacak, alur status, trigger
-- =====================================================================

-- ---------- Peran pengguna aktif (null = bukan staf aktif) ----------
create or replace function public.my_role()
returns public.app_role
language sql stable security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active;
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.my_role() is not null;
$$;

-- Urutan tahap (1..8)
create or replace function public.status_index(s public.order_status)
returns integer language sql immutable
as $$
  select array_position(enum_range(null::public.order_status), s);
$$;

-- Tim pemilik tahap
create or replace function public.stage_owner(s public.order_status)
returns public.app_role language sql immutable
as $$
  select case
    when s = 'baru' then 'order'::public.app_role
    when s in ('antri', 'print', 'press') then 'produksi'::public.app_role
    else 'finishing'::public.app_role
  end;
$$;

-- ---------- Nomor order ORD-YYMMDD-NNN (aman untuk input bersamaan) ----------
create or replace function public.next_order_no(p_day date default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  d date := coalesce(p_day, (now() at time zone 'Asia/Jakarta')::date);
  n integer;
begin
  insert into public.order_counters as c (day, last) values (d, 1)
  on conflict (day) do update set last = c.last + 1
  returning c.last into n;
  return 'ORD-' || to_char(d, 'YYMMDD') || '-' ||
         case when n < 1000 then lpad(n::text, 3, '0') else n::text end;
end;
$$;

-- ---------- Kode lacak 8 karakter, tanpa O/0/I/1 ----------
create or replace function public.gen_track_code()
returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 karakter
  b bytea;
  code text;
  i integer;
begin
  loop
    b := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.orders where track_code = code);
  end loop;
  return code;
end;
$$;

-- ---------- Trigger orders ----------
create or replace function public.orders_before_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.no is null or new.no = '' then
    new.no := public.next_order_no((coalesce(new.created_at, now()) at time zone 'Asia/Jakarta')::date);
  end if;
  new.track_code := public.gen_track_code();
  -- order baru selalu mulai dari 'baru' kecuali seed/admin bypass
  if coalesce(current_setting('app.via_status_fn', true), '') <> 'on' then
    new.status := 'baru';
    new.done_at := null;
  end if;
  if new.customer_name is null or trim(new.customer_name) = '' then
    select c.name into new.customer_name from public.customers c where c.id = new.customer_id;
  end if;
  new.created_at := coalesce(new.created_at, now());
  new.status_changed_at := new.created_at;
  return new;
end;
$$;

create trigger orders_before_insert
before insert on public.orders
for each row execute function public.orders_before_insert();

create or replace function public.orders_after_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  src text;
begin
  if new.reorder_of is not null then
    select no into src from public.orders where id = new.reorder_of;
  end if;
  insert into public.order_events (order_id, kind, from_status, to_status, by_user, note, at)
  values (new.id, 'create', null, 'baru', auth.uid(),
          case when src is not null then 'Order ulang dari ' || src end, new.created_at);
  return new;
end;
$$;

create trigger orders_after_insert
after insert on public.orders
for each row execute function public.orders_after_insert();

-- Status hanya boleh berubah lewat change_order_status(); nomor & kode lacak tidak boleh diubah.
create or replace function public.orders_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.no is distinct from old.no or new.track_code is distinct from old.track_code then
    raise exception 'Nomor order dan kode lacak tidak boleh diubah' using errcode = '42501';
  end if;
  if (new.status is distinct from old.status or new.done_at is distinct from old.done_at)
     and coalesce(current_setting('app.via_status_fn', true), '') <> 'on' then
    raise exception 'Status hanya boleh diubah lewat alur status' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_before_update
before update on public.orders
for each row execute function public.orders_before_update();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger customers_touch before update on public.customers
for each row execute function public.touch_updated_at();
create trigger order_private_touch before update on public.order_private
for each row execute function public.touch_updated_at();

-- ---------- Trigger designs: versi baru menonaktifkan versi lama ----------
create or replace function public.designs_after_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.is_active then
    update public.designs
       set is_active = false
     where order_id = new.order_id and file_no = new.file_no and id <> new.id and is_active;
  end if;
  insert into public.order_events (order_id, kind, by_user, note)
  values (new.order_id, 'design', auth.uid(),
          case when new.version > 1 then 'Revisi v' || new.version || ': ' else 'File: ' end || new.file_name);
  return new;
end;
$$;

create trigger designs_after_insert
after insert on public.designs
for each row execute function public.designs_after_insert();

-- Nomor file & versi berikutnya (dipakai server sebelum upload)
create or replace function public.next_design_slot(p_order uuid, p_file_no smallint default null)
returns table (file_no smallint, version integer)
language sql stable
set search_path = public
as $$
  select
    coalesce(p_file_no, (select coalesce(max(d.file_no), 0) + 1 from public.designs d where d.order_id = p_order))::smallint,
    case when p_file_no is null then 1
         else (select coalesce(max(d.version), 0) + 1 from public.designs d
               where d.order_id = p_order and d.file_no = p_file_no) end;
$$;

-- ---------- Profil otomatis saat staf dibuat ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    -- peran HANYA dari app_metadata (tidak bisa diisi user sendiri)
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'produksi')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =====================================================================
-- ALUR STATUS
-- =====================================================================
create or replace function public.change_order_status(
  p_order   uuid,
  p_to      public.order_status,
  p_note    text default null,
  p_resi    text default null,
  p_courier text default null
)
returns public.orders
language plpgsql security definer
set search_path = public
as $$
declare
  r      public.app_role := public.my_role();
  o      public.orders;
  fi     integer;
  ti     integer;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_resi text;
begin
  if r is null then
    raise exception 'Anda tidak punya akses' using errcode = '42501';
  end if;

  select * into o from public.orders where id = p_order for update;
  if not found then
    raise exception 'Order tidak ditemukan' using errcode = 'P0002';
  end if;

  if r <> 'admin' and public.stage_owner(o.status) <> r then
    raise exception 'Tahap "%" bukan milik tim %', o.status, r using errcode = '42501';
  end if;

  fi := public.status_index(o.status);
  ti := public.status_index(p_to);

  if ti = fi then
    raise exception 'Order sudah di tahap %', p_to using errcode = '22023';
  end if;
  if abs(ti - fi) <> 1 then
    raise exception 'Hanya boleh pindah satu tahap (dari % ke %)', o.status, p_to using errcode = '22023';
  end if;
  if ti < fi and v_note is null then
    raise exception 'Mundur tahap wajib mengisi alasan' using errcode = '22023';
  end if;
  if o.status = 'baru' and p_to = 'antri'
     and not exists (select 1 from public.designs d where d.order_id = o.id and d.is_active) then
    raise exception 'Belum ada file desain — upload minimal 1 file sebelum kirim ke produksi' using errcode = '22023';
  end if;

  v_resi := coalesce(nullif(trim(coalesce(p_resi, '')), ''), o.resi);
  if p_to = 'selesai' and o.channel <> 'offline' and v_resi is null then
    raise exception 'Wajib isi no resi sebelum status Dikirim' using errcode = '22023';
  end if;

  perform set_config('app.via_status_fn', 'on', true);
  update public.orders
     set status            = p_to,
         issue             = case when ti < fi then v_note else null end,
         resi              = v_resi,
         courier           = coalesce(nullif(trim(coalesce(p_courier, '')), ''), courier),
         done_at           = case when p_to = 'selesai' then now() else null end,
         status_changed_at = now()
   where id = o.id
   returning * into o;
  perform set_config('app.via_status_fn', 'off', true);

  insert into public.order_events (order_id, kind, from_status, to_status, by_user, note)
  values (o.id, 'status', public.status_index_to_status(fi), p_to, auth.uid(), v_note);

  return o;
end;
$$;

create or replace function public.status_index_to_status(i integer)
returns public.order_status language sql immutable
as $$
  select (enum_range(null::public.order_status))[i];
$$;

-- Catat / hapus kendala tanpa pindah tahap
create or replace function public.set_order_issue(p_order uuid, p_issue text)
returns public.orders
language plpgsql security definer
set search_path = public
as $$
declare
  r public.app_role := public.my_role();
  o public.orders;
  v text := nullif(trim(coalesce(p_issue, '')), '');
begin
  if r is null then raise exception 'Anda tidak punya akses' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order tidak ditemukan' using errcode = 'P0002'; end if;
  if r not in ('admin', 'order') and public.stage_owner(o.status) <> r then
    raise exception 'Tahap "%" bukan milik tim %', o.status, r using errcode = '42501';
  end if;
  update public.orders set issue = v where id = o.id returning * into o;
  insert into public.order_events (order_id, kind, from_status, to_status, by_user, note)
  values (o.id, 'issue', o.status, o.status, auth.uid(), coalesce(v, 'Kendala diselesaikan'));
  return o;
end;
$$;

-- Input resi (tim finishing / order / admin)
create or replace function public.set_order_resi(p_order uuid, p_resi text, p_courier text default null)
returns public.orders
language plpgsql security definer
set search_path = public
as $$
declare
  r public.app_role := public.my_role();
  o public.orders;
begin
  if r is null or r = 'produksi' then raise exception 'Anda tidak punya akses' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order tidak ditemukan' using errcode = 'P0002'; end if;
  if r = 'finishing' and public.stage_owner(o.status) <> 'finishing' then
    raise exception 'Order belum di tahap finishing' using errcode = '42501';
  end if;
  update public.orders
     set resi = nullif(trim(coalesce(p_resi, '')), ''),
         courier = coalesce(nullif(trim(coalesce(p_courier, '')), ''), courier)
   where id = o.id returning * into o;
  insert into public.order_events (order_id, kind, from_status, to_status, by_user, note)
  values (o.id, 'resi', o.status, o.status, auth.uid(),
          'Resi: ' || coalesce(o.resi, '-') || coalesce(' (' || o.courier || ')', ''));
  return o;
end;
$$;

-- Catat akses data pribadi
create or replace function public.log_audit(p_action text, p_order uuid default null, p_detail jsonb default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Anda tidak punya akses' using errcode = '42501'; end if;
  insert into public.audit_log (user_id, action, order_id, detail) values (auth.uid(), p_action, p_order, p_detail);
end;
$$;

-- Data customer suatu order + tercatat di audit_log (hanya admin/order)
create or replace function public.get_order_customer(p_order uuid)
returns table (id uuid, name text, wa text, address text, email text,
               marketplace_ref text, payment_note text)
language plpgsql security definer
set search_path = public
as $$
begin
  if public.my_role() not in ('admin', 'order') or public.my_role() is null then
    raise exception 'Data customer hanya untuk tim order' using errcode = '42501';
  end if;
  insert into public.audit_log (user_id, action, order_id) values (auth.uid(), 'lihat_customer', p_order);
  return query
    select c.id, c.name, c.wa, c.address, c.email, p.marketplace_ref, p.payment_note
      from public.orders o
      left join public.customers c on c.id = o.customer_id
      left join public.order_private p on p.order_id = o.id
     where o.id = p_order;
end;
$$;
