import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { BellRing, BookMarked, ChartNoAxesCombined, FileScan, HandCoins, Landmark, LogOut, Menu, ReceiptText, Shield, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../state/auth";
import { cn } from "../lib/utils";
import { VoiceAssistant } from "./voice-assistant";

const navItems = [
  { to: "/", label: "Dashboard", icon: ChartNoAxesCombined },
  { to: "/transactions", label: "Money", icon: Landmark },
  { to: "/reminders", label: "Reminders", icon: BellRing },
  { to: "/lending", label: "Lending", icon: HandCoins },
  { to: "/daily", label: "Daily Log", icon: BookMarked },
  { to: "/gst", label: "GST", icon: ReceiptText },
  { to: "/bills", label: "Bills", icon: FileScan },
  { to: "/activity", label: "Activity", icon: Shield }
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setMenuOpen(false);
    navigate({ to: "/auth", replace: true });
  };

  const navLinkClass = (active: boolean) =>
    cn(
      "inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition",
      active ? "bg-[hsl(var(--primary))] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
    );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/82 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="min-w-0" onClick={() => setMenuOpen(false)}>
              <p className="font-display text-lg font-bold tracking-normal text-slate-950">CashFlow Guardian</p>
              <p className="truncate text-sm text-slate-600">Hello {user?.name}. Stay ahead of cash and compliance.</p>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.to;
                return (
                  <Link key={item.to} to={item.to} className={navLinkClass(active)}>
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <button
                className="hidden min-h-10 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 lg:inline-flex"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
              <button
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 lg:hidden"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={menuOpen}
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {menuOpen ? (
            <nav className="mt-3 grid gap-2 rounded-[24px] border border-slate-200 bg-white p-2 shadow-xl lg:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.to;
                return (
                  <Link key={item.to} to={item.to} className={navLinkClass(active)} onClick={() => setMenuOpen(false)}>
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </nav>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col px-4 py-5 sm:px-6 lg:py-8">
        <main className="flex-1">
          <Outlet />
        </main>

        <VoiceAssistant />
      </div>
    </div>
  );
}
