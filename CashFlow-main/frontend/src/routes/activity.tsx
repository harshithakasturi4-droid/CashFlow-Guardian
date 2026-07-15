import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { appRoute } from "./app";
import { dataApi } from "../lib/api";
import { Card, Field, Input } from "../components/ui";
import { PageHeader } from "../components/page-header";

export const activityRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "activity",
  component: ActivityPage
});

function ActivityPage() {
  const [filters, setFilters] = useState({ search: "", action: "", record: "", start: "", end: "" });
  const { data } = useQuery({
    queryKey: ["audit_events"],
    queryFn: () => dataApi.query("audit_events", { sort: [{ field: "created_at", direction: "desc" }], limit: 100 })
  });
  const events = data?.data || [];
  const visibleEvents = useMemo(() => {
    return events.filter((event) => {
      const text = `${event.record_id || ""} ${event.record_type || ""} ${event.description || ""} ${event.actor || ""}`.toLowerCase();
      const created = new Date(String(event.created_at)).getTime();
      const afterStart = filters.start ? created >= new Date(filters.start).getTime() : true;
      const beforeEnd = filters.end ? created <= new Date(`${filters.end}T23:59:59`).getTime() : true;
      return (
        text.includes(filters.search.toLowerCase()) &&
        (!filters.action || String(event.action) === filters.action) &&
        (!filters.record || String(event.record_type) === filters.record) &&
        afterStart &&
        beforeEnd
      );
    });
  }, [events, filters]);
  const actions = Array.from(new Set(events.map((event) => String(event.action)).filter(Boolean)));
  const records = Array.from(new Set(events.map((event) => String(event.record_type)).filter(Boolean)));

  return (
    <div className="space-y-5">
      <PageHeader title="Activity" blurb="A simple audit trail for every important money action." />
      <Card className="grid gap-4">
        <Field label="Search activity">
          <Input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Invoice ID, customer, user, or action" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From date">
            <Input type="date" value={filters.start} onChange={(event) => setFilters({ ...filters, start: event.target.value })} />
          </Field>
          <Field label="To date">
            <Input type="date" value={filters.end} onChange={(event) => setFilters({ ...filters, end: event.target.value })} />
          </Field>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>Action</span>
            <select className="min-h-12 rounded-xl border border-[hsl(var(--border))] bg-white px-4" value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}>
              <option value="">All actions</option>
              {actions.map((action) => <option key={action} value={action}>{action}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>Record type</span>
            <select className="min-h-12 rounded-xl border border-[hsl(var(--border))] bg-white px-4" value={filters.record} onChange={(event) => setFilters({ ...filters, record: event.target.value })}>
              <option value="">All records</option>
              {records.map((record) => <option key={record} value={record}>{record}</option>)}
            </select>
          </label>
        </div>
      </Card>
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-display text-xl font-bold">Recent actions</p>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{visibleEvents.length} shown</span>
        </div>
        <div className="space-y-3">
          {visibleEvents.map((event) => (
            <div key={String(event.id)} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-bold text-slate-950">{simpleAction(String(event.action))}</p>
                  <p className="mt-1 text-sm text-slate-600">{String(event.description)}</p>
                </div>
                <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">{String(event.record_type)}</span>
              </div>
              <div className="mt-3 grid gap-1 text-xs font-medium text-slate-500 sm:grid-cols-3">
                <span>{new Date(String(event.created_at)).toLocaleString("en-IN")}</span>
                <span>{String(event.actor || "Owner")}</span>
                <span>{String(event.record_id || "")}</span>
              </div>
            </div>
          ))}
          {!visibleEvents.length ? <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No activity matches these filters.</p> : null}
        </div>
      </Card>
    </div>
  );
}

function simpleAction(action: string) {
  const labels: Record<string, string> = {
    login: "Logged in",
    logout: "Logged out",
    signup: "Created account",
    upsert: "Record saved",
    patch: "Record edited",
    delete: "Record deleted",
    analyze: "Receipt checked",
    flagged: "Needs review"
  };
  return labels[action] || action;
}
