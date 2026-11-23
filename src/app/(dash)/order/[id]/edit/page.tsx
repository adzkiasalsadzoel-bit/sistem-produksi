import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/common/page-header";
import { OrderForm } from "@/components/orders/order-form";
import { updateOrderAction } from "@/app/(dash)/actions";
import type { Order } from "@/lib/types";

export const metadata = { title: "Edit SPK" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff(["admin", "order"]);
  const { data: o } = await supabase.from("orders").select("*").eq("id", id).maybeSingle<Order>();
  if (!o) notFound();
  const { data: c } = await supabase.rpc("get_order_customer", { p_order: id }).maybeSingle<{ id: string; name: string; wa: string; address: string; email: string; marketplace_ref: string; payment_note: string }>();
  return (
    <>
      <PageHeader title={`Edit SPK ${o.no}`} />
      <OrderForm
        action={updateOrderAction.bind(null, id)}
        submitLabel="Simpan perubahan"
        initial={{
          customer_id: o.customer_id, customer_name: c?.name ?? o.customer_name, customer_wa: c?.wa, customer_address: c?.address,
          customer_email: c?.email, marketplace_ref: c?.marketplace_ref, payment_note: c?.payment_note, channel: o.channel,
          product: o.product, material: o.material, size: o.size, print_width_cm: o.print_width_cm, qty: o.qty, unit: o.unit,
          deadline: o.deadline, priority: o.priority, note_production: o.note_production,
        }}
      />
    </>
  );
}
