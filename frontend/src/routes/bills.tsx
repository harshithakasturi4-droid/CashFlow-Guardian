import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { appRoute } from "./app";
import { dataApi } from "../lib/api";
import { Button, Card } from "../components/ui";
import { PageHeader } from "../components/page-header";

export const billsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "bills",
  component: BillsPage
});

function BillsPage() {
  const [analysis, setAnalysis] = useState<{ extracted: Record<string, unknown>; flagged: boolean; reasons: string[] } | null>(null);
  const { data, refetch } = useQuery({
    queryKey: ["bills"],
    queryFn: () => dataApi.query("bills", { sort: [{ field: "created_at", direction: "desc" }] })
  });

  const handleUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const response = await dataApi.analyzeBill(String(reader.result));
      setAnalysis(response);
      refetch();
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Bills Upload" blurb="Scan invoices, extract GST details, and flag suspicious bills before they hurt your books." />
      <Card className="border-dashed">
        <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-3xl bg-slate-50 text-center">
          <span className="font-display text-lg font-bold">Tap to upload invoice</span>
          <span className="mt-2 text-sm text-slate-500">PNG or JPG bill image</span>
          <input type="file" accept="image/*" className="hidden" onChange={(event) => event.target.files?.[0] && handleUpload(event.target.files[0])} />
        </label>
      </Card>
      {analysis ? (
        <Card className={analysis.flagged ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}>
          <p className="font-display text-xl font-bold">{analysis.flagged ? "This bill needs review" : "This bill looks okay"}</p>
          <p className="mt-2 text-sm text-slate-700">
            {analysis.flagged ? "Something does not look right. Check it before paying or filing GST." : "Important bill details were saved for your records."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <BillFact label="Vendor" value={String(analysis.extracted.vendor || "Not found")} />
            <BillFact label="Amount" value={String(analysis.extracted.total_amount || "Not found")} />
            <BillFact label="Bill date" value={String(analysis.extracted.bill_date || "Not found")} />
            <BillFact label="GSTIN" value={String(analysis.extracted.gstin || "Not found")} />
          </div>
          {analysis.reasons.length ? (
            <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-rose-700">
              <p className="font-bold">Why it matters</p>
              <p className="mt-1">{analysis.reasons.join(", ")}</p>
              <p className="mt-2 font-semibold">Next step: Review bill before payment.</p>
            </div>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <div className="space-y-3">
          {(data?.data || []).map((bill) => (
            <div key={String(bill.id)} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{String(bill.vendor || "Unknown vendor")}</p>
                <p className="text-slate-500">{String(bill.bill_date || "")} | {String(bill.bill_number || "")}</p>
              </div>
              <Button className={bill.flagged ? "bg-[hsl(var(--danger))]" : "bg-emerald-600"}>
                {bill.flagged ? "Flagged" : "Looks OK"}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BillFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}
