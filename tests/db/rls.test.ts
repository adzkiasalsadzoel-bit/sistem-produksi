// Tes keamanan database (RLS + fungsi). Butuh DB uji yang sudah di-reset:
//   bash scripts/testdb/reset.sh     (Postgres biasa + shim auth)
// atau Supabase lokal:  TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const U = {
  admin: "00000000-0000-4000-a000-000000000001",
  order: "00000000-0000-4000-a000-000000000002",
  produksi: "00000000-0000-4000-a000-000000000003",
  finishing: "00000000-0000-4000-a000-000000000004",
} as const;
type Who = keyof typeof U | "anon";

let pool: pg.Pool;
let available = true;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: URL, max: 12 });
  try {
    await pool.query("select 1 from public.orders limit 1");
  } catch {
    available = false;
  }
});
afterAll(async () => pool?.end());

/** Jalankan fn sebagai user tertentu di dalam transaksi yang selalu di-rollback */
async function as<T>(who: Who, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (who === "anon") {
      await c.query("set local role anon");
    } else {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U[who], role: "authenticated" })]);
    }
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

/** Jalankan query yang DIHARAPKAN gagal tanpa membatalkan transaksi (pakai savepoint) */
async function fails(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<string | null> {
  await c.query("savepoint expect_fail");
  try {
    await c.query(sql, params);
    await c.query("release savepoint expect_fail");
    return null;
  } catch (e) {
    await c.query("rollback to savepoint expect_fail");
    return (e as Error).message;
  }
}

const d = () => (available ? describe : describe.skip);

d()("privasi customer", () => {
  it("produksi SELECT customers → 0 baris", async () => {
    const r = await as("produksi", (c) => c.query("select * from customers"));
    expect(r.rowCount).toBe(0);
  });
  it("finishing SELECT customers & order_private → 0 baris", async () => {
    await as("finishing", async (c) => {
      expect((await c.query("select * from customers")).rowCount).toBe(0);
      expect((await c.query("select * from order_private")).rowCount).toBe(0);
    });
  });
  it("tim order bisa melihat customer", async () => {
    const r = await as("order", (c) => c.query("select wa from customers"));
    expect(r.rowCount).toBeGreaterThan(0);
  });
  it("produksi tidak bisa menambah / mengubah customer", async () => {
    await as("produksi", async (c) => {
      expect(await fails(c, "insert into customers (name, wa) values ('x', '0812')")).toMatch(/row-level security/);
    });
    await as("produksi", async (c) => {
      const r = await c.query("update customers set wa = '0' returning id");
      expect(r.rowCount).toBe(0);
    });
  });
  it("produksi memanggil get_order_customer ditolak", async () => {
    await as("produksi", async (c) => {
      const id = (await c.query("select id from orders limit 1")).rows[0].id;
      expect(await fails(c, "select * from get_order_customer($1)", [id])).toMatch(/hanya untuk tim order/);
    });
  });
  it("get_order_customer oleh tim order tercatat di audit_log", async () => {
    await as("order", async (c) => {
      const id = (await c.query("select id from orders limit 1")).rows[0].id;
      const r = await c.query("select * from get_order_customer($1)", [id]);
      expect(r.rows[0].wa).toBeTruthy();
      await c.query("reset role");
      const a = await c.query("select * from audit_log where order_id = $1 and action = 'lihat_customer'", [id]);
      expect(a.rowCount).toBe(1);
      expect(a.rows[0].user_id).toBe(U.order);
    });
  });
  it("orders_floor tidak punya kolom WA/alamat", async () => {
    const r = await as("produksi", (c) => c.query("select * from orders_floor limit 1"));
    const cols = r.fields.map((f) => f.name);
    expect(cols).toContain("customer_name");
    for (const bad of ["wa", "address", "email", "customer_id", "track_code", "marketplace_ref", "payment_note"]) {
      expect(cols).not.toContain(bad);
    }
  });
  it("repeat_customers (export) kosong untuk produksi", async () => {
    expect((await as("produksi", (c) => c.query("select * from repeat_customers(2)"))).rowCount).toBe(0);
    expect((await as("order", (c) => c.query("select * from repeat_customers(2)"))).rowCount).toBeGreaterThan(0);
  });
});

d()("visibilitas order per tim", () => {
  it("produksi hanya melihat antri/print/press", async () => {
    const r = await as("produksi", (c) => c.query("select distinct status::text s from orders"));
    expect(r.rows.map((x) => x.s).every((s) => ["antri", "print", "press"].includes(s))).toBe(true);
    expect(r.rowCount).toBeGreaterThan(0);
  });
  it("finishing hanya melihat finishing/qc/kirim/selesai", async () => {
    const r = await as("finishing", (c) => c.query("select distinct status::text s from orders"));
    expect(r.rows.map((x) => x.s).every((s) => ["finishing", "qc", "kirim", "selesai"].includes(s))).toBe(true);
  });
  it("produksi tidak bisa UPDATE orders langsung", async () => {
    const r = await as("produksi", (c) => c.query("update orders set qty = 999 returning id"));
    expect(r.rowCount).toBe(0);
  });
  it("anon tidak punya akses tabel", async () => {
    expect(await as("anon", (c) => fails(c, "select * from orders"))).toMatch(/permission denied/);
    expect(await as("anon", (c) => fails(c, "select * from customers"))).toMatch(/permission denied/);
  });
});

d()("alur status", () => {
  const newOrder = (c: pg.PoolClient) =>
    c.query(`insert into orders (customer_name, channel, product, qty) values ('Uji Coba', 'shopee', 'Hijab Printing', 2) returning *`)
      .then((r) => r.rows[0]);

  it("order baru: nomor ORD-YYMMDD-NNN & kode lacak valid, status dipaksa 'baru'", async () => {
    await as("order", async (c) => {
      const o = (await c.query(`insert into orders (customer_name, channel, product, qty, status) values ('A', 'shopee', 'Jersey', 1, 'selesai') returning *`)).rows[0];
      expect(o.no).toMatch(/^ORD-\d{6}-\d{3}$/);
      expect(o.track_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(o.status).toBe("baru");
      const ev = await c.query("select kind, to_status from order_events where order_id = $1", [o.id]);
      expect(ev.rows).toEqual([{ kind: "create", to_status: "baru" }]);
    });
  });
  it("UPDATE status langsung ditolak (harus lewat change_order_status)", async () => {
    await as("order", async (c) => {
      const o = await newOrder(c);
      expect(await fails(c, "update orders set status = 'antri' where id = $1", [o.id])).toMatch(/alur status/);
    });
  });
  it("baru → antri tanpa desain ditolak; dengan desain boleh & tercatat", async () => {
    await as("order", async (c) => {
      const o = await newOrder(c);
      expect(await fails(c, "select change_order_status($1, 'antri')", [o.id])).toMatch(/Belum ada file desain/);
      await c.query(`insert into designs (order_id, file_name, uploaded_by) values ($1, 'x.png', $2)`, [o.id, U.order]);
      await c.query("select change_order_status($1, 'antri')", [o.id]);
      const ev = await c.query("select from_status, to_status, by_user from order_events where order_id = $1 and kind = 'status'", [o.id]);
      expect(ev.rows).toEqual([{ from_status: "baru", to_status: "antri", by_user: U.order }]);
    });
  });
  it("tidak boleh lompat tahap; mundur wajib alasan", async () => {
    await as("produksi", async (c) => {
      const id = (await c.query("select id from orders where status = 'print' limit 1")).rows[0].id;
      expect(await fails(c, "select change_order_status($1, 'finishing')", [id])).toMatch(/satu tahap/);
      expect(await fails(c, "select change_order_status($1, 'antri')", [id])).toMatch(/wajib mengisi alasan/);
      const r = await c.query("select (change_order_status($1, 'antri', 'File pecah')).issue", [id]);
      expect(r.rows[0].issue).toBe("File pecah");
    });
  });
  it("tim yang bukan pemilik tahap ditolak", async () => {
    await as("order", async (c) => {
      const id = (await c.query("select id from orders where status = 'press' limit 1")).rows[0].id;
      expect(await fails(c, "select change_order_status($1, 'finishing')", [id])).toMatch(/bukan milik tim/);
    });
    await as("produksi", async (c) => {
      const id = (await c.query("select id from orders where status = 'press' limit 1")).rows[0].id;
      await c.query("select change_order_status($1, 'finishing')", [id]);
      // setelah pindah ke finishing, order hilang dari pandangan produksi
      expect((await c.query("select 1 from orders where id = $1", [id])).rowCount).toBe(0);
    });
  });
  it("selesai wajib resi (kecuali offline)", async () => {
    await as("finishing", async (c) => {
      const id = (await c.query("select id from orders where status = 'kirim' limit 1")).rows[0].id;
      await c.query("reset role");
      await c.query("select set_config('app.via_status_fn','on',true)");
      await c.query("update orders set resi = null where id = $1", [id]);
      await c.query("select set_config('app.via_status_fn','off',true)");
      await c.query("set local role authenticated");
      expect(await fails(c, "select change_order_status($1, 'selesai')", [id])).toMatch(/resi/);
      const r = await c.query("select * from change_order_status($1, 'selesai', null, 'JP123', 'JNE')", [id]);
      expect(r.rows[0]).toMatchObject({ status: "selesai", resi: "JP123", courier: "JNE" });
      expect(r.rows[0].done_at).toBeTruthy();
    });
  });
  it("produksi tidak bisa input resi", async () => {
    await as("produksi", async (c) => {
      const id = (await c.query("select id from orders limit 1")).rows[0].id;
      expect(await fails(c, "select set_order_resi($1, 'X')", [id])).toMatch(/tidak punya akses/);
    });
  });
});

d()("lacak publik", () => {
  it("anon tidak bisa memanggil track_lookup langsung (hanya server/service_role)", async () => {
    expect(await as("anon", (c) => fails(c, "select track_lookup('ABCDEFGH')"))).toMatch(/permission denied/);
  });
  it("track_lookup hanya mengembalikan kolom aman", async () => {
    const c = await pool.connect();
    try {
      const code = (await c.query("select track_code from orders where status = 'kirim' limit 1")).rows[0].track_code;
      const r = (await c.query("set role service_role; select track_lookup($1) t", [code]).catch(async () => {
        await c.query("set role service_role");
        return c.query("select track_lookup($1) t", [code]);
      })) as pg.QueryResult;
      const t = (Array.isArray(r) ? r[1] : r).rows[0].t;
      expect(Object.keys(t).sort()).toEqual(
        ["code", "courier", "created_at", "deadline", "done_at", "entered", "has_issue", "no", "product", "qty", "resi", "status", "unit"].sort(),
      );
      const json = JSON.stringify(t);
      expect(json).not.toMatch(/Hotel Nusa|0811|Kuta|"issue"|"note|harga|customer|wa"/i);
    } finally {
      await c.query("reset role");
      c.release();
    }
  });
  it("lookup no order + 4 digit WA: salah → null, benar → data", async () => {
    const c = await pool.connect();
    try {
      const { no, wa } = (await c.query("select o.no, c.wa from orders o join customers c on c.id = o.customer_id limit 1")).rows[0];
      const last4 = wa.replace(/\D/g, "").slice(-4);
      await c.query("set role service_role");
      expect((await c.query("select track_lookup_by_order($1, '0000') t", [no])).rows[0].t).toBeNull();
      expect((await c.query("select track_lookup_by_order($1, $2) t", [no.toLowerCase(), last4])).rows[0].t.no).toBe(no);
    } finally {
      await c.query("reset role");
      c.release();
    }
  });
  it("kendala internal tidak bocor: hanya flag has_issue", async () => {
    const c = await pool.connect();
    try {
      const code = (await c.query("select track_code from orders where issue is not null limit 1")).rows[0].track_code;
      const t = (await c.query("select track_lookup($1) t", [code])).rows[0].t;
      expect(t.has_issue).toBe(true);
      expect(JSON.stringify(t)).not.toMatch(/cetak ulang/);
    } finally {
      c.release();
    }
  });
  it("rate limit 10 percobaan / 10 menit", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const key = `test-${Math.random()}`;
      const res: boolean[] = [];
      for (let i = 0; i < 12; i++) res.push((await c.query("select rate_limit_hit($1, 10, 600) ok", [key])).rows[0].ok);
      expect(res.filter(Boolean)).toHaveLength(10);
      expect(res.slice(10)).toEqual([false, false]);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});

d()("penomoran & order ulang", () => {
  it("20 insert paralel → nomor unik berurutan", async () => {
    const ids: string[] = [];
    try {
      const nos = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const c = await pool.connect();
          try {
            const r = await c.query(`insert into orders (customer_name, channel, product, qty) values ('Paralel', 'offline', 'Jersey', 1) returning id, no`);
            ids.push(r.rows[0].id);
            return r.rows[0].no as string;
          } finally {
            c.release();
          }
        }),
      );
      expect(new Set(nos).size).toBe(20);
    } finally {
      await pool.query("delete from orders where id = any($1)", [ids]);
    }
  });
  it("reorder_order menyalin data + file aktif dan mengisi reorder_of", async () => {
    await as("order", async (c) => {
      const src = (await c.query("select id from orders where status = 'selesai' limit 1")).rows[0].id;
      const newId = (await c.query("select reorder_order($1) id", [src])).rows[0].id;
      const o = (await c.query("select * from orders where id = $1", [newId])).rows[0];
      expect(o).toMatchObject({ reorder_of: src, status: "baru" });
      const ds = await c.query("select copied_from, is_active from designs where order_id = $1", [newId]);
      expect(ds.rowCount).toBeGreaterThan(0);
      expect(ds.rows.every((x) => x.is_active && x.copied_from)).toBe(true);
      // order ulang langsung bisa dikirim ke produksi karena file sudah ada
      await c.query("select change_order_status($1, 'antri')", [newId]);
    });
  });
  it("produksi tidak bisa order ulang", async () => {
    await as("produksi", async (c) => {
      const id = (await c.query("select id from orders limit 1")).rows[0].id;
      expect(await fails(c, "select reorder_order($1)", [id])).toMatch(/hanya untuk tim order/);
    });
  });
  it("revisi desain menonaktifkan versi lama", async () => {
    await as("produksi", async (c) => {
      const id = (await c.query("select id from orders where status = 'antri' limit 1")).rows[0].id;
      await c.query(`insert into designs (order_id, file_no, version, file_name, uploaded_by) values ($1, 1, 2, 'rev.png', $2)`, [id, U.produksi]);
      const r = await c.query("select version, is_active from designs where order_id = $1 and file_no = 1 order by version", [id]);
      expect(r.rows).toEqual([{ version: 1, is_active: false }, { version: 2, is_active: true }]);
    });
  });
  it("finishing tidak bisa upload desain", async () => {
    await as("finishing", async (c) => {
      const id = (await c.query("select id from orders limit 1")).rows[0].id;
      expect(await fails(c, `insert into designs (order_id, file_name, uploaded_by) values ($1, 'x.png', $2)`, [id, U.finishing])).toMatch(/row-level security/);
    });
  });
});

d()("ringkasan & analisa", () => {
  it("dashboard_summary untuk semua staf, analytics hanya admin/order", async () => {
    const s = await as("produksi", (c) => c.query("select dashboard_summary() s"));
    expect(s.rows[0].s).toHaveProperty("aktif");
    expect(await as("produksi", (c) => fails(c, "select analytics(30)"))).toMatch(/hanya untuk admin/);
    const a = (await as("admin", (c) => c.query("select analytics(90) a"))).rows[0].a;
    for (const k of ["wip", "stage_hours", "throughput", "channels", "products", "weekly", "totals", "repeat", "top_repeat"]) {
      expect(a).toHaveProperty(k);
    }
    expect(a.repeat.customers).toBeGreaterThan(0);
  });
  it("tv_board hanya nama depan", async () => {
    const r = await as("produksi", (c) => c.query("select nama from tv_board()"));
    expect(r.rows.every((x) => !x.nama.includes(" "))).toBe(true);
  });
});
