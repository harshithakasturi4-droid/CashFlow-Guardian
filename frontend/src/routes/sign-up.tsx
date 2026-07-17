import { createRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SignUp, useAuth } from "@clerk/react";
import { rootRoute } from "./root";

export const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/sign-up",
  component: SignUpPage,
});

function SignUpPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate({ to: "/", replace: true });
    }
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden grid md:grid-cols-2">
        
        {/* Left Side */}
        <div className="hidden md:flex flex-col justify-center bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-12">
          <h1 className="text-5xl font-bold mb-4">
            CashFlow Guardian
          </h1>

          <p className="text-lg text-blue-100 leading-8">
            Manage your business finances in one place.
          </p>

          <ul className="mt-10 space-y-4 text-blue-100">
            <li>📊 Track Income & Expenses</li>
            <li>💰 GST & Tax Management</li>
            <li>⏰ Bill & EMI Reminders</li>
            <li>🤖 AI Financial Assistant</li>
          </ul>
        </div>

        {/* Right Side */}
        <div className="flex flex-col justify-center items-center p-8 md:p-12">

          {/* Mobile Title */}
          <div className="md:hidden text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900">
              CashFlow Guardian
            </h1>
            <p className="mt-2 text-slate-600">
              Create your account
            </p>
          </div>

          <SignUp
            routing="hash"
            signInUrl="/auth/sign-in"
            fallbackRedirectUrl="/"
          />
        </div>
      </div>
    </div>
  );
}
