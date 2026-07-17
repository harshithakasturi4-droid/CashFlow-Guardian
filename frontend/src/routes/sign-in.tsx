import { createRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SignIn, useAuth } from "@clerk/react";
import { rootRoute } from "./root";

export const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/sign-in",
  component: SignInPage,
});

function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate({ to: "/", replace: true });
    }
  }, [isLoaded, isSignedIn]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn
        routing="path"
        path="/auth/sign-in"
        signUpUrl="/auth/sign-up"
        fallbackRedirectUrl="/"
      />
    </div>
  );
}