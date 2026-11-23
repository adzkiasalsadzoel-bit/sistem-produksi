-- =====================================================================
-- Seed DEMO (hanya untuk lokal/dev). Password semua akun: Cetak#2026
-- GANTI password / hapus akun demo sebelum dipakai produksi!
-- =====================================================================

-- ---------- Staf per peran ----------
do $$
declare
  u record;
begin
  for u in select * from (values
    ('00000000-0000-4000-a000-000000000001'::uuid, 'admin@atelier.test',     'Owner (Admin)',  'admin'),
    ('00000000-0000-4000-a000-000000000002'::uuid, 'order@atelier.test',     'Rina — Order',   'order'),
    ('00000000-0000-4000-a000-000000000003'::uuid, 'produksi@atelier.test',  'Budi — Produksi','produksi'),
    ('00000000-0000-4000-a000-000000000004'::uuid, 'finishing@atelier.test', 'Sari — Finishing','finishing')
  ) as t(id, email, full_name, role)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            extensions.crypt('Cetak#2026', extensions.gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', u.role),
            jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', '')
    on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
            jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now())
    on conflict do nothing;

    -- pastikan peran sesuai (trigger handle_new_user sudah membuat baris)
    update public.profiles set role = u.role::public.app_role, full_name = u.full_name where id = u.id;
  end loop;
end $$;

update public.settings set value = '"6281200000000"'::jsonb where key = 'wa_bisnis';

-- ---------- Order contoh dengan riwayat realistis ----------
do $$
declare
  r record;
  cid uuid;
  oid uuid;
  t timestamptz;
  k integer;
  -- rata-rata jam per tahap: baru, antri, print, press, finishing, qc, kirim
  hrs numeric[] := array[3, 10, 4, 5, 9, 3, 6];
  seq_status public.order_status[] := enum_range(null::public.order_status);
  who uuid;
