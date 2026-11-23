import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/common/page-header";
import { OrderForm } from "@/components/orders/order-form";
import { createOrderAction } from "@/app/(dash)/actions";
import { getSettings } from "@/lib/queries";
import { addDays, todayJakarta } from "@/lib/dates";

export const metadata = { title: "SPK Baru" };

export default async function NewOrderPage() {
  const { supabase } = await requireStaff(["admin", "order"]);
  const s = await getSettings(supabase);
  const lead = Number(s.lead_time_default_hari ?? 3);
  return (
    <>
      <PageHeader title="Buat SPK baru" description="Setelah disimpan, upload file desain lalu kirim ke produksi." />
      <OrderForm action={createOrderAction} initial={{ deadline: addDays(todayJakarta(), lead) }} submitLabel="Simpan SPK & lanjut upload desain" />
    </>
  );
}
