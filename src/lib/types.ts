import type { OrderStatus, Role } from "./status";

export type Profile = { id: string; full_name: string; role: Role; active: boolean };

/** Kolom kerja (view orders_floor) — aman untuk semua tim */
export type FloorOrder = {
  id: string;
  no: string;
  customer_name: string;
  channel: string;
  product: string;
  material: string | null;
  size: string | null;
  print_width_cm: number | null;
  qty: number;
  unit: string;
  deadline: string | null;
  priority: "normal" | "prioritas" | "urgent";
  note_production: string | null;
  status: OrderStatus;
  issue: string | null;
  resi: string | null;
  courier: string | null;
  reorder_of: string | null;
  created_at: string;
  status_changed_at: string;
  done_at: string | null;
  drive_folder_url: string | null;
};

/** Baris lengkap tabel orders (admin/order) */
export type Order = FloorOrder & {
  track_code: string;
  customer_id: string | null;
  created_by: string | null;
  updated_at: string;
  drive_folder_id: string | null;
};

export type Customer = { id: string; name: string; wa: string | null; address: string | null; email: string | null };

export type Design = {
  id: string;
  order_id: string;
  file_no: number;
  version: number;
  is_active: boolean;
  file_name: string;
  original_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  width_px: number | null;
  height_px: number | null;
  ok_4k: boolean | null;
  dpi: number | null;
  dpi_status: "ok" | "rendah" | "manual";
  drive_file_id: string | null;
  drive_url: string | null;
  preview_path: string | null;
  created_at: string;
};

export type OrderEvent = {
  id: number;
  order_id: string;
  kind: "create" | "status" | "issue" | "resi" | "design" | "reorder" | "edit";
  from_status: OrderStatus | null;
  to_status: OrderStatus | null;
  by_user: string | null;
  note: string | null;
  at: string;
};

export type TrackResult = {
  code: string;
  no: string;
  product: string;
  qty: number;
  unit: string;
  status: OrderStatus;
  has_issue: boolean;
  deadline: string | null;
  created_at: string;
  done_at: string | null;
  resi: string | null;
  courier: string | null;
  entered: Partial<Record<OrderStatus, string>>;
};

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
