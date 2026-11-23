// Akses env. Variabel rahasia hanya dibaca di server (file ini tidak boleh diimpor komponen client
// kecuali untuk publicEnv).
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

export function serverEnv() {
  if (typeof window !== "undefined") throw new Error("serverEnv() dipanggil di browser");
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    rateLimitSalt: process.env.RATE_LIMIT_SALT ?? "dev-salt",
    googleSaBase64: process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 ?? "",
    googleSaEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
    googlePrivateKey: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    googleSharedDriveId: process.env.GOOGLE_SHARED_DRIVE_ID ?? "",
    previewMaxDownloadMb: Number(process.env.PREVIEW_MAX_DOWNLOAD_MB ?? 150),
  };
}
