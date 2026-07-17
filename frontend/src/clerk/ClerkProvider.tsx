import type { PropsWithChildren } from "react";
import { ClerkProvider } from "@clerk/react";

const CLERK_PUBLISHABLE_KEY =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function ClerkAppProvider({
  children,
}: PropsWithChildren) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      signInUrl="/auth/sign-in"
      signUpUrl="/auth/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}