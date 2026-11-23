// Kalimat "Analisa & tindakan" otomatis — menghubungkan kondisi produksi
// dengan keputusan marketing (budget iklan, janji waktu proses, broadcast WA).
import { STATUS_LABEL, type OrderStatus } from "./status";
import { channelLabel } from "./products";
import { fmtHours } from "./dates";

export type Analytics = {
  days: number;
  wip: Partial<Record<OrderStatus, number>>;
  stage_hours: { status: OrderStatus; jam: number | null; p80: number | null; n: number }[];
  throughput: { hari: string; tim: "order" | "produksi" | "finishing"; n: number }[];
  channels: { channel: string; orders: number; units: number; late_pct: number | null; selesai: number }[];
  products: { product: string; orders: number; units: number }[];
  weekly: { minggu: string; orders: number; units: number }[];
  totals: { orders: number; units: number; late_pct: number | null; reorders: number };
  repeat: { customers: number; all_customers: number; orders_from_repeat_pct: number | null };
  top_repeat: { name: string; orders: number; last: string }[];
};

export type Insight = { tone: "warning" | "info" | "success"; title: string; action: string };

const PROD_STAGES: OrderStatus[] = ["antri", "print", "press", "finishing", "qc", "kirim"];

export function findBottleneck(wip: Analytics["wip"]): { status: OrderStatus; n: number } | null {
  let best: { status: OrderStatus; n: number } | null = null;
  for (const [s, n] of Object.entries(wip) as [OrderStatus, number][]) {
    if (s === "selesai") continue;
    if (!best || n > best.n) best = { status: s, n };
  }
  return best && best.n > 0 ? best : null;
}

/** Total jam proses rata-rata & P80 dari Antri s/d Siap kirim */
export function processPromise(stageHours: Analytics["stage_hours"]): { avgHours: number; p80Hours: number } | null {
  const rows = stageHours.filter((r) => PROD_STAGES.includes(r.status) && r.jam != null);
  if (rows.length < 3) return null;
  const avgHours = rows.reduce((a, r) => a + Number(r.jam), 0);
  const p80Hours = rows.reduce((a, r) => a + Number(r.p80 ?? r.jam), 0);
  return { avgHours, p80Hours };
}

/** Rata-rata order/hari yang diselesaikan tim (forward move) dalam data throughput */
export function avgDailyThroughput(rows: Analytics["throughput"], tim: "produksi" | "finishing"): number | null {
  const byDay = new Map<string, number>();
  for (const r of rows) if (r.tim === tim) byDay.set(r.hari, (byDay.get(r.hari) ?? 0) + r.n);
  if (byDay.size === 0) return null;
  // produksi punya 3 langkah (antri→print→press→finishing): bagi 3 agar satuan = order
  const steps = 3;
  const total = [...byDay.values()].reduce((a, b) => a + b, 0) / steps;
  return total / byDay.size;
}

export function weeklyChange(weekly: Analytics["weekly"]): { pct: number; last: number; prev: number } | null {
  // minggu terakhir bisa belum penuh → bandingkan 2 minggu penuh terakhir bila ada ≥3 data
  if (weekly.length < 3) return null;
  const last = weekly[weekly.length - 2].orders;
  const prev = weekly[weekly.length - 3].orders;
  if (prev === 0) return null;
  return { pct: Math.round(((last - prev) / prev) * 100), last, prev };
}

