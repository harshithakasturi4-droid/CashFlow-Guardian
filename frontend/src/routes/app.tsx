import { createRoute, redirect } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { AppShell } from "../components/app-shell";

export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: () => {
    if (!localStorage.getItem("cashflow-token") && !localStorage.getItem("authToken")) {
      throw redirect({ to: "/auth" });
    }
  },
  component: AppShell
});
