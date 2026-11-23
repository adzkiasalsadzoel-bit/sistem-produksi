// Bar horizontal satu seri (magnitudo) — satu hue, label nilai langsung, tooltip per bar.
export type BarRow = { label: string; value: number; display?: string; highlight?: boolean; hint?: string };

export function BarList({ rows, unit = "", emptyText = "Belum ada data" }: { rows: BarRow[]; unit?: string; emptyText?: string }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="group grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-2 text-sm" title={r.hint ?? `${r.label}: ${r.display ?? r.value}${unit}`}>
          <span className="truncate text-slate-700">{r.label}</span>
          <span className="h-2.5 rounded-full bg-slate-100">
            <span
              className={`block h-full rounded-full transition-opacity group-hover:opacity-80 ${r.highlight ? "bg-red-600" : "bg-brand"}`}
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="min-w-12 text-right font-semibold tabular-nums text-slate-900">{r.display ?? r.value}{unit}</span>
        </li>
      ))}
    </ul>
  );
}
