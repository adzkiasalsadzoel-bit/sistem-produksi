"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertStaff, AuthError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { orderSchema, statusChangeSchema } from "@/lib/validation";
import { friendlyError } from "@/lib/utils";
import { normalizeWa } from "@/lib/track";
import { copyFile, driveConfigured, ensureOrderFolder } from "@/lib/drive";
import { designFileName } from "@/lib/naming";
import type { ActionResult, Design, Order } from "@/lib/types";

function revalidateBoards(orderId?: string) {
  for (const p of ["/ringkasan", "/order", "/produksi", "/finishing", "/arsip", "/tv"]) revalidatePath(p);
  if (orderId) revalidatePath(`/order/${orderId}`);
}

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  return { ok: false, error: friendlyError(e) };
}

// ---------------------------------------------------------------------
// Alur status (aturan ditegakkan oleh fungsi Postgres change_order_status)
// ---------------------------------------------------------------------
export async function changeStatusAction(input: { orderId: string; to: string; note?: string; resi?: string; courier?: string }): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff();
    const v = statusChangeSchema.parse(input);
    const { error } = await supabase.rpc("change_order_status", {
      p_order: v.orderId, p_to: v.to, p_note: v.note || null, p_resi: v.resi || null, p_courier: v.courier || null,
    });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidateBoards(v.orderId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setIssueAction(orderId: string, issue: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff();
    const { error } = await supabase.rpc("set_order_issue", { p_order: orderId, p_issue: issue });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidateBoards(orderId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setResiAction(orderId: string, resi: string, courier: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff(["admin", "order", "finishing"]);
    const { error } = await supabase.rpc("set_order_resi", { p_order: orderId, p_resi: resi, p_courier: courier });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidateBoards(orderId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------
// SPK (buat / edit) — hanya admin & order
// ---------------------------------------------------------------------
type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

async function upsertCustomer(supabase: Awaited<ReturnType<typeof assertStaff>>["supabase"], v: ReturnType<typeof orderSchema.parse>) {
  const payload = { name: v.customer_name, wa: v.customer_wa, address: v.customer_address, email: v.customer_email };
  let id = v.customer_id;
  // Dedupe berdasarkan no WA agar repeat customer terdeteksi
  if (!id && v.customer_wa) {
    const norm = normalizeWa(v.customer_wa);
    const local = norm.startsWith("62") ? "0" + norm.slice(2) : norm;
    const { data } = await supabase.from("customers").select("id").in("wa_norm", [norm, local]).limit(1).maybeSingle();
    id = data?.id ?? null;
  }
  if (id) {
    const patch = Object.fromEntries(Object.entries(payload).filter(([, val]) => val !== null));
    const { error } = await supabase.from("customers").update(patch).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

function parseOrderForm(form: FormData) {
  const parsed = orderSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Periksa kembali isian yang ditandai", fieldErrors } as const;
  }
  return { data: parsed.data } as const;
}

export async function createOrderAction(_: FormState, form: FormData): Promise<FormState> {
  let newId: string;
  try {
    const { supabase } = await assertStaff(["admin", "order"]);
    const p = parseOrderForm(form);
    if ("error" in p) return p;
    const v = p.data;
    const customerId = await upsertCustomer(supabase, v);
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        customer_id: customerId, customer_name: v.customer_name, channel: v.channel, product: v.product,
        material: v.material, size: v.size, print_width_cm: v.print_width_cm, qty: v.qty, unit: v.unit,
        deadline: v.deadline, priority: v.priority, note_production: v.note_production,
      })
      .select("id")
      .single();
    if (error) return { error: friendlyError(error) };
    newId = order.id;
    if (v.marketplace_ref || v.payment_note) {
      await supabase.from("order_private").insert({ order_id: newId, marketplace_ref: v.marketplace_ref, payment_note: v.payment_note });
    }
  } catch (e) {
    return { error: fail(e).error };
  }
  revalidateBoards();
  redirect(`/order/${newId}?baru=1`);
}

export async function updateOrderAction(orderId: string, _: FormState, form: FormData): Promise<FormState> {
  try {
    const { supabase } = await assertStaff(["admin", "order"]);
    const p = parseOrderForm(form);
    if ("error" in p) return p;
    const v = p.data;
    const customerId = await upsertCustomer(supabase, v);
    const { error } = await supabase
      .from("orders")
      .update({
        customer_id: customerId, customer_name: v.customer_name, channel: v.channel, product: v.product,
        material: v.material, size: v.size, print_width_cm: v.print_width_cm, qty: v.qty, unit: v.unit,
        deadline: v.deadline, priority: v.priority, note_production: v.note_production,
      })
      .eq("id", orderId);
    if (error) return { error: friendlyError(error) };
    await supabase.from("order_private").upsert({ order_id: orderId, marketplace_ref: v.marketplace_ref, payment_note: v.payment_note });
    await supabase.rpc("log_audit", { p_action: "edit_order", p_order: orderId, p_detail: null });
  } catch (e) {
    return { error: fail(e).error };
  }
  revalidateBoards(orderId);
  redirect(`/order/${orderId}`);
}

// ---------------------------------------------------------------------
// Order ulang satu klik
// ---------------------------------------------------------------------
export async function reorderAction(orderId: string, opts: { deadline?: string; qty?: number } = {}): Promise<ActionResult<{ id: string; driveNote?: string }>> {
  try {
    const { supabase } = await assertStaff(["admin", "order"]);
    const { data: newId, error } = await supabase.rpc("reorder_order", {
      p_order: orderId, p_deadline: opts.deadline || null, p_qty: opts.qty || null,
    });
    if (error) return { ok: false, error: friendlyError(error) };

    // Salin file aktif ke folder order baru di Drive (server-side copy, tidak lewat Vercel).
    // Bila gagal, desain tetap menunjuk file lama — order tetap bisa diproduksi.
    let driveNote: string | undefined;
    if (driveConfigured()) {
      try {
        driveNote = await copyDesignsToNewOrder(newId as string);
      } catch (e) {
        driveNote = `File tidak disalin di Drive (${friendlyError(e)}); memakai file order lama.`;
      }
    }
    revalidateBoards(newId as string);
    return { ok: true, data: { id: newId as string, driveNote } };
  } catch (e) {
    return fail(e);
  }
}

async function copyDesignsToNewOrder(orderId: string): Promise<string | undefined> {
  const admin = createAdminClient();
  const { data: o } = await admin.from("orders").select("*").eq("id", orderId).single<Order>();
  const { data: setting } = await admin.from("settings").select("value").eq("key", "drive_id").maybeSingle();
  const driveId = (setting?.value as string | null) || process.env.GOOGLE_SHARED_DRIVE_ID;
  if (!o || !driveId) return "Shared Drive belum dipilih — file memakai folder order lama.";
  const folder = await ensureOrderFolder({ driveId, no: o.no, customerName: o.customer_name, product: o.product, createdAt: o.created_at });
  await admin.from("orders").update({ drive_folder_id: folder.id, drive_folder_url: folder.webViewLink }).eq("id", o.id);
  const { data: designs } = await admin.from("designs").select("*").eq("order_id", o.id).eq("is_active", true);
  for (const d of (designs ?? []) as Design[]) {
    if (!d.drive_file_id) continue;
    const name = designFileName(o.no, d.file_no, d.original_name ?? d.file_name);
    const copy = await copyFile(d.drive_file_id, name, folder.id);
    await admin.from("designs").update({ drive_file_id: copy.id, drive_url: copy.webViewLink, file_name: name }).eq("id", d.id);
  }
  return undefined;
}

// ---------------------------------------------------------------------
// Cari customer lama (autocomplete form SPK) — hanya admin & order
// ---------------------------------------------------------------------
export async function searchCustomersAction(q: string): Promise<{ id: string; name: string; wa: string | null; address: string | null; email: string | null }[]> {
  const { supabase } = await assertStaff(["admin", "order"]);
  const term = q.trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  const safe = term.replace(/[%,()]/g, " ");
  let query = supabase.from("customers").select("id, name, wa, address, email").limit(8);
  query = digits.length >= 4 ? query.ilike("wa_norm", `%${digits.replace(/^(62|0)/, "")}%`) : query.ilike("name", `%${safe}%`);
  const { data } = await query;
  await supabase.rpc("log_audit", { p_action: "cari_customer", p_order: null, p_detail: { q: term.slice(0, 40) } });
  return data ?? [];
}