export function generateInsights(a: Analytics): Insight[] {
  const out: Insight[] = [];

  // 1) Bottleneck
  const b = findBottleneck(a.wip);
  if (b && b.n >= 3) {
    if (b.status === "baru") {
      out.push({
        tone: "warning",
        title: `Order menumpuk di "Order masuk" (${b.n} order)`,
        action: "Percepat konfirmasi desain & pembayaran. Setiap jam tertunda di sini memotong waktu produksi dan menaikkan risiko telat kirim marketplace.",
      });
    } else {
      out.push({
        tone: "warning",
        title: `Bottleneck di ${STATUS_LABEL[b.status]} (${b.n} order)`,
        action: `Tambah shift/operator ${STATUS_LABEL[b.status].toLowerCase()} sebelum menaikkan budget iklan — menambah order saat antrian macet hanya menambah order telat & rating buruk.`,
      });
    }
  }

  // 2) Janji waktu proses untuk listing & iklan
  const p = processPromise(a.stage_hours);
  if (p) {
    const days = Math.max(1, Math.ceil(p.p80Hours / 24));
    out.push({
      tone: "info",
      title: `Kapasitas riil: rata-rata ${fmtHours(p.avgHours)} dari antri sampai siap kirim (80% order ≤ ${fmtHours(p.p80Hours)})`,
      action: `Pasang janji "dikirim dalam ${days} hari kerja" / masa pre-order ${days} hari di listing Shopee/TikTok/Tokopedia dan di copy iklan. Jangan menjanjikan lebih cepat dari angka ini.`,
    });
  }

  // 3) Channel dengan keterlambatan tinggi
  const lateCh = a.channels
    .filter((c) => c.orders >= 3 && (c.late_pct ?? 0) >= 20)
    .sort((x, y) => (y.late_pct ?? 0) - (x.late_pct ?? 0));
  for (const c of lateCh.slice(0, 2)) {
    out.push({
      tone: "warning",
      title: `${c.late_pct}% order ${channelLabel(c.channel)} telat`,
      action: ["shopee", "tiktok", "tokopedia", "lazada", "blibli"].includes(c.channel)
        ? "Risiko penalti & turunnya performa toko. Prioritaskan antrian channel ini atau perpanjang masa pre-order sampai keterlambatan < 5%."
        : "Beri estimasi yang lebih realistis saat closing dan kirim update status via tombol 'Salin pesan update'.",
    });
  }

  // 4) Channel & produk unggulan → alokasi budget
  const totalUnits = a.channels.reduce((s, c) => s + Number(c.units), 0);
  const topCh = [...a.channels].sort((x, y) => y.units - x.units)[0];
  if (topCh && totalUnits > 0) {
    const share = Math.round((topCh.units / totalUnits) * 100);
    out.push({
      tone: "success",
      title: `${channelLabel(topCh.channel)} menyumbang ${share}% unit (${topCh.units} unit, ${a.days} hari)`,
      action: share >= 50
        ? "Ketergantungan tinggi pada satu channel. Pertahankan iklan di sini, tapi uji 10–20% budget di channel kedua untuk mengurangi risiko."
        : "Distribusi channel cukup sehat. Naikkan budget bertahap (20–30%/minggu) di channel dengan unit terbanyak selama tingkat telat tetap rendah.",
    });
  }
  const topProd = [...a.products].sort((x, y) => y.units - x.units)[0];
  if (topProd) {
    out.push({
      tone: "success",
      title: `Produk terlaris: ${topProd.product} (${topProd.units} unit dari ${topProd.orders} order)`,
      action: "Jadikan hero produk di Meta/TikTok Ads & etalase marketplace; buat bundling dengan produk lain (mis. hijab + pashmina motif sama) untuk menaikkan nilai order.",
    });
  }

  // 5) Repeat customer
  const rp = a.repeat.orders_from_repeat_pct;
  if (rp != null && a.repeat.all_customers >= 5) {
    out.push(
      rp < 30
        ? {
            tone: "info",
            title: `Baru ${rp}% order dari pelanggan lama (${a.repeat.customers} repeat customer)`,
            action: "Export CSV repeat customer → broadcast WA promo order ulang & unggah sebagai Custom Audience / Lookalike di Meta & TikTok Ads.",
          }
        : {
            tone: "success",
            title: `${rp}% order dari pelanggan lama — loyalitas kuat`,
            action: "Tawarkan program reseller/harga grosir ke repeat customer teratas, dan gunakan mereka sebagai seed Lookalike audience.",
          },
    );
  }

  // 6) Tren mingguan
  const w = weeklyChange(a.weekly);
  if (w && Math.abs(w.pct) >= 15) {
    out.push(
      w.pct < 0
        ? {
            tone: "warning",
            title: `Order turun ${-w.pct}% dibanding minggu sebelumnya (${w.prev} → ${w.last})`,
            action: "Cek ROAS & frekuensi iklan, stok/rating listing, dan jadwalkan flash sale atau broadcast WA ke repeat customer.",
          }
        : {
            tone: "success",
            title: `Order naik ${w.pct}% dibanding minggu sebelumnya (${w.prev} → ${w.last})`,
            action: "Pastikan kapasitas produksi ikut naik sebelum scale-up iklan lebih jauh (lihat bottleneck & throughput).",
          },
    );
  }

  // 7) Kapasitas vs order masuk
  const prodPerDay = avgDailyThroughput(a.throughput, "produksi");
  const incomingPerDay = a.days > 0 ? a.totals.orders / a.days : 0;
  if (prodPerDay != null && incomingPerDay > 0) {
    if (incomingPerDay > prodPerDay * 1.1) {
      out.push({
        tone: "warning",
        title: `Order masuk ${incomingPerDay.toFixed(1)}/hari > kapasitas produksi ${prodPerDay.toFixed(1)}/hari`,
        action: "Antrian akan terus memanjang. Tahan kenaikan budget iklan, tambah kapasitas (shift/mesin) atau naikkan harga untuk order urgent.",
      });
    } else if (incomingPerDay < prodPerDay * 0.7) {
      out.push({
        tone: "success",
        title: `Kapasitas produksi masih longgar (${prodPerDay.toFixed(1)}/hari vs order ${incomingPerDay.toFixed(1)}/hari)`,
        action: "Saat yang tepat menaikkan budget iklan 20–30% atau membuka promo B2B/seragam untuk mengisi kapasitas kosong.",
      });
    }
  }

  return out;
}
