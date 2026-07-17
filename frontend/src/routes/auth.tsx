import { createRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SignIn, SignUp, useAuth as useClerkAuth } from "@clerk/react";
import { rootRoute } from "./root";
import { Card } from "../components/ui";

export const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/*",
  component: AuthPage,
});

function AuthPage() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate({ to: "/", replace: true });
    }
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6">
          <p className="font-display text-3xl font-bold">
            CashFlow Guardian
          </p>

          <p className="mt-2 text-sm text-slate-600">
            Track cash, GST, debt, reminders, and bill safety from one place.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            className={`rounded-2xl px-4 py-3 text-sm ${
              mode === "signup" ? "bg-white shadow-sm" : ""
            }`}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>

          <button
            type="button"
            className={`rounded-2xl px-4 py-3 text-sm ${
              mode === "login" ? "bg-white shadow-sm" : ""
            }`}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
        </div>

        <div className="mt-6 flex justify-center">
          {mode === "login" ? (
            <SignIn
              path="/auth"
              routing="path"
              fallbackRedirectUrl="/"
            />
          ) : (
            <SignUp
              path="/auth"
              routing="path"
              fallbackRedirectUrl="/"
            />
          )}
        </div>
      </Card>
    </div>
  );
}