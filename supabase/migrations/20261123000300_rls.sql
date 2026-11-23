-- =====================================================================
-- Row Level Security — hak akses ditegakkan di database
-- =====================================================================

alter table public.profiles       enable row level security;
alter table public.customers      enable row level security;
alter table public.orders         enable row level security;
alter table public.order_private  enable row level security;
alter table public.designs        enable row level security;
alter table public.order_events   enable row level security;
alter table public.audit_log      enable row level security;
alter table public.settings       enable row level security;
alter table public.order_counters enable row level security;
alter table public.rate_limits    enable row level security;

-- Publik (anon) tidak boleh menyentuh tabel apa pun secara langsung.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------- profiles ----------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------- customers: HANYA admin & order ----------
create policy customers_rw on public.customers for all to authenticated
  using (public.my_role() in ('admin', 'order'))
  with check (public.my_role() in ('admin', 'order'));

-- ---------- order_private: HANYA admin & order ----------
create policy order_private_rw on public.order_private for all to authenticated
  using (public.my_role() in ('admin', 'order'))
  with check (public.my_role() in ('admin', 'order'));

-- ---------- orders ----------
-- produksi: hanya tahap antri/print/press
-- finishing: tahap finishing/qc/kirim + selesai 30 hari terakhir
create policy orders_select on public.orders for select to authenticated
  using (
    public.my_role() in ('admin', 'order')
    or (public.my_role() = 'produksi' and status in ('antri', 'print', 'press'))
    or (public.my_role() = 'finishing' and (
          status in ('finishing', 'qc', 'kirim')
          or (status = 'selesai' and done_at > now() - interval '30 days')))
  );
create policy orders_insert on public.orders for insert to authenticated
  with check (public.my_role() in ('admin', 'order'));
create policy orders_update on public.orders for update to authenticated
  using (public.my_role() in ('admin', 'order'))
  with check (public.my_role() in ('admin', 'order'));
create policy orders_delete on public.orders for delete to authenticated
  using (public.my_role() = 'admin');

-- ---------- designs: ikut visibilitas order ----------
create policy designs_select on public.designs for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy designs_insert on public.designs for insert to authenticated
  with check (
    public.my_role() in ('admin', 'order', 'produksi')
    and uploaded_by = auth.uid()
    and exists (select 1 from public.orders o where o.id = order_id)
  );
create policy designs_update on public.designs for update to authenticated
  using (public.my_role() in ('admin', 'order'))
  with check (public.my_role() in ('admin', 'order'));
create policy designs_delete on public.designs for delete to authenticated
  using (public.my_role() = 'admin');

-- ---------- order_events: baca ikut order, tulis hanya lewat fungsi ----------
create policy order_events_select on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

-- ---------- audit_log: hanya admin yang membaca ----------
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.my_role() = 'admin');

-- ---------- settings ----------
create policy settings_select on public.settings for select to authenticated
  using (public.is_staff());
create policy settings_admin on public.settings for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- order_counters & rate_limits: tanpa policy = tidak bisa diakses kecuali via fungsi.

-- =====================================================================
-- View lantai produksi (security_invoker → RLS orders tetap berlaku)
-- Tidak ada kolom customer selain nama.
-- =====================================================================
create view public.orders_floor
with (security_invoker = true)
as
select
  o.id, o.no, o.customer_name, o.channel, o.product, o.material, o.size,
  o.print_width_cm, o.qty, o.unit, o.deadline, o.priority, o.note_production,
  o.status, o.issue, o.resi, o.courier, o.reorder_of, o.created_at,
  o.status_changed_at, o.done_at, o.drive_folder_url
from public.orders o;

grant select on public.orders_floor to authenticated;
revoke all on public.orders_floor from anon;
