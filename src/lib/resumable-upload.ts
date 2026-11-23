// Upload resumable ke Google Drive langsung dari browser.
// Sesi dibuat server (/api/drive/session) → browser mengirim file per-chunk.
// Bila koneksi putus, status ditanyakan ke Google lalu upload dilanjutkan dari byte terakhir.

export const CHUNK_SIZE = 16 * 1024 * 1024; // kelipatan 256 KiB (syarat Google)

export type DriveUploaded = { id: string; name: string; mimeType: string; size?: string; webViewLink?: string };

type XhrResult = { status: number; body: string; range: string | null };

function xhrPut(url: string, body: Blob | null, headers: Record<string, string>, onProgress?: (loaded: number) => void, signal?: AbortSignal): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText, range: safeHeader(xhr, "Range") });
    xhr.onerror = () => resolve({ status: 0, body: "", range: null });
    xhr.ontimeout = () => resolve({ status: 0, body: "", range: null });
    if (signal) {
      if (signal.aborted) return reject(new DOMException("Dibatalkan", "AbortError"));
      signal.addEventListener("abort", () => { xhr.abort(); reject(new DOMException("Dibatalkan", "AbortError")); }, { once: true });
    }
    xhr.send(body);
  });
}

function safeHeader(xhr: XMLHttpRequest, name: string): string | null {
  try {
    return xhr.getResponseHeader(name);
  } catch {
    return null;
  }
}

/** "bytes=0-1048575" → 1048576 (byte berikutnya yang harus dikirim) */
export function nextOffsetFromRange(range: string | null): number | null {
  const m = range ? /bytes=0-(\d+)/.exec(range) : null;
  return m ? Number(m[1]) + 1 : null;
}

export class SessionExpiredError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadResumable(url: string, file: File, onProgress: (sent: number, total: number) => void, signal?: AbortSignal): Promise<DriveUploaded> {
  const total = file.size;
  let offset = 0;
  let failures = 0;

  while (true) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const res = await xhrPut(
      url,
      file.slice(offset, end),
      { "Content-Range": `bytes ${offset}-${end - 1}/${total}` },
      (loaded) => onProgress(offset + loaded, total),
      signal,
    );

    if (res.status === 200 || res.status === 201) {
      onProgress(total, total);
      return JSON.parse(res.body) as DriveUploaded;
    }
    if (res.status === 308) {
      offset = nextOffsetFromRange(res.range) ?? end;
      failures = 0;
      continue;
    }
    if (res.status === 404 || res.status === 410) throw new SessionExpiredError("Sesi upload kedaluwarsa, ulangi upload");
    if (res.status !== 0 && res.status < 500 && res.status !== 429) {
      throw new Error(`Upload ditolak Google (${res.status}) ${res.body.slice(0, 120)}`);
    }

    // Gangguan jaringan / 5xx / 429 → tunggu lalu tanya status ke Google
    if (++failures > 8) throw new Error("Koneksi terputus terus-menerus. Tekan Ulangi untuk melanjutkan.");
    await sleep(Math.min(30_000, 1000 * 2 ** failures));
    const st = await xhrPut(url, null, { "Content-Range": `bytes */${total}` }, undefined, signal);
    if (st.status === 200 || st.status === 201) return JSON.parse(st.body) as DriveUploaded;
    if (st.status === 404 || st.status === 410) throw new SessionExpiredError("Sesi upload kedaluwarsa, ulangi upload");
    if (st.status === 308) offset = nextOffsetFromRange(st.range) ?? 0;
  }
}

/** Preview 1000 px & dimensi dibuat di browser untuk JPG/PNG/WebP (≤ 80 MB) */
export async function browserPreview(file: File): Promise<{ blob: Blob; width: number; height: number } | null> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 80 * 1024 * 1024) return null;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    const out = blob ? { blob, width: bmp.width, height: bmp.height } : null;
    bmp.close();
    return out;
  } catch {
    return null;
  }
}
