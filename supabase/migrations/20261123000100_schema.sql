-- =====================================================================
-- Sistem Produksi Cetak — skema inti
-- Data pribadi customer dipisah fisik dari tabel kerja (orders):
--   customers      : nama, WA, alamat, email          (admin & order saja)
--   order_private  : no pesanan marketplace, catatan bayar (admin & order saja)
--   orders         : kolom kerja + customer_name (snapshot) — boleh dilihat lantai produksi
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- Enum ----------
create type public.app_role as enum ('admin', 'order', 'produksi', 'finishing');

create type public.order_status as enum (
  'baru', 'antri', 'print', 'press', 'finishing', 'qc', 'kirim', 'selesai'
);

create type public.sales_channel as enum (
  'shopee', 'tiktok', 'tokopedia', 'lazada', 'blibli',
  'whatsapp', 'reseller', 'offline', 'b2b', 'website', 'lainnya'
);

create type public.order_priority as enum ('normal', 'prioritas', 'urgent');

-- ---------- Profil staf ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        public.app_role not null default 'produksi',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Customer (PRIVAT) ----------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  wa          text,
  wa_norm     text generated always as (regexp_replace(coalesce(wa, ''), '\D', '', 'g')) stored,
  address     text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index customers_wa_norm_idx on public.customers (wa_norm);
create index customers_name_idx on public.customers (lower(name));

-- ---------- Order (kolom kerja) ----------
create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  no                 text not null unique,
  track_code         text not null unique,
  customer_id        uuid references public.customers (id) on delete set null,
  customer_name      text not null,
  channel            public.sales_channel not null,
  product            text not null,
  material           text,
  size               text,
  print_width_cm     numeric(8, 2) check (print_width_cm is null or print_width_cm > 0),
  qty                integer not null check (qty > 0),
  unit               text not null default 'pcs',
  deadline           date,
  priority           public.order_priority not null default 'normal',
  note_production    text,
  status             public.order_status not null default 'baru',
  issue              text,
  resi               text,
  courier            text,
  reorder_of         uuid references public.orders (id) on delete set null,
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  status_changed_at  timestamptz not null default now(),
  done_at            timestamptz,
  drive_folder_id    text,
  drive_folder_url   text
);
create index orders_status_idx on public.orders (status);
create index orders_created_idx on public.orders (created_at desc);
create index orders_customer_idx on public.orders (customer_id);
create index orders_deadline_idx on public.orders (deadline) where status <> 'selesai';

-- ---------- Data privat per order ----------
create table public.order_private (
  order_id        uuid primary key references public.orders (id) on delete cascade,
  marketplace_ref text,
  payment_note    text,
  updated_at      timestamptz not null default now()
);

-- ---------- File desain ----------
create table public.designs (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  file_no        smallint not null default 1 check (file_no between 1 and 99),
  version        integer not null default 1 check (version >= 1),
  is_active      boolean not null default true,
  file_name      text not null,
  original_name  text,
  mime           text,
  size_bytes     bigint,
  width_px       integer,
  height_px      integer,
  ok_4k          boolean,
  dpi            numeric(8, 1),
  dpi_status     text not null default 'manual' check (dpi_status in ('ok', 'rendah', 'manual')),
  drive_file_id  text,
  drive_url      text,
  preview_path   text,
  copied_from    uuid references public.designs (id) on delete set null,
  uploaded_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  unique (order_id, file_no, version)
);
create index designs_order_idx on public.designs (order_id) where is_active;

-- ---------- Riwayat ----------
create table public.order_events (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  kind         text not null default 'status'
               check (kind in ('create', 'status', 'issue', 'resi', 'design', 'reorder', 'edit')),
  from_status  public.order_status,
  to_status    public.order_status,
  by_user      uuid references public.profiles (id) on delete set null default auth.uid(),
  note         text,
  at           timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, at);
create index order_events_at_idx on public.order_events (at);

-- ---------- Audit akses data pribadi ----------
create table public.audit_log (
  id        bigint generated always as identity primary key,
  user_id   uuid default auth.uid(),
  action    text not null,
  order_id  uuid references public.orders (id) on delete set null,
  detail    jsonb,
  at        timestamptz not null default now()
);
create index audit_log_at_idx on public.audit_log (at desc);

-- ---------- Pengaturan ----------
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------- Internal: penomoran & rate limit ----------
create table public.order_counters (
  day   date primary key,
  last  integer not null
);

create table public.rate_limits (
  id   bigint generated always as identity primary key,
  key  text not null,
  at   timestamptz not null default now()
);
create index rate_limits_key_at_idx on public.rate_limits (key, at);

insert into public.settings (key, value) values
  ('drive_id', 'null'::jsonb),
  ('wa_bisnis', '""'::jsonb),
  ('nama_usaha', '"Atelier Cetak"'::jsonb),
  ('banner_lacak', jsonb_build_object(
      'aktif', true,
      'judul', 'Mau order ulang motif yang sama?',
      'teks', 'Kirim kode lacak ini ke admin, desain lama langsung kami cetak ulang tanpa upload lagi.',
      'tombol', 'Order ulang via WhatsApp')),
  ('lead_time_default_hari', '3'::jsonb);
