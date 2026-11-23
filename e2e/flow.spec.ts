import { expect, test, type Page } from "@playwright/test";

// Alur penuh lintas peran. Butuh Supabase (lokal/staging) yang sudah di-seed:
//   npx supabase db reset   lalu   E2E_FULL=1 npm run test:e2e
// Data pribadi seed yang TIDAK boleh muncul di layar produksi/finishing:
const PRIVATE = ["0812-3456-0001", "081234560001", "Jl. Melati", "0857-1111-2222", "Perum Asri", "0819-2020-3030", "Ruko Plaza"];
const PASS = "Cetak#2026";

test.skip(!process.env.E2E_FULL, "Set E2E_FULL=1 dengan Supabase ter-seed untuk menjalankan alur penuh");
test.describe.configure({ mode: "serial" });

async function login(page: Page, who: "admin" | "order" | "produksi" | "finishing") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${who}@atelier.test`);
  await page.getByLabel("Password").fill(PASS);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(/\/ringkasan/);
}

async function expectNoPrivateData(page: Page) {
  const html = await page.content();
  for (const p of PRIVATE) expect(html, `bocor: ${p}`).not.toContain(p);
}

test("produksi: hanya nama customer, tidak ada WA/alamat di HTML", async ({ page }) => {
  await login(page, "produksi");
  await page.goto("/produksi");
  await expect(page.getByTestId("order-card").first()).toBeVisible();
  await expectNoPrivateData(page);
  await page.getByTestId("order-card").first().getByRole("link").nth(1).click();
  await expect(page.getByText("Data customer")).toHaveCount(0);
  await expectNoPrivateData(page);
  // menu tim lain tidak ada & akses langsung ditolak
  await expect(page.getByRole("link", { name: "Analisa" })).toHaveCount(0);
  await page.goto("/analisa");
  await expect(page).toHaveURL(/error=akses/);
});

test("produksi memindah Antri → Printing, mundur wajib alasan", async ({ page }) => {
  await login(page, "produksi");
  await page.goto("/produksi");
  const col = page.getByRole("region", { name: "Antri produksi" });
  const card = col.getByTestId("order-card").first();
  const no = await card.getAttribute("data-no");
  await card.getByRole("button", { name: /Printing/ }).click();
  await expect(page.getByRole("region", { name: "Printing" }).locator(`[data-no="${no}"]`)).toBeVisible();
  const moved = page.locator(`[data-no="${no}"]`);
  await moved.getByRole("button", { name: /Kembalikan ke Antri/ }).click();
  await expect(moved.getByRole("button", { name: "Kembalikan ke Antri produksi" })).toBeDisabled();
  await moved.getByPlaceholder(/Alasan/).fill("Cek ulang warna");
  await moved.getByRole("button", { name: "Kembalikan ke Antri produksi" }).click();
  await expect(page.getByRole("region", { name: "Antri produksi" }).locator(`[data-no="${no}"]`)).toContainText("Cek ulang warna");
});

test("finishing: Siap kirim → Dikirim wajib resi", async ({ page }) => {
  await login(page, "finishing");
  await page.goto("/finishing");
  await expectNoPrivateData(page);
  const card = page.getByRole("region", { name: "Siap kirim" }).getByTestId("order-card").first();
  const no = await card.getAttribute("data-no");
  await card.getByRole("button", { name: "Input resi" }).click();
  await card.getByPlaceholder("No. resi").fill("JP9988776655");
  await card.getByPlaceholder(/Kurir/).fill("JNE");
  await card.getByRole("button", { name: "Simpan resi" }).click();
  await expect(page.locator(`[data-no="${no}"]`)).toContainText("JP9988776655");
  await page.locator(`[data-no="${no}"]`).getByRole("button", { name: /Dikirim/ }).click();
  await expect(page.getByRole("region", { name: "Siap kirim" }).locator(`[data-no="${no}"]`)).toHaveCount(0);
});

test("order: buat SPK, tidak bisa kirim ke produksi tanpa file, salin pesan & lacak", async ({ page }) => {
  await login(page, "order");
  await page.goto("/order/baru");
  await page.getByLabel("Nama customer *").fill("Uji Playwright");
  await page.getByLabel("No WhatsApp").fill("0812 7777 4321");
  await page.getByLabel("Qty *").fill("12");
  await page.getByRole("button", { name: /Simpan SPK/ }).click();
  await page.waitForURL(/\/order\/[0-9a-f-]+\?baru=1/);
  await expect(page.getByText("Data customer")).toBeVisible();
  await page.getByRole("button", { name: /Antri produksi/ }).click();
  await expect(page.getByRole("alert")).toContainText("Belum ada file desain");

  const code = (await page.locator("b.font-mono").first().textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  await page.context().clearCookies();
  await page.goto(`/lacak/${code}`);
  await expect(page.getByTestId("track-status")).toHaveText("Pesanan diterima");
  const html = await page.content();
  expect(html).not.toContain("Uji Playwright");
  expect(html).not.toContain("7777");
});

test("order ulang satu klik dari arsip", async ({ page }) => {
  await login(page, "order");
  await page.goto("/arsip?status=selesai");
  await page.getByTestId("reorder").first().click();
  await page.getByRole("button", { name: "Buat order ulang" }).click();
  await page.waitForURL(/\/order\/[0-9a-f-]+$/);
  await expect(page.getByText("Order ulang dari order sebelumnya")).toBeVisible();
  await expect(page.getByTestId("design").first()).toBeVisible();
});

test("lacak dengan no. order + 4 digit WA", async ({ page }) => {
  await login(page, "order");
  await page.goto("/arsip?q=Aisyah");
  const no = (await page.locator("tbody a.font-mono").first().textContent())!.trim();
  await page.context().clearCookies();
  await page.goto("/lacak");
  await page.getByRole("tab", { name: "No. order + WA" }).click();
  await page.getByLabel("Nomor order").fill(no);
  await page.getByLabel("4 digit terakhir no WhatsApp").fill("0001");
  await page.getByRole("button", { name: "Lacak pesanan" }).click();
  await expect(page.getByTestId("track-card")).toContainText(no);
});
