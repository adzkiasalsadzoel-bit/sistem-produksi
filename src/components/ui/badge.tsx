import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      gray: "bg-slate-100 text-slate-700",
      blue: "bg-blue-100 text-blue-800",
      green: "bg-emerald-100 text-emerald-800",
      amber: "bg-amber-100 text-amber-800",
      red: "bg-red-100 text-red-800",
      violet: "bg-violet-100 text-violet-800",
      brand: "bg-brand/10 text-brand-dark",
    },
  },
  defaultVariants: { tone: "gray" },
});

export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />;
}
