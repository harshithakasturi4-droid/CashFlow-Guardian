export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type DashboardData = {
  cash_in_hand: number;
  weekly_sales: number;
  weekly_expenses: number;
  active_loans: number;
  expense_alert: boolean;
  due_reminders: Array<{ id: string; title: string; due_at: string }>;
  due_today_count?: number;
  overdue_count?: number;
};

export type TableRow = Record<string, unknown>;
