import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Role } from "@/lib/status";

/** Sesi + profil (di-cache per request) */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  return { user, profile: profile ?? null, supabase };
});

/** Wajib login sebagai staf aktif; opsional batasi peran. Redirect bila tidak berhak. */
export async function requireStaff(roles?: Role[]) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.profile || !s.profile.active) redirect("/login?error=nonaktif");
  if (roles && !roles.includes(s.profile.role)) redirect("/ringkasan?error=akses");
  return { ...s, profile: s.profile };
}

/** Versi untuk route handler / server action: lempar error, bukan redirect */
export async function assertStaff(roles?: Role[]) {
  const s = await getSession();
  if (!s?.profile?.active) throw new AuthError("Harus login sebagai staf aktif", 401);
  if (roles && !roles.includes(s.profile.role)) throw new AuthError("Peran Anda tidak punya akses", 403);
  return { ...s, profile: s.profile };
}

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const canSeeCustomer = (role: Role) => role === "admin" || role === "order";
