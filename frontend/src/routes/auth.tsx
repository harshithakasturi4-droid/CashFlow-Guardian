import { createRoute, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { rootRoute } from "./root";
import { authApi } from "../lib/api";
import { useAuth } from "../state/auth";
import { Button, Card, Field, Input } from "../components/ui";

export const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: AuthPage
});

function AuthPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response =
        mode === "signup" ? await authApi.signup(form) : await authApi.login({ email: form.email, password: form.password });
      setSession(response.token, response.user);
      navigate({ to: "/", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(getFriendlyAuthError(message, mode));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6">
          <p className="font-display text-3xl font-bold">CashFlow Guardian</p>
          <p className="mt-2 text-sm text-slate-600">Track cash, GST, debt, reminders, and bill safety from one place.</p>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          <button type="button" className={`rounded-2xl px-4 py-3 text-sm ${mode === "signup" ? "bg-white shadow-sm" : ""}`} onClick={() => { setMode("signup"); setError(""); }}>
            Sign up
          </button>
          <button type="button" className={`rounded-2xl px-4 py-3 text-sm ${mode === "login" ? "bg-white shadow-sm" : ""}`} onClick={() => { setMode("login"); setError(""); }}>
            Sign in
          </button>
        </div>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <Field label="Display name">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Password">
            <Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </Field>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function getFriendlyAuthError(message: string, mode: "login" | "signup") {
  if (message.includes("Invalid credentials")) return "Email or password is wrong. Please check and try again.";
  if (message.includes("Email already exists")) return "This email already has an account. Tap Sign in instead.";
  if (message.includes("String should have at least 8 characters")) return "Password must be at least 8 characters.";
  if (message.includes("value is not a valid email")) return "Please enter a valid email address.";
  if (message.includes("Failed to fetch")) return "Cannot reach the server. Please make sure the backend is running.";
  return mode === "login" ? "Could not sign in. Please check your details." : "Could not create account. Please check your details.";
}
