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
  }, [isLoaded, isSignedIn]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp
        routing="path"
        path="/auth/sign-up"
        signInUrl="/auth/sign-in"
        fallbackRedirectUrl="/"
      />
    </div>
  );
}