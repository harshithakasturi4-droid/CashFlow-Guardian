import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { appRoute } from "./app";
import { dataApi } from "../lib/api";
import { todayIso } from "../lib/utils";
import { Button, Card, Field, Input, Textarea } from "../components/ui";
import { PageHeader } from "../components/page-header";

export const dailyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "daily",
  component: DailyPage
});

function DailyPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ date: todayIso(), sales: "", expenses: "", cash_in_hand: "", notes: "" });
  const { data } = useQuery({
    queryKey: ["daily_updates"],
    queryFn: () => dataApi.query("daily_updates", { sort: [{ field: "date", direction: "desc" }] })
  });
  const mutation = useMutation({
    mutationFn: () =>
      dataApi.upsert("daily_updates", {
        ...form,
        sales: Number(form.sales || 0),
        expenses: Number(form.expenses || 0),
        cash_in_hand: Number(form.cash_in_hand || 0)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily_updates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Daily Log" blurb="Close the day with your actual drawer cash and ledger totals." />
      <Card className="grid gap-4">
        <Field label="Date">
          <Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Sales">
            <Input type="number" value={form.sales} onChange={(event) => setForm({ ...form, sales: event.target.value })} />
          </Field>
          <Field label="Expenses">
            <Input type="number" value={form.expenses} onChange={(event) => setForm({ ...form, expenses: event.target.value })} />
          </Field>
          <Field label="Cash in drawer">
            <Input type="number" value={form.cash_in_hand} onChange={(event) => setForm({ ...form, cash_in_hand: event.target.value })} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
        <Button onClick={() => mutation.mutate()}>Save daily update</Button>
      </Card>
      <Card>
        <div className="space-y-3">
          {(data?.data || []).map((row) => (
            <div key={String(row.id)} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <p className="font-medium">{String(row.date)}</p>
              <p className="text-slate-500">Sales {String(row.sales)} | Expenses {String(row.expenses)} | Cash {String(row.cash_in_hand)}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
