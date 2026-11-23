import { expect, test } from "@playwright/test";

// Tidak butuh data: halaman publik & proteksi route

test("halaman staf terkunci → diarahkan ke login", async ({ page }) => {
  for (const path of ["/ringkasan", "/produksi", "/order/baru", "/analisa", "/tv"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});

test("API terlindungi tanpa sesi", async ({ request }) => {
  const r = await request.get("/api/export/repeat-customers?format=wa");
  expect(r.status()).toBe(401);
  const s = await request.post("/api/drive/session", { data: {} });
  expect(s.status()).toBe(401);
});

test("halaman login", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sistem Produksi Cetak" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("link", { name: /Lacak pesanan/ })).toHaveAttribute("href", "/lacak");
});

test("halaman lacak publik tanpa login + tab no. order", async ({ page }) => {
  await page.goto("/lacak");
  await expect(page.getByRole("heading", { name: "Lacak pesanan" })).toBeVisible();
  await page.getByRole("tab", { name: "No. order + WA" }).click();
  await expect(page.getByLabel("4 digit terakhir no WhatsApp")).toBeVisible();
});

test("kode lacak tidak valid → tidak ditemukan", async ({ page }) => {
  const r = await page.goto("/lacak/OOOO0000");
  expect(r?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Pesanan tidak ditemukan" })).toBeVisible();
});

test("tombol & input ≥ 44px (dipakai di HP)", async ({ page }) => {
  for (const path of ["/login", "/lacak"]) {
    await page.goto(path);
    const els = page.locator("button:visible, input:not([type=hidden]):visible");
    const n = await els.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const box = await els.nth(i).boundingBox();
      expect(box!.height, `${path} elemen #${i}`).toBeGreaterThanOrEqual(44);
    }
  }
});

test("tidak ada scroll horizontal di HP", async ({ page }) => {
  await page.goto("/lacak");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
