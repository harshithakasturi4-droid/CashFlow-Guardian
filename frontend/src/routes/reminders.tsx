import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { appRoute } from "./app";
import { dataApi } from "../lib/api";
import { Button, Card, Field, Input, Textarea } from "../components/ui";
import { PageHeader } from "../components/page-header";

export const remindersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "reminders",
  component: RemindersPage
});

function RemindersPage() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [form, setForm] = useState({
    title: "",
    category: "payment",
    day: String(now.getDate()),
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    hour: String(now.getHours()).padStart(2, "0"),
    minute: String(now.getMinutes()).padStart(2, "0"),
    notes: ""
  });
  const [error, setError] = useState("");
  const { data } = useQuery({
    queryKey: ["reminders"],
    queryFn: () => dataApi.query("reminders", { sort: [{ field: "due_at", direction: "asc" }], limit: 50 })
  });
  const mutation = useMutation({
    mutationFn: () => {
      const dueAt = buildDueAt(form);
      if (!form.title.trim()) throw new Error("Please enter a reminder title.");
      if (!dueAt) throw new Error("Please enter a valid due date and time.");

      return dataApi.upsert("reminders", {
        title: form.title.trim(),
        category: form.category.trim() || "payment",
        due_at: dueAt,
        notes: form.notes.trim(),
        status: "active"
      });
    },
    onSuccess: () => {
      setForm({
        title: "",
        category: "payment",
        day: String(now.getDate()),
        month: String(now.getMonth() + 1),
        year: String(now.getFullYear()),
        hour: String(now.getHours()).padStart(2, "0"),
        minute: String(now.getMinutes()).padStart(2, "0"),
        notes: ""
      });
      setError("");
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not create reminder.");
    }
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    mutation.mutate();
  };

  const dueNow = useMemo(
    () => (data?.data || []).filter((item) => new Date(String(item.due_at)).getTime() <= Date.now() && item.status === "active"),
    [data]
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Reminders" blurb="Set gentle nudges for payments, inventory, and tax deadlines." />
      {dueNow.length ? (
        <div className="animate-pulse rounded-3xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white">
          Due now: {String(dueNow[0].title)}
        </div>
      ) : null}
      <Card>
        <form className="grid gap-4" onSubmit={handleSubmit}>
        <Field label="Reminder title">
          <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </Field>
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Field label="Category">
            <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
          </Field>
          <div className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">Due at</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Input type="number" min="1" max="31" value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value })} placeholder="Day" />
              <Input type="number" min="1" max="12" value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })} placeholder="Month" />
              <Input type="number" min="2000" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} placeholder="Year" />
              <Input type="number" min="0" max="23" value={form.hour} onChange={(event) => setForm({ ...form, hour: event.target.value })} placeholder="Hour" />
              <Input type="number" min="0" max="59" value={form.minute} onChange={(event) => setForm({ ...form, minute: event.target.value })} placeholder="Minute" />
            </div>
          </div>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
        {error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating..." : "Create reminder"}
        </Button>
        </form>
      </Card>
      <Card>
        <div className="space-y-3">
          {(data?.data || []).map((item) => (
            <div key={String(item.id)} className="rounded-2xl border border-slate-100 px-4 py-3">
              <p className="font-medium">{String(item.title)}</p>
              <p className="text-sm text-slate-500">{String(item.category)} | {new Date(String(item.due_at)).toLocaleString("en-IN")}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function buildDueAt(form: { day: string; month: string; year: string; hour: string; minute: string }) {
  const day = Number(form.day);
  const month = Number(form.month);
  const year = Number(form.year);
  const hour = Number(form.hour);
  const minute = Number(form.minute);

  if (!day || !month || !year || Number.isNaN(hour) || Number.isNaN(minute)) return "";
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute;

  if (!isValid) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}