begin
  perform set_config('app.via_status_fn', 'on', true);

  for r in select * from (values
    -- nama, wa, alamat, channel, produk, bahan, ukuran, lebar_cm, qty, unit, status, hari_lalu, prioritas, kendala
    ('Aisyah Putri',   '0812-3456-0001', 'Jl. Melati 1, Bandung',    'shopee',    'Hijab Printing',  'Voal Ultrafine', '115x115 cm', 115, 24, 'pcs',    'selesai',   26, 'normal',   null),
    ('Aisyah Putri',   '0812-3456-0001', 'Jl. Melati 1, Bandung',    'shopee',    'Hijab Printing',  'Voal Ultrafine', '115x115 cm', 115, 36, 'pcs',    'selesai',   12, 'normal',   null),
    ('Aisyah Putri',   '0812-3456-0001', 'Jl. Melati 1, Bandung',    'whatsapp',  'Pashmina',        'Ceruty Babydoll','75x180 cm',  180, 20, 'pcs',    'print',      1, 'prioritas',null),
    ('Dewi Lestari',   '0857-1111-2222', 'Perum Asri B2, Bekasi',    'tiktok',    'Pashmina',        'Silk Premium',   '70x175 cm',  175, 50, 'pcs',    'press',      2, 'normal',   null),
    ('Dewi Lestari',   '0857-1111-2222', 'Perum Asri B2, Bekasi',    'tiktok',    'Hijab Printing',  'Voal Ultrafine', '115x115 cm', 115, 30, 'pcs',    'selesai',   40, 'normal',   null),
    ('Klub Futsal Garuda','0813-9999-1000','GOR Cempaka, Depok',     'b2b',       'Jersey',          'Dryfit Milano',  'Set L/XL',    60, 18, 'set',    'finishing',  3, 'urgent',   null),
    ('Rahmat Hidayat', '0821-5555-7777', 'Jl. Kenanga 9, Surabaya',  'tokopedia', 'Kain Meteran',    'Katun Rayon',    '150 cm',     150, 25, 'meter',  'antri',      1, 'normal',   null),
    ('Butik Sakinah',  '0819-2020-3030', 'Ruko Plaza 3, Solo',       'reseller',  'Hijab Printing',  'Voal Ultrafine', '115x115 cm', 115, 120,'pcs',    'press',      2, 'prioritas','Warna merah kurang pekat, cetak ulang 6 pcs'),
    ('Butik Sakinah',  '0819-2020-3030', 'Ruko Plaza 3, Solo',       'reseller',  'Pashmina',        'Ceruty Babydoll','75x180 cm',  180, 80, 'pcs',    'selesai',   20, 'normal',   null),
    ('Nadia Safitri',  '0838-1234-9876', 'Jl. Anggrek 22, Malang',   'lazada',    'Home Living — Sarung Bantal','Kanvas', '40x40 cm', 40, 12, 'pcs',  'qc',         4, 'normal',   null),
    ('Hotel Nusa Indah','0811-7000-8000','Jl. Raya Kuta, Bali',      'b2b',       'Karpet',          'Beludru Anti-slip','200x300 cm',300, 4, 'pcs',    'kirim',      6, 'normal',   null),
    ('Siti Rohmah',    '0896-4444-1212', 'Jl. Mawar 5, Yogyakarta',  'blibli',    'Hijab Printing',  'Satin Velvet',   '110x110 cm', 110, 10, 'pcs',    'baru',       0, 'normal',   null),
    ('Event Organizer Sinar','0812-8888-4545','Jl. Gatot Subroto, Jakarta','offline','Backdrop',     'Polyester Flag', '300x200 cm', 300, 2,  'pcs',    'selesai',    9, 'urgent',   null),
    ('Putri Ayu',      '0877-3030-5050', 'Jl. Dahlia 8, Semarang',   'shopee',    'Hijab Printing',  'Voal Ultrafine', '115x115 cm', 115, 15, 'pcs',    'baru',       0, 'normal',   null),
    ('Rahmat Hidayat', '0821-5555-7777', 'Jl. Kenanga 9, Surabaya',  'tokopedia', 'Kain Meteran',    'Katun Rayon',    '150 cm',     150, 40, 'meter',  'selesai',   33, 'normal',   null),
    ('Lina Marlina',   '0815-6060-7070', 'Jl. Flamboyan 3, Bogor',   'tiktok',    'Pashmina',        'Silk Premium',   '70x175 cm',  175, 25, 'pcs',    'print',      2, 'normal',   null)
  ) as t(nama, wa, alamat, channel, produk, bahan, ukuran, lebar, qty, unit, status, hari_lalu, prioritas, kendala)
  loop
    select id into cid from public.customers where wa_norm = regexp_replace(r.wa, '\D', '', 'g');
    if cid is null then
      insert into public.customers (name, wa, address)
      values (r.nama, r.wa, r.alamat) returning id into cid;
    end if;

    t := now() - make_interval(days => r.hari_lalu, hours => 2);

    insert into public.orders (customer_id, customer_name, channel, product, material, size, print_width_cm,
                               qty, unit, deadline, priority, note_production, status, issue,
                               created_by, created_at)
    values (cid, r.nama, r.channel::public.sales_channel, r.produk, r.bahan, r.ukuran, r.lebar,
            r.qty, r.unit, (t at time zone 'Asia/Jakarta')::date + 4, r.prioritas::public.order_priority,
            'Cek warna sesuai proof', r.status::public.order_status, r.kendala,
            '00000000-0000-4000-a000-000000000002', t)
    returning id into oid;

    insert into public.order_private (order_id, marketplace_ref, payment_note)
    values (oid, case when r.channel in ('shopee','tiktok','tokopedia','lazada','blibli')
                      then upper(left(r.channel, 3)) || '-' || to_char(t, 'YYMMDD') || '-' || (random() * 100000)::int end,
            'Lunas');

    insert into public.designs (order_id, file_no, version, is_active, file_name, original_name, mime, size_bytes,
                                width_px, height_px, ok_4k, dpi, dpi_status, uploaded_by, created_at)
    select oid, 1, 1, true,
           (select no from public.orders where id = oid) || '_01_motif-utama.png', 'motif utama.png', 'image/png',
           48000000, 6000, 6000, true, round(6000 / (r.lebar / 2.54), 1),
           case when 6000 / (r.lebar / 2.54) >= (case when r.produk in ('Backdrop','Karpet') then 100 else 150 end)
                then 'ok' else 'rendah' end,
           '00000000-0000-4000-a000-000000000002', t
     where r.status <> 'baru';

    -- riwayat perpindahan tahap
    for k in 2 .. public.status_index(r.status::public.order_status) loop
      t := t + make_interval(hours => hrs[k - 1]::int, mins => (random() * 50)::int);
      who := case public.stage_owner(seq_status[k - 1])
               when 'order' then '00000000-0000-4000-a000-000000000002'::uuid
               when 'produksi' then '00000000-0000-4000-a000-000000000003'::uuid
               else '00000000-0000-4000-a000-000000000004'::uuid end;
      insert into public.order_events (order_id, kind, from_status, to_status, by_user, at)
      values (oid, 'status', seq_status[k - 1], seq_status[k], who, least(t, now()));
    end loop;

    update public.orders
       set status_changed_at = least(t, now()),
           done_at = case when r.status = 'selesai' then least(t, now()) end,
           resi = case when r.status in ('kirim', 'selesai') and r.channel <> 'offline'
                       then 'JX' || lpad(((random() * 1e9)::bigint)::text, 10, '0') end,
           courier = case when r.status in ('kirim', 'selesai') and r.channel <> 'offline' then 'J&T' end
     where id = oid;
  end loop;

  perform set_config('app.via_status_fn', 'off', true);
end $$;
