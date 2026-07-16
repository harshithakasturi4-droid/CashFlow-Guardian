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

interface ReminderData {
  id: string;
  title: string;
  category: string;
  due_at: string;
  notes: string | null;
  amount: number | null;
  status: "pending" | "overdue" | "done";
  created_at: string;
}

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
    notes: "",
    amount: ""
  });
  
  const [error, setError] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Fetch reminders using our custom endpoint which returns dynamic statuses
  const { data } = useQuery({
    queryKey: ["reminders"],
    queryFn: async () => {
      const res = await dataApi.getReminders();
      return res.data as ReminderData[];
    }
  });

  const remindersList = data || [];

  // Create reminder mutation
  const createMutation = useMutation({
    mutationFn: () => {
      const dueAt = buildDueAt(form);
      if (!form.title.trim()) throw new Error("Please enter a reminder title.");
      if (!dueAt) throw new Error("Please enter a valid due date and time.");

      return dataApi.upsert("reminders", {
        title: form.title.trim(),
        category: form.category.trim() || "payment",
        due_at: dueAt,
        notes: form.notes.trim(),
        amount: form.amount ? parseFloat(form.amount) : null,
        status: "pending" // Default to pending
      });
    },
    onSuccess: () => {
      const resetDate = new Date();
      setForm({
        title: "",
        category: "payment",
        day: String(resetDate.getDate()),
        month: String(resetDate.getMonth() + 1),
        year: String(resetDate.getFullYear()),
        hour: String(resetDate.getHours()).padStart(2, "0"),
        minute: String(resetDate.getMinutes()).padStart(2, "0"),
        notes: "",
        amount: ""
      });
      setError("");
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not create reminder.");
    }
  });

  // Mark done mutation
  const doneMutation = useMutation({
    mutationFn: (id: string) => dataApi.markReminderDone(id),
    onSuccess: () => {
      setConfirmingId(null);
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: any) => {
      alert(err.message || "Failed to complete reminder");
    }
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    createMutation.mutate();
  };

  // Group reminders by computed status
  const groupedReminders = useMemo(() => {
    const todayStr = now.toISOString().split("T")[0];
    
    const overdue: ReminderData[] = [];
    const dueToday: ReminderData[] = [];
    const upcoming: ReminderData[] = [];
    const done: ReminderData[] = [];

    remindersList.forEach((item) => {
      if (item.status === "done") {
        done.push(item);
      } else if (item.status === "overdue") {
        overdue.push(item);
      } else {
        const dueLocalDateStr = new Date(item.due_at).toISOString().split("T")[0];
        if (dueLocalDateStr === todayStr) {
          dueToday.push(item);
        } else {
          upcoming.push(item);
        }
      }
    });

    return { overdue, dueToday, upcoming, done };
  }, [remindersList]);

  const hasAlerts = groupedReminders.overdue.length > 0 || groupedReminders.dueToday.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Reminders & Alerts" blurb="Track payment deadlines, customer EMIs, and inventory runs with auto-overdue tracking." />
      
      {/* Alert Banner */}
      {hasAlerts && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-slate-800 animate-pulse-subtle flex items-start space-x-3 shadow-sm">
          <div className="rounded-full bg-rose-100 p-2 text-rose-600 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-rose-900">Attention Required</p>
            <p className="text-slate-600 mt-0.5">
              You have {groupedReminders.overdue.length} overdue payments/tasks and {groupedReminders.dueToday.length} due today. Please action them to keep cash flow steady.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Creation Panel */}
        <div className="lg:col-span-1">
          <Card className="h-fit shadow-md">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-display text-lg font-bold text-slate-800">Add Reminder</h3>
              <p className="text-xs text-slate-500 mt-0.5">Set a task with optional amounts</p>
            </div>
            
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <Field label="Reminder Title / Reason">
                <Input 
                  value={form.title} 
                  onChange={(event) => setForm({ ...form, title: event.target.value })} 
                  placeholder="e.g., GST filing, customer EMI"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <Input 
                    value={form.category} 
                    onChange={(event) => setForm({ ...form, category: event.target.value })} 
                    placeholder="e.g., payment, stock"
                  />
                </Field>
                <Field label="Amount (Optional, ₹)">
                  <Input 
                    type="number"
                    min="0"
                    value={form.amount} 
                    onChange={(event) => setForm({ ...form, amount: event.target.value })} 
                    placeholder="e.g., 5000"
                  />
                </Field>
              </div>

              <div className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Due Date & Time</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-400 text-center font-bold">Day</span>
                    <Input type="number" min="1" max="31" value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-400 text-center font-bold">Month</span>
                    <Input type="number" min="1" max="12" value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-400 text-center font-bold">Year</span>
                    <Input type="number" min="2000" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-400 text-center font-bold">Hr</span>
                    <Input type="number" min="0" max="23" value={form.hour} onChange={(event) => setForm({ ...form, hour: event.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-400 text-center font-bold">Min</span>
                    <Input type="number" min="0" max="59" value={form.minute} onChange={(event) => setForm({ ...form, minute: event.target.value })} />
                  </div>
                </div>
              </div>

              <Field label="Notes / Description">
                <Textarea 
                  value={form.notes} 
                  onChange={(event) => setForm({ ...form, notes: event.target.value })} 
                  placeholder="Additional details..."
                />
              </Field>

              {error ? <p className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs font-semibold text-rose-700">{error}</p> : null}
              
              <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold w-full mt-2">
                {createMutation.isPending ? "Creating..." : "Save Reminder"}
              </Button>
            </form>
          </Card>
        </div>

        {/* Listings Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overdue Section */}
          {groupedReminders.overdue.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-display text-base font-bold text-rose-800 flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-rose-600 animate-ping"></span>
                <span>Overdue ({groupedReminders.overdue.length})</span>
              </h4>
              <div className="grid gap-3">
                {groupedReminders.overdue.map((item) => (
                  <ReminderCard 
                    key={item.id} 
                    item={item} 
                    tone="overdue" 
                    confirmingId={confirmingId}
                    setConfirmingId={setConfirmingId}
                    onConfirmDone={(id) => doneMutation.mutate(id)}
                    donePending={doneMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Due Today Section */}
          {groupedReminders.dueToday.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-display text-base font-bold text-amber-800 flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                <span>Due Today ({groupedReminders.dueToday.length})</span>
              </h4>
              <div className="grid gap-3">
                {groupedReminders.dueToday.map((item) => (
                  <ReminderCard 
                    key={item.id} 
                    item={item} 
                    tone="today" 
                    confirmingId={confirmingId}
                    setConfirmingId={setConfirmingId}
                    onConfirmDone={(id) => doneMutation.mutate(id)}
                    donePending={doneMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pending Section */}
          <div className="space-y-3">
            <h4 className="font-display text-base font-bold text-slate-700">Upcoming Reminders ({groupedReminders.upcoming.length})</h4>
            {groupedReminders.upcoming.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No upcoming reminders</p>
            ) : (
              <div className="grid gap-3">
                {groupedReminders.upcoming.map((item) => (
                  <ReminderCard 
                    key={item.id} 
                    item={item} 
                    tone="pending" 
                    confirmingId={confirmingId}
                    setConfirmingId={setConfirmingId}
                    onConfirmDone={(id) => doneMutation.mutate(id)}
                    donePending={doneMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Done Section */}
          {groupedReminders.done.length > 0 && (
            <div className="space-y-3 border-t border-slate-100 pt-6">
              <h4 className="font-display text-base font-bold text-slate-500">Completed Reminders ({groupedReminders.done.length})</h4>
              <div className="grid gap-3 opacity-60">
                {groupedReminders.done.slice(0, 10).map((item) => (
                  <ReminderCard 
                    key={item.id} 
                    item={item} 
                    tone="done" 
                    confirmingId={null}
                    setConfirmingId={() => {}}
                    onConfirmDone={() => {}}
                    donePending={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ReminderCardProps {
  item: ReminderData;
  tone: "overdue" | "today" | "pending" | "done";
  confirmingId: string | null;
  setConfirmingId: (id: string | null) => void;
  onConfirmDone: (id: string) => void;
  donePending: boolean;
}

function ReminderCard({ 
  item, 
  tone, 
  confirmingId, 
  setConfirmingId, 
  onConfirmDone, 
  donePending 
}: ReminderCardProps) {
  const isConfirming = confirmingId === item.id;

  const cardStyle = {
    overdue: "border-rose-200 bg-rose-50/40 text-slate-800 shadow-[0_4px_12px_rgba(244,63,94,0.04)]",
    today: "border-amber-200 bg-amber-50/40 text-slate-800 shadow-[0_4px_12px_rgba(245,158,11,0.04)]",
    pending: "border-slate-100 bg-white text-slate-800 shadow-sm",
    done: "border-slate-200 bg-slate-50 text-slate-500"
  }[tone];

  const pillStyle = {
    overdue: "bg-rose-100 text-rose-800 border border-rose-200",
    today: "bg-amber-100 text-amber-800 border border-amber-200",
    pending: "bg-slate-100 text-slate-700 border border-slate-200",
    done: "bg-slate-200 text-slate-500"
  }[tone];

  return (
    <Card className={`border rounded-2xl p-4 transition-all duration-300 ${cardStyle}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${pillStyle}`}>
              {tone === "today" ? "Due Today" : tone}
            </span>
            <span className="text-xs text-slate-400 capitalize">{item.category}</span>
          </div>
          <h4 className={`font-semibold text-base mt-2 ${tone === "done" ? "line-through text-slate-400" : "text-slate-800"}`}>
            {item.title}
          </h4>
          {item.notes && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.notes}</p>
          )}
          
          <div className="flex items-center space-x-4 mt-3">
            <div className="flex items-center space-x-1 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
              </svg>
              <span className="text-xs font-medium">{new Date(item.due_at).toLocaleString("en-IN")}</span>
            </div>
            {item.amount && (
              <p className="text-sm font-bold text-slate-800">
                ₹{item.amount.toLocaleString("en-IN")}
              </p>
            )}
          </div>
        </div>

        {/* Checkbox Action Panel */}
        {tone !== "done" && (
          <div className="flex flex-col items-start sm:items-end justify-center min-w-[140px] border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-4">
            {isConfirming ? (
              <div className="flex flex-col gap-2 w-full animate-fade-in">
                <p className="text-xs font-bold text-rose-700">Confirm Done?</p>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => onConfirmDone(item.id)}
                    disabled={donePending}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex-1"
                  >
                    Yes
                  </button>
                  <button 
                    onClick={() => setConfirmingId(null)}
                    className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex items-center space-x-3 cursor-pointer group select-none py-1">
                <input 
                  type="checkbox"
                  checked={false}
                  onChange={() => setConfirmingId(item.id)}
                  className="h-5 w-5 rounded-lg border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-600 group-hover:text-emerald-700 transition">Mark as done</span>
              </label>
            )}
          </div>
        )}
      </div>
    </Card>
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
