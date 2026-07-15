import { Link, createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { appRoute } from "./app";
import { dataApi } from "../lib/api";
import { formatINR } from "../lib/utils";
import { MetricCard } from "../components/metric-card";
import { Button, Card } from "../components/ui";
import { PageHeader } from "../components/page-header";
import { VoiceLoggerModal } from "../components/voice-logger";
import { VoiceInsightsCard } from "../components/voice-insights";
import { X } from "lucide-react";
import type { TableRow } from "../types";

export const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: DashboardPage
});

function DashboardPage() {
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [successVoiceLog, setSuccessVoiceLog] = useState<{ transcript: string; count: number } | null>(null);

  const { data, refetch } = useQuery({ queryKey: ["dashboard"], queryFn: dataApi.dashboard });
  const { data: transactions } = useQuery({
    queryKey: ["transactions", "dashboard"],
    queryFn: () => dataApi.query("transactions", { sort: [{ field: "date", direction: "asc" }], limit: 200 })
  });
  const { data: loans } = useQuery({
    queryKey: ["loans_out", "dashboard"],
    queryFn: () => dataApi.query("loans_out", { sort: [{ field: "due_on", direction: "asc" }], limit: 100 })
  });

  const txRows = transactions?.data || [];
  const loanRows = loans?.data || [];
  const totals = useMemo(() => getTotals(txRows, data?.cash_in_hand ?? 0), [txRows, data?.cash_in_hand]);
  const chartRows = useMemo(() => getLastSixMonthRows(txRows), [txRows]);
  const forecast = useMemo(() => getCashForecast(txRows, totals.cash), [txRows, totals.cash]);
  const expenseTips = useMemo(() => getExpenseTips(txRows), [txRows]);
  const overdueLoans = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return loanRows.filter((loan) => String(loan.status) !== "returned" && new Date(String(loan.due_on)).getTime() <= today.getTime());
  }, [loanRows]);
  const dueReminders = useMemo(() => {
    return (data as any)?.due_reminders || [];
  }, [data]);
  const healthScore = useMemo(() => {
    const expenseControl = totals.revenue > 0 ? Math.max(0, 35 - Math.round((totals.expenses / totals.revenue) * 25)) : 18;
    const cashStability = forecast.shortage ? 12 : totals.cash > totals.averageWeeklyExpense * 2 ? 35 : 22;
    const paymentRisk = Math.max(0, 30 - dueReminders.length * 5 - overdueLoans.length * 8);
    return Math.min(100, Math.max(0, expenseControl + cashStability + paymentRisk));
  }, [totals, forecast.shortage, dueReminders.length, overdueLoans.length]);
  const alerts = useMemo(
    () => getAlerts({ forecast, totals, dueReminders, overdueLoans, expenseTips }),
    [forecast, totals, dueReminders, overdueLoans, expenseTips]
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader title="Dashboard" blurb="Stay ahead of cash and compliance" />
        <button
          onClick={() => setIsVoiceOpen(true)}
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-md hover:-translate-y-0.5 hover:bg-slate-800 transition-all self-start sm:self-auto gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          <span>Speak Expense</span>
        </button>
      </div>

      {/* Voice Success Toast */}
      {successVoiceLog && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-800 shadow-sm animate-fade-in flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-700 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-emerald-900">Voice Expense Logged!</p>
              <p className="text-emerald-700 mt-0.5">
                Parsed: <span className="italic font-medium">"{successVoiceLog.transcript}"</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Successfully created {successVoiceLog.count} transaction(s).
              </p>
            </div>
          </div>
          <button 
            onClick={() => setSuccessVoiceLog(null)}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Reminders Warning Alert Banner */}
      {((data as any)?.due_today_count > 0 || (data as any)?.overdue_count > 0) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-slate-800 shadow-sm animate-pulse-subtle flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="rounded-full bg-rose-100 p-2 text-rose-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-rose-900">Task & Payment Reminders Alert</p>
              <p className="text-slate-600 mt-0.5">
                You have {(data as any).overdue_count > 0 ? <strong className="text-rose-700 font-bold">{(data as any).overdue_count} overdue</strong> : "0"} reminders and{" "}
                {(data as any).due_today_count > 0 ? <strong className="text-amber-700 font-bold">{(data as any).due_today_count} due today</strong> : "0"}.
              </p>
            </div>
          </div>
          <Link 
            to="/reminders" 
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 text-xs font-bold shadow-sm transition hover:-translate-y-0.5"
          >
            Review Reminders
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total revenue" value={formatINR(totals.revenue)} />
        <MetricCard label="Total expenses" value={formatINR(totals.expenses)} tone={totals.expenses > totals.revenue ? "alert" : "default"} />
        <MetricCard label={totals.profit >= 0 ? "Profit" : "Loss"} value={formatINR(Math.abs(totals.profit))} tone={totals.profit < 0 ? "alert" : "default"} />
        <MetricCard label="Cash available" value={formatINR(totals.cash)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className={healthScore < 45 ? "border-rose-200 bg-rose-50" : healthScore < 70 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}>
          <p className="text-sm font-semibold text-slate-600">Financial health score</p>
          <div className="mt-4 flex items-end gap-3">
            <p className="font-display text-6xl font-bold text-slate-950">{healthScore}</p>
            <p className="pb-2 text-lg font-bold text-slate-500">/ 100</p>
          </div>
          <div className="mt-4 h-3 rounded-full bg-white">
            <div className={`h-3 rounded-full ${healthScore < 45 ? "bg-rose-500" : healthScore < 70 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${healthScore}%` }} />
          </div>
          <p className="mt-4 text-sm text-slate-700">
            {healthScore < 45 ? "Money needs attention now. Check cash, unpaid money, and high expenses." : healthScore < 70 ? "Business is okay, but a few money risks need review." : "Business looks steady. Keep watching payments and spending."}
          </p>
        </Card>

        <Card>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-display text-xl font-bold">Money coming and going</p>
              <p className="mt-1 text-sm text-slate-500">Simple monthly view of income and expenses.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Last 6 months</span>
          </div>
          <div className="mt-5 grid gap-3">
            {chartRows.map((row) => {
              const max = Math.max(row.income, row.expense, 1);
              return (
                <div key={row.label} className="grid gap-2 sm:grid-cols-[5rem_1fr] sm:items-center">
                  <p className="text-sm font-semibold text-slate-600">{row.label}</p>
                  <div className="grid gap-1">
                    <div className="h-3 rounded-full bg-emerald-100"><div className="h-3 rounded-full bg-emerald-600" style={{ width: `${Math.max(4, (row.income / max) * 100)}%` }} /></div>
                    <div className="h-3 rounded-full bg-rose-100"><div className="h-3 rounded-full bg-rose-500" style={{ width: `${Math.max(4, (row.expense / max) * 100)}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs font-semibold text-slate-600">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600" />Money in</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />Money out</span>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <p className="font-display text-xl font-bold">This month</p>
          <div className="mt-4 grid gap-3 text-sm">
            <SummaryLine label="Cash in" value={formatINR(totals.thisMonthIncome)} tone="good" />
            <SummaryLine label="Cash out" value={formatINR(totals.thisMonthExpense)} tone="bad" />
            <SummaryLine label="Net flow" value={formatINR(totals.thisMonthIncome - totals.thisMonthExpense)} tone={totals.thisMonthIncome >= totals.thisMonthExpense ? "good" : "bad"} />
          </div>
        </Card>
        <Card className={forecast.shortage ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}>
          <p className="font-display text-xl font-bold">Cash prediction</p>
          <p className="mt-3 text-sm text-slate-700">
            {forecast.shortage ? "Warning: Cash shortage may occur next month." : "Cash looks enough for the next few weeks."}
          </p>
          <p className="mt-4 text-3xl font-bold text-slate-950">{formatINR(forecast.nextMonthCash)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Estimated cash after next month</p>
        </Card>
        <Card>
          <p className="font-display text-xl font-bold">Quick actions</p>
          <div className="mt-4 grid gap-2">
            <Button className="justify-start bg-slate-950">Review expense</Button>
            <Button className="justify-start bg-amber-600">Send reminder</Button>
            <Button className="justify-start bg-emerald-700">Add today&apos;s cash</Button>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <p className="font-display text-xl font-bold">Warnings</p>
          <div className="mt-4 grid gap-3">
            {alerts.map((alert) => (
              <div key={alert.title} className={`rounded-lg border px-4 py-3 ${alert.tone === "red" ? "border-rose-200 bg-rose-50 text-rose-900" : alert.tone === "yellow" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                <p className="font-bold">{alert.title}</p>
                <p className="mt-1 text-sm">{alert.why}</p>
                <p className="mt-2 text-sm font-semibold">{alert.next}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="font-display text-xl font-bold">Business tips</p>
          <div className="mt-4 grid gap-3">
            {expenseTips.slice(0, 4).map((tip) => (
              <div key={tip.title} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-bold text-slate-900">{tip.title}</p>
                <p className="mt-1 text-sm text-slate-600">{tip.text}</p>
              </div>
            ))}
          </div>
        </Card>

        <VoiceInsightsCard />
      </div>

      <VoiceLoggerModal 
        isOpen={isVoiceOpen} 
        onClose={() => setIsVoiceOpen(false)} 
        onSuccess={(transcript, expenses) => {
          setSuccessVoiceLog({ transcript, count: expenses.length });
          refetch();
        }}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-xl font-bold">Due reminders</p>
            <p className="mt-1 text-sm text-slate-500">
              {dueReminders.length ? `${dueReminders.length} active reminders need your attention.` : "No reminders are due right now."}
            </p>
          </div>
          <div className={`inline-flex w-fit items-center rounded-full px-4 py-2 text-sm font-bold ${dueReminders.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
            {dueReminders.length ? "Action needed" : "All clear"}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dueReminders.slice(0, 6).map((item: any) => {
            const isOverdue = item.status === "overdue";
            return (
              <div 
                key={String(item.id)} 
                className={`rounded-2xl border p-4 text-sm flex flex-col justify-between ${
                  isOverdue 
                    ? "border-rose-200 bg-rose-50 text-rose-950 shadow-sm" 
                    : "border-amber-200 bg-amber-50 text-amber-950 shadow-sm"
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <p className="font-semibold text-slate-900 truncate">{String(item.title)}</p>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0 ${
                      isOverdue ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {isOverdue ? "Overdue" : "Due Today"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Category: {String(item.category)}
                  </p>
                  {item.amount && (
                    <p className="mt-2 font-bold text-base text-slate-900">
                      ₹{item.amount.toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  {new Date(String(item.dueDate || item.due_at)).toLocaleString("en-IN")}
                </p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SummaryLine({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
      <span className="font-semibold text-slate-600">{label}</span>
      <span className={`font-bold ${tone === "good" ? "text-emerald-700" : "text-rose-700"}`}>{value}</span>
    </div>
  );
}

function getDate(row: TableRow) {
  return new Date(String(row.date || row.created_at || ""));
}

function getTotals(rows: TableRow[], dashboardCash: number) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const revenue = rows.filter((row) => row.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenses = rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const thisMonthRows = rows.filter((row) => String(row.date || "").startsWith(monthKey));
  const thisMonthIncome = thisMonthRows.filter((row) => row.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const thisMonthExpense = thisMonthRows.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const averageWeeklyExpense = expenses / Math.max(1, Math.ceil(rows.length / 7));
  return {
    revenue,
    expenses,
    profit: revenue - expenses,
    cash: dashboardCash || Math.max(0, revenue - expenses),
    thisMonthIncome,
    thisMonthExpense,
    averageWeeklyExpense
  };
}

function getLastSixMonthRows(rows: TableRow[]) {
  const formatter = new Intl.DateTimeFormat("en-IN", { month: "short" });
  return Array.from({ length: 6 }).map((_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthRows = rows.filter((row) => String(row.date || "").startsWith(key));
    return {
      label: formatter.format(date),
      income: monthRows.filter((row) => row.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0),
      expense: monthRows.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amount || 0), 0)
    };
  });
}

function getCashForecast(rows: TableRow[], cash: number) {
  const recent = rows
    .filter((row) => {
      const diffDays = (Date.now() - getDate(row).getTime()) / 86_400_000;
      return diffDays <= 90;
    });
  const monthlyIncome = recent.filter((row) => row.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0) / 3;
  const monthlyExpense = recent.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amount || 0), 0) / 3;
  const nextMonthCash = Math.round(cash + monthlyIncome - monthlyExpense);
  return { nextMonthCash, shortage: nextMonthCash < 0, monthlyIncome, monthlyExpense };
}

function getExpenseTips(rows: TableRow[]) {
  const expenseRows = rows.filter((row) => row.type === "expense");
  const byCategory = expenseRows.reduce<Record<string, number>>((acc, row) => {
    const category = String(row.category || "General");
    acc[category] = (acc[category] || 0) + Number(row.amount || 0);
    return acc;
  }, {});
  const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  const tips = [];
  if (top) {
    tips.push({ title: `${top[0]} costs are high`, text: `You spent ${formatINR(top[1])}. Review this area and remove anything not needed.` });
  }
  tips.push({ title: "Keep emergency cash", text: "Try to keep enough cash for at least 2 weeks of expenses." });
  tips.push({ title: "Check repeated payments", text: "Look for subscriptions, rent, or supplier bills that increased this month." });
  tips.push({ title: "Review inventory purchases", text: "If stock is not selling fast, buy less next time to protect cash." });
  return tips;
}

function getAlerts({
  forecast,
  totals,
  dueReminders,
  overdueLoans,
  expenseTips
}: {
  forecast: ReturnType<typeof getCashForecast>;
  totals: ReturnType<typeof getTotals>;
  dueReminders: TableRow[];
  overdueLoans: TableRow[];
  expenseTips: Array<{ title: string; text: string }>;
}) {
  const alerts = [];
  if (forecast.shortage) {
    alerts.push({ tone: "red", title: "Cash shortage may happen next month", why: "Expected expenses are higher than expected income and current cash.", next: "Next step: collect pending money or delay non-urgent spending." });
  }
  if (totals.thisMonthExpense > totals.thisMonthIncome && totals.thisMonthExpense > 0) {
    alerts.push({ tone: "yellow", title: "Spending is higher than income this month", why: "More cash is going out than coming in.", next: "Next step: review expense." });
  }
  if (dueReminders.length) {
    alerts.push({ tone: "yellow", title: `${dueReminders.length} payments need attention`, why: "Some reminders are due now.", next: "Next step: pay or follow up today." });
  }
  if (overdueLoans.length) {
    alerts.push({ tone: "red", title: `${overdueLoans.length} customer payments are late`, why: "Late customer money can reduce available cash.", next: "Next step: send reminder." });
  }
  if (!alerts.length) {
    alerts.push({ tone: "green", title: "No urgent money problem found", why: "Cash, expenses, and reminders look manageable right now.", next: "Next step: keep adding daily records." });
  }
  if (expenseTips[0]) {
    alerts.push({ tone: "yellow", title: "High-cost area found", why: expenseTips[0].text, next: "Next step: check if this spending is still needed." });
  }
  return alerts.slice(0, 5);
}
