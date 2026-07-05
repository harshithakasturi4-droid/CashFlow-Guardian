import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { appRoute } from "./app";
import { dataApi } from "../lib/api";
import { formatINR, todayIso } from "../lib/utils";
import { Button, Card, Field, Input, Textarea } from "../components/ui";
import { PageHeader } from "../components/page-header";

export const lendingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "lending",
  component: LendingPage
});

function LendingPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ borrower_name: "", amount: "", lent_on: todayIso(), due_on: todayIso(), notes: "" });
  const { data } = useQuery({
    queryKey: ["loans_out"],
    queryFn: () => dataApi.query("loans_out", { sort: [{ field: "due_on", direction: "asc" }] })
  });
  const addLoan = useMutation({
    mutationFn: () => dataApi.upsert("loans_out", { ...form, amount: Number(form.amount || 0), status: "pending" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans_out"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setForm({ borrower_name: "", amount: "", lent_on: todayIso(), due_on: todayIso(), notes: "" });
    }
  });
  const updateLoan = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      dataApi.patch("loans_out", { id: { eq: id } }, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loans_out"] })
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Lending" blurb="Track customer credit and keep overdue follow-up visible." />
      <Card className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Borrower name">
            <Input value={form.borrower_name} onChange={(event) => setForm({ ...form, borrower_name: event.target.value })} />
          </Field>
          <Field label="Amount">
            <Input type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
          </Field>
          <Field label="Lent on">
            <Input type="date" value={form.lent_on} onChange={(event) => setForm({ ...form, lent_on: event.target.value })} />
          </Field>
          <Field label="Due on">
            <Input type="date" value={form.due_on} onChange={(event) => setForm({ ...form, due_on: event.target.value })} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
        <Button onClick={() => addLoan.mutate()}>Add customer debt</Button>
      </Card>
      <Card>
        <div className="space-y-3">
          {(data?.data || []).map((loan) => (
            <div key={String(loan.id)} className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{String(loan.borrower_name)}</p>
                  <p className="text-sm text-slate-500">Due {String(loan.due_on)} | {String(loan.status)}</p>
                </div>
                <p className="font-semibold">{formatINR(Number(loan.amount || 0))}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <Button className="bg-slate-900" onClick={() => updateLoan.mutate({ id: String(loan.id), status: "returned" })}>Returned</Button>
                <Button className="bg-[hsl(var(--danger))]" onClick={() => updateLoan.mutate({ id: String(loan.id), status: "overdue" })}>Overdue</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
