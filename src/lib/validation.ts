import { z } from "zod";
import { CHANNEL_IDS } from "./products";
import { STATUSES } from "./status";

const optText = (max = 500) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const optNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : Number(String(v).replace(",", "."))))
  .refine((v) => v === null || (Number.isFinite(v) && v > 0), "Harus angka > 0");

export const orderSchema = z.object({
  customer_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  customer_name: z.string().trim().min(2, "Nama customer wajib diisi").max(120),
  customer_wa: optText(30).refine((v) => !v || v.replace(/\D/g, "").length >= 8, "No WA minimal 8 digit"),
  customer_address: optText(500),
  customer_email: optText(120).refine((v) => !v || /.+@.+\..+/.test(v), "Email tidak valid"),
  channel: z.enum(CHANNEL_IDS, { errorMap: () => ({ message: "Pilih channel" }) }),
  marketplace_ref: optText(80),
  payment_note: optText(300),
  product: z.string().trim().min(2, "Produk wajib diisi").max(120),
  material: optText(120),
  size: optText(80),
  print_width_cm: optNumber,
  qty: z.coerce.number({ invalid_type_error: "Qty harus angka" }).int("Qty bilangan bulat").positive("Qty minimal 1").max(1_000_000),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid").optional().or(z.literal("")).transform((v) => v || null),
  priority: z.enum(["normal", "prioritas", "urgent"]).default("normal"),
  note_production: optText(1000),
});
export type OrderInput = z.infer<typeof orderSchema>;

export const statusChangeSchema = z.object({
  orderId: z.string().uuid(),
  to: z.enum(STATUSES),
  note: z.string().trim().max(500).optional(),
  resi: z.string().trim().max(60).optional(),
  courier: z.string().trim().max(60).optional(),
});

export const trackFormSchema = z.union([
  z.object({ mode: z.literal("kode"), code: z.string().trim().min(6).max(12) }),
  z.object({ mode: z.literal("order"), no: z.string().trim().min(8).max(20), wa4: z.string().trim().regex(/^\d{4}$/, "Masukkan 4 digit terakhir no WA") }),
]);

export const settingsSchema = z.object({
  nama_usaha: z.string().trim().min(2).max(80),
  wa_bisnis: z.string().trim().regex(/^[0-9+\-\s]{8,20}$/, "No WA bisnis tidak valid"),
  banner_aktif: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  banner_judul: z.string().trim().max(80),
  banner_teks: z.string().trim().max(240),
  banner_tombol: z.string().trim().max(40),
  lead_time_default_hari: z.coerce.number().int().min(1).max(60),
});

export const staffSchema = z.object({
  email: z.string().trim().email(),
  full_name: z.string().trim().min(2).max(80),
  role: z.enum(["admin", "order", "produksi", "finishing"]),
  password: z.string().min(8, "Password minimal 8 karakter"),
});
