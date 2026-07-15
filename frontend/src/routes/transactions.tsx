import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { appRoute } from "./app";
import { dataApi } from "../lib/api";
import { formatINR, todayIso } from "../lib/utils";
import { Button, Card, Field, Input, Textarea } from "../components/ui";
import { PageHeader } from "../components/page-header";

export const transactionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "transactions",
  component: TransactionsPage
});

function TransactionsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    amount: "",
    category: "General",
    date: todayIso(),
    description: "",
    gst_rate: "18",
    gstin_counterparty: "",
    source: "cash",
    status: "completed",
    taxable: true,
    type: "income",
    vendor: ""
  });

  const { data } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => dataApi.query("transactions", { sort: [{ field: "date", direction: "desc" }], limit: 20 })
  });

  const mutation = useMutation({
    mutationFn: () => {
      const amount = Number(form.amount || 0);
      const gstRate = Number(form.gst_rate || 0);
      const category = form.category === "General" ? suggestCategory(`${form.vendor} ${form.description}`, form.type) : form.category;
      return dataApi.upsert("transactions", {
        ...form,
        amount,
        category,
        gst_rate: gstRate,
        gst_amount: form.taxable ? Math.round((amount * gstRate) / 100) : 0
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setForm({ ...form, amount: "", description: "", vendor: "", gstin_counterparty: "" });
    }
  });

  const gstAmount = form.taxable ? Math.round((Number(form.amount || 0) * Number(form.gst_rate || 0)) / 100) : 0;
  const [year = "", month = "", day = ""] = form.date.split("-");
  const updateDatePart = (part: "day" | "month" | "year", value: string) => {
    const next = {
      day,
      month,
      year,
      [part]: value
    };
    setForm({
      ...form,
      date: `${next.year.padStart(4, "0")}-${next.month.padStart(2, "0")}-${next.day.padStart(2, "0")}`
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Money" blurb="Capture income and expenses with GST-ready fields in a few taps." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)] lg:items-start">
        <Card className="grid gap-5">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            {["income", "expense"].map((type) => (
              <button
                key={type}
                className={`min-h-12 rounded-2xl px-4 text-sm font-bold capitalize transition ${form.type === type ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                onClick={() => setForm({ ...form, type })}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount">
              <Input type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" />
            </Field>
            <div className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Date</span>
              <div className="grid grid-cols-3 gap-2">
                <Input type="number" min="1" max="31" value={Number(day) || ""} onChange={(event) => updateDatePart("day", event.target.value)} placeholder="Day" />
                <Input type="number" min="1" max="12" value={Number(month) || ""} onChange={(event) => updateDatePart("month", event.target.value)} placeholder="Month" />
                <Input type="number" min="2000" value={year} onChange={(event) => updateDatePart("year", event.target.value)} placeholder="Year" />
              </div>
            </div>
            <Field label="Category">
              <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Rent, salary, stock, utilities..." />
            </Field>
            <Field label="Vendor / Customer">
              <Input value={form.vendor} onChange={(event) => setForm({ ...form, vendor: event.target.value })} />
            </Field>
            <Field label="GST rate">
              <Input type="number" value={form.gst_rate} onChange={(event) => setForm({ ...form, gst_rate: event.target.value })} />
            </Field>
            <Field label="Counterparty GSTIN">
              <Input value={form.gstin_counterparty} onChange={(event) => setForm({ ...form, gstin_counterparty: event.target.value.toUpperCase() })} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(event) => {
                const description = event.target.value;
                setForm({
                  ...form,
                  description,
                  category: form.category === "General" ? suggestCategory(`${form.vendor} ${description}`, form.type) : form.category
                });
              }}
              placeholder="Short note for your records"
            />
          </Field>
          <div className="flex flex-col gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 font-medium text-slate-700">
              <input type="checkbox" checked={form.taxable} onChange={(event) => setForm({ ...form, taxable: event.target.checked })} />
              Taxable transaction
            </label>
            <span className="font-bold text-emerald-800">GST amount: {formatINR(gstAmount)}</span>
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save ledger item"}
          </Button>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-xl font-bold">Recent entries</p>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{data?.data?.length || 0}</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">These records are your main proof for cash, GST, and audit checks.</p>
          <div className="mt-4 space-y-3">
            {data?.data?.length ? data.data.map((item) => (
              <div key={String(item.id)} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{String(item.vendor || item.category)}</p>
                  <p className="text-slate-500">{String(item.date)} | {String(item.type)}</p>
                </div>
                <p className="shrink-0 font-bold">{formatINR(Number(item.amount || 0))}</p>
              </div>
            )) : <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No recent entries yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function suggestCategory(text: string, type: string) {
  if (type === "income") return "Sales";
  const value = text.toLowerCase();
  if (/(rent|lease|shop)/.test(value)) return "Rent";
  if (/(salary|wage|staff|worker)/.test(value)) return "Salary";
  if (/(stock|inventory|purchase|supplier|goods)/.test(value)) return "Inventory";
  if (/(electric|power|water|internet|phone|utility)/.test(value)) return "Utilities";
  if (/(ad|marketing|promotion|poster|social)/.test(value)) return "Marketing";
  if (/(fuel|petrol|diesel|delivery|transport)/.test(value)) return "Transport";
  if (/(repair|maintenance|service)/.test(value)) return "Repairs";
  return "General";
}
