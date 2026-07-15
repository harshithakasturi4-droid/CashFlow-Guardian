import { Card } from "./ui";

export function MetricCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "alert" }) {
  return (
    <Card className={tone === "alert" ? "border-rose-200 bg-rose-50/85" : ""}>
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-3 font-display text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">{value}</p>
    </Card>
  );
}
