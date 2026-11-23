"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { browserPreview, SessionExpiredError, uploadResumable } from "@/lib/resumable-upload";
import { fmtBytes } from "@/lib/utils";

type Item = {
  key: string;
  file: File;
  fileNo: number | null; // null = file baru, angka = revisi file itu
  progress: number;
  state: "antri" | "upload" | "proses" | "selesai" | "gagal";
  message?: string;
  uploadUrl?: string;
  session?: { fileNo: number; version: number };
};

const MAX_BYTES = 5 * 1024 * 1024 * 1024;
const ACCEPT = ".png,.jpg,.jpeg,.tif,.tiff,.webp,.psd,.psb,.ai,.cdr,.pdf,.eps,.svg";

export function DesignUploader({ orderId, existingFiles }: { orderId: string; existingFiles: number[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [target, setTarget] = useState<string>("new");
  const inputRef = useRef<HTMLInputElement>(null);
  const aborts = useRef(new Map<string, AbortController>());
  const router = useRouter();

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function run(item: Item) {
    const ac = new AbortController();
    aborts.current.set(item.key, ac);
    try {
      // 1) sesi resumable (dibuat server, kredensial Google tidak pernah ke browser)
      let { uploadUrl, session } = item;
      if (!uploadUrl || !session) {
        patch(item.key, { state: "upload", message: "Menyiapkan folder Drive…" });
        const r = await fetch("/api/drive/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, fileName: item.file.name, mime: item.file.type || "application/octet-stream", size: item.file.size, fileNo: item.fileNo }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Gagal membuat sesi upload");
        uploadUrl = j.uploadUrl as string;
        session = { fileNo: j.fileNo, version: j.version };
        patch(item.key, { uploadUrl, session });
      }

      // 2) upload langsung ke Google Drive
      patch(item.key, { state: "upload", message: undefined });
      const uploaded = await uploadResumable(uploadUrl!, item.file, (sent, total) => patch(item.key, { progress: Math.round((sent / total) * 100) }), ac.signal);

      // 3) finalisasi: dimensi, validasi 4K/DPI, preview
      patch(item.key, { state: "proses", progress: 100, message: "Membaca dimensi & membuat preview…" });
      const fd = new FormData();
      fd.set("orderId", orderId);
      fd.set("driveFileId", uploaded.id);
      fd.set("fileNo", String(session!.fileNo));
      fd.set("version", String(session!.version));
      fd.set("originalName", item.file.name);
      const pv = await browserPreview(item.file);
      if (pv) {
        fd.set("preview", pv.blob, "preview.jpg");
        fd.set("width", String(pv.width));
        fd.set("height", String(pv.height));
      }
      const f = await fetch("/api/drive/finalize", { method: "POST", body: fd });
      const fj = await f.json();
      if (!f.ok) throw new Error(fj.error ?? "Gagal menyimpan data file");
      patch(item.key, { state: "selesai", message: fj.summary });
      router.refresh();
    } catch (e) {
      if ((e as Error).name === "AbortError") return patch(item.key, { state: "gagal", message: "Dibatalkan" });
      if (e instanceof SessionExpiredError) patch(item.key, { uploadUrl: undefined, session: undefined });
      patch(item.key, { state: "gagal", message: (e as Error).message });
    } finally {
      aborts.current.delete(item.key);
    }
  }

  function add(files: FileList | null) {
    if (!files) return;
    const fileNo = target === "new" ? null : Number(target);
    const list = [...files].map<Item>((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`,
      file,
      fileNo,
      progress: 0,
      state: file.size > MAX_BYTES || file.size === 0 ? "gagal" : "antri",
      message: file.size > MAX_BYTES ? "File melebihi 5 GB" : file.size === 0 ? "File kosong" : undefined,
    }));
    setItems((xs) => [...list, ...xs]);
    // upload berurutan agar bandwidth tidak terbagi-bagi
    (async () => {
      for (const it of list) if (it.state === "antri") await run(it);
    })();
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-slate-300 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Upload sebagai</span>
          <Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-56">
            <option value="new">File desain baru</option>
            {existingFiles.map((n) => <option key={n} value={n}>Revisi file #{String(n).padStart(2, "0")}</option>)}
          </Select>
        </label>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => add(e.target.files)} data-testid="design-input" />
        <Button type="button" onClick={() => inputRef.current?.click()}><Upload /> Pilih file</Button>
      </div>
      <p className="text-xs text-slate-500">PNG/JPG/TIFF/WebP divalidasi otomatis (4K & DPI). PSD/AI/CDR/PDF disimpan dengan status "cek manual". File langsung ke Google Drive (maks 5 GB), tidak lewat server.</p>
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.key} className="rounded-md bg-slate-50 p-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{it.file.name}</span>
                <span className="text-xs text-slate-500">{fmtBytes(it.file.size)}</span>
                {it.state === "upload" && (
                  <Button size="icon" variant="ghost" aria-label="Batalkan" onClick={() => aborts.current.get(it.key)?.abort()}><X /></Button>
                )}
                {it.state === "gagal" && it.file.size > 0 && it.file.size <= MAX_BYTES && (
                  <Button size="sm" variant="outline" onClick={() => run(it)}><RotateCw /> Ulangi</Button>
                )}
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={it.progress} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full transition-all ${it.state === "gagal" ? "bg-red-500" : it.state === "selesai" ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${it.progress}%` }} />
              </div>
              <p className={`mt-1 text-xs ${it.state === "gagal" ? "text-red-600" : "text-slate-500"}`}>
                {it.state === "antri" && "Menunggu…"}
                {it.state === "upload" && (it.message ?? `Mengunggah ${it.progress}%`)}
                {it.state === "proses" && it.message}
                {it.state === "selesai" && `✓ ${it.message ?? "Tersimpan"}`}
                {it.state === "gagal" && it.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
