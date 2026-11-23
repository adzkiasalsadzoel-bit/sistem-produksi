import "server-only";
import { JWT } from "google-auth-library";
import { serverEnv } from "@/lib/env";
import { monthFolderName, orderFolderName } from "@/lib/naming";

// Google Drive API v3 via REST + Service Account.
// Semua file tersimpan di SATU Shared Drive: /YYYY-MM/ORD-... · Nama · Produk/file

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const SCOPES = ["https://www.googleapis.com/auth/drive"];

let jwt: JWT | null = null;

function credentials(): { email: string; key: string } | null {
  const env = serverEnv();
  if (env.googleSaBase64) {
    const json = JSON.parse(Buffer.from(env.googleSaBase64, "base64").toString("utf8"));
    return { email: json.client_email, key: json.private_key };
  }
  if (env.googleSaEmail && env.googlePrivateKey) return { email: env.googleSaEmail, key: env.googlePrivateKey };
  return null;
}

export function driveConfigured(): boolean {
  try {
    return credentials() !== null;
  } catch {
    return false;
  }
}

export function serviceAccountEmail(): string | null {
  try {
    return credentials()?.email ?? null;
  } catch {
    return null;
  }
}

async function accessToken(): Promise<string> {
  if (!jwt) {
    const c = credentials();
    if (!c) throw new DriveError("Service account Google belum dikonfigurasi (lihat .env.example)", 503);
    jwt = new JWT({ email: c.email, key: c.key, scopes: SCOPES });
  }
  const { token } = await jwt.getAccessToken();
  if (!token) throw new DriveError("Gagal mendapat access token Google", 502);
  return token;
}

export class DriveError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit & { raw?: boolean } = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DriveError(`Google Drive ${res.status}: ${body.slice(0, 300)}`, res.status);
  }
  return (init.raw ? res : res.json()) as Promise<T>;
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const common = "supportsAllDrives=true";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
  thumbnailLink?: string;
  imageMediaMetadata?: { width?: number; height?: number };
};

export async function listSharedDrives(): Promise<{ id: string; name: string }[]> {
  const r = await api<{ drives: { id: string; name: string }[] }>(`/drives?pageSize=100`);
  return r.drives ?? [];
}

export async function ensureFolder(name: string, parentId: string, driveId: string): Promise<{ id: string; webViewLink: string }> {
  const query = `name = '${q(name)}' and '${parentId}' in parents and mimeType = '${FOLDER}' and trashed = false`;
  const found = await api<{ files: { id: string; webViewLink: string }[] }>(
    `/files?${common}&includeItemsFromAllDrives=true&corpora=drive&driveId=${driveId}&q=${encodeURIComponent(query)}&fields=files(id,webViewLink)`,
  );
  if (found.files?.[0]) return found.files[0];
  return api(`/files?${common}&fields=id,webViewLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  });
}

/** Folder bulan (YYYY-MM dari tanggal order) + folder order */
export async function ensureOrderFolder(o: { driveId: string; no: string; customerName: string; product: string; createdAt: string }) {
  const month = await ensureFolder(monthFolderName(new Date(o.createdAt)), o.driveId, o.driveId);
  return ensureFolder(orderFolderName(o.no, o.customerName, o.product), month.id, o.driveId);
}

/**
 * Sesi resumable upload. URL yang dikembalikan dipakai BROWSER untuk upload langsung
 * ke Google (file besar tidak lewat server). Header Origin wajib agar CORS diizinkan.
 */
export async function createResumableSession(o: { name: string; mime: string; size: number; parentId: string; origin: string }): Promise<string> {
  const token = await accessToken();
  const res = await fetch(
    `${UPLOAD}/files?uploadType=resumable&${common}&fields=id,name,mimeType,size,webViewLink,parents`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": o.mime || "application/octet-stream",
        "X-Upload-Content-Length": String(o.size),
        Origin: o.origin,
      },
      body: JSON.stringify({ name: o.name, parents: [o.parentId] }),
      cache: "no-store",
    },
  );
  const location = res.headers.get("location");
  if (!res.ok || !location) {
    throw new DriveError(`Gagal membuat sesi upload (${res.status}): ${(await res.text()).slice(0, 200)}`, 502);
  }
  return location;
}

export function getFile(id: string): Promise<DriveFile> {
  return api(`/files/${id}?${common}&fields=id,name,mimeType,size,webViewLink,parents,thumbnailLink,imageMediaMetadata(width,height)`);
}

/** Ambil sebagian byte awal (untuk membaca header dimensi) */
export async function downloadRange(id: string, bytes: number): Promise<Uint8Array> {
  const res = await api<Response>(`/files/${id}?alt=media&${common}`, { raw: true, headers: { Range: `bytes=0-${bytes - 1}` } });
  return new Uint8Array(await res.arrayBuffer());
}

export async function downloadFile(id: string): Promise<Buffer> {
  const res = await api<Response>(`/files/${id}?alt=media&${common}`, { raw: true });
  return Buffer.from(await res.arrayBuffer());
}

/** Thumbnail Drive diperbesar ke 1000 px (untuk PSD/PDF/TIFF raksasa) */
export async function downloadThumbnail(thumbnailLink: string): Promise<Buffer | null> {
  try {
    const url = thumbnailLink.replace(/=s\d+$/, "=s1000");
    const res = await api<Response>(url, { raw: true });
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export function copyFile(id: string, name: string, parentId: string): Promise<DriveFile> {
  return api(`/files/${id}/copy?${common}&fields=id,name,webViewLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parents: [parentId] }),
  });
}

/** Statistik Shared Drive untuk halaman Pengaturan */
export async function driveStats(driveId: string): Promise<{ name: string; files: number; bytes: number; truncated: boolean; serviceAccount: string | null }> {
  const drive = await api<{ name: string }>(`/drives/${driveId}?fields=name`);
  let files = 0;
  let bytes = 0;
  let pageToken = "";
  let pages = 0;
  const query = encodeURIComponent(`mimeType != '${FOLDER}' and trashed = false`);
  do {
    const r = await api<{ files: { size?: string }[]; nextPageToken?: string }>(
      `/files?${common}&includeItemsFromAllDrives=true&corpora=drive&driveId=${driveId}&q=${query}&pageSize=1000&fields=nextPageToken,files(size)${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    files += r.files.length;
    bytes += r.files.reduce((a, f) => a + Number(f.size ?? 0), 0);
    pageToken = r.nextPageToken ?? "";
    pages++;
  } while (pageToken && pages < 20);
  return { name: drive.name, files, bytes, truncated: Boolean(pageToken), serviceAccount: serviceAccountEmail() };
}
