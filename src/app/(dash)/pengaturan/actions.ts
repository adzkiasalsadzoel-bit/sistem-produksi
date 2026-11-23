"use server";
import { revalidatePath } from "next/cache";
import { assertStaff, AuthError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { settingsSchema, staffSchema } from "@/lib/validation";
import { driveConfigured, driveStats, listSharedDrives, serviceAccountEmail } from "@/lib/drive";
import { friendlyError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

type FormState = { ok?: boolean; error?: string; message?: string } | undefined;
const err = (e: unknown) => ({ error: e instanceof AuthError ? e.message : friendlyError(e) });

export async function saveSettingsAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { supabase } = await assertStaff(["admin"]);
    const v = settingsSchema.parse(Object.fromEntries(form));
    const rows = [
      { key: "nama_usaha", value: v.nama_usaha },
      { key: "wa_bisnis", value: v.wa_bisnis.replace(/\D/g, "") },
      { key: "lead_time_default_hari", value: v.lead_time_default_hari },
      { key: "banner_lacak", value: { aktif: v.banner_aktif, judul: v.banner_judul, teks: v.banner_teks, tombol: v.banner_tombol } },
    ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("settings").upsert(rows);
    if (error) return { error: friendlyError(error) };
    revalidatePath("/pengaturan");
    return { ok: true, message: "Pengaturan tersimpan" };
  } catch (e) {
    return err(e);
  }
}

export async function testDriveAction(): Promise<ActionResult<{ email: string | null; drives: { id: string; name: string }[] }>> {
  try {
    await assertStaff(["admin"]);
    if (!driveConfigured()) return { ok: false, error: "Service account belum diisi di env (GOOGLE_SERVICE_ACCOUNT_BASE64)" };
    const drives = await listSharedDrives();
    return { ok: true, data: { email: serviceAccountEmail(), drives } };
  } catch (e) {
    return { ok: false, ...err(e) };
  }
}

export async function chooseDriveAction(driveId: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertStaff(["admin"]);
    const { error } = await supabase.from("settings").upsert({ key: "drive_id", value: driveId, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath("/pengaturan");
    return { ok: true };
  } catch (e) {
    return { ok: false, ...err(e) };
  }
}

export async function driveStatsAction(driveId: string): Promise<ActionResult<Awaited<ReturnType<typeof driveStats>>>> {
  try {
    await assertStaff(["admin"]);
    return { ok: true, data: await driveStats(driveId) };
  } catch (e) {
    return { ok: false, ...err(e) };
  }
}

export async function createStaffAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await assertStaff(["admin"]);
    const v = staffSchema.parse(Object.fromEntries(form));
    const { error } = await createAdminClient().auth.admin.createUser({
      email: v.email,
      password: v.password,
      email_confirm: true,
      app_metadata: { role: v.role }, // peran dari app_metadata → tidak bisa diubah user sendiri
      user_metadata: { full_name: v.full_name },
    });
    if (error) return { error: error.message.includes("already") ? "Email sudah terdaftar" : error.message };
    revalidatePath("/pengaturan");
    return { ok: true, message: `Akun ${v.email} dibuat` };
  } catch (e) {
    return err(e);
  }
}

export async function updateStaffAction(id: string, patch: { role?: string; active?: boolean }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff(["admin"]);
    if (id === user.id && (patch.active === false || (patch.role && patch.role !== "admin"))) {
      return { ok: false, error: "Tidak bisa menonaktifkan / menurunkan peran akun Anda sendiri" };
    }
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) return { ok: false, error: friendlyError(error) };
    if (patch.role) await createAdminClient().auth.admin.updateUserById(id, { app_metadata: { role: patch.role } });
    revalidatePath("/pengaturan");
    return { ok: true };
  } catch (e) {
    return { ok: false, ...err(e) };
  }
}
