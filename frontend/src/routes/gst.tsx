import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { appRoute } from "./app";
import { dataApi } from "../lib/api";
import { formatINR, todayIso } from "../lib/utils";
import { Button, Card, Field, Input } from "../components/ui";
import { PageHeader } from "../components/page-header";

export const gstRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "gst",
  component: GstPage
});

function GstPage() {
  const [range, setRange] = useState({ start: todayIso().slice(0, 8) + "01", end: todayIso() });
  const { data, refetch } = useQuery({
    queryKey: ["gst", range.start, range.end],
    queryFn: () => dataApi.gstSummary(range.start, range.end)
  });

  return (
    <div className="space-y-4">
      <PageHeader title="GST Summaries" blurb="See GST collected, GST paid, and your net payable for any date range." />
      <Card className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <Field label="Start date">
          <Input type="date" value={range.start} onChange={(event) => setRange({ ...range, start: event.target.value })} />
        </Field>
        <Field label="End date">
          <Input type="date" value={range.end} onChange={(event) => setRange({ ...range, end: event.target.value })} />
        </Field>
        <Button className="self-end" onClick={() => refetch()}>Refresh</Button>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-slate-500">GST collected</p><p className="mt-2 font-display text-2xl font-bold">{formatINR(data?.collected ?? 0)}</p></Card>
        <Card><p className="text-sm text-slate-500">GST paid</p><p className="mt-2 font-display text-2xl font-bold">{formatINR(data?.paid ?? 0)}</p></Card>
        <Card><p className="text-sm text-slate-500">Net payable</p><p className="mt-2 font-display text-2xl font-bold">{formatINR(data?.net_payable ?? 0)}</p></Card>
      </div>
    </div>
  );
}
