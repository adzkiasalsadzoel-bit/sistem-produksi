import { requireStaff } from "@/lib/auth";
import { boardData } from "@/lib/queries";
import { PageHeader } from "@/components/common/page-header";
import { Kanban } from "@/components/orders/kanban";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { TEAM_STAGES } from "@/lib/status";

export const metadata = { title: "Papan Produksi" };

export default async function ProduksiPage() {
  const { supabase, profile } = await requireStaff(["admin", "produksi"]);
  const stages = TEAM_STAGES.produksi;
  const { orders, designs, previews } = await boardData(supabase, stages);
  return (
    <>
      <PageHeader title="Papan Produksi" description="Antri → Printing → Press. Urut prioritas & deadline." actions={<RealtimeRefresh />} />
      <Kanban stages={stages} orders={orders} designs={designs} previews={previews} role={profile.role} />
    </>
  );
}
